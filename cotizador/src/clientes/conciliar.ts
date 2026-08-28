/**
 * Qué le pasa a la ficha del cliente cuando se emite una cotización.
 *
 * Es la regla de oro de todo el hub, escrita en código:
 *
 *   **La ficha manda. La cotización sólo toma prestado.**
 *
 * De ahí salen las cuatro cosas que hace este archivo, y ninguna más:
 *
 * 1. Encuentra la ficha a la que pertenece la cotización —o dice que no hay.
 * 2. Rellena **lo que la ficha tenga vacío**, sin preguntar. No hay nada que
 *    perder al llenar un hueco.
 * 3. **Pregunta** por todo lo que discrepe. Nunca pisa un dato escrito por su
 *    cuenta, y ni siquiera al reemplazar lo pierde: el valor anterior baja a la
 *    lista de adicionales.
 * 4. Con el documento se planta: un NIT distinto no es una corrección, es otro
 *    cliente, y eso no se arregla editando una ficha.
 *
 * Nada de esto ocurre mientras se escribe. Ocurre **al emitir**, una sola vez, y
 * si quien cotiza cancela no se ha guardado nada ni se ha gastado número.
 */

import type { Cliente, Coincidencia, DatosCliente } from '../../../compartido/clientes';
import { clienteVacio } from '../../../compartido/clientes';
import { correoNormal, sinTildes, soloDigitos } from '../../../compartido/texto';
import type { Cotizacion } from '../dominio/tipos';
import type { AlmacenClientes } from './contrato';

/** Un dato de la cotización que no coincide con el de la ficha. */
export interface CambioPropuesto {
  campo: keyof DatosCliente;
  nombre: string;
  actual: string;
  nuevo: string;
  /**
   * Si admite «guardar los dos».
   *
   * Sólo los correos y los teléfonos: una empresa tiene varios y quedarse con
   * uno sería perder información. Una ciudad o una razón social, no: ahí una de
   * las dos está mal.
   */
  admiteAmbos: boolean;
}

export type Resolucion = 'reemplazar' | 'ambos' | 'dejar';

/** Qué campos del cliente viajan dentro de una cotización, y cómo se llaman. */
const CAMPOS: {
  campo: keyof DatosCliente;
  nombre: string;
  deLaCotizacion: (cotizacion: Cotizacion) => string;
  admiteAmbos?: boolean;
}[] = [
  { campo: 'empresa', nombre: 'Empresa', deLaCotizacion: (c) => c.cliente.empresa },
  { campo: 'contacto', nombre: 'Contacto', deLaCotizacion: (c) => c.cliente.contacto },
  { campo: 'telefono', nombre: 'Teléfono', deLaCotizacion: (c) => c.cliente.telefono, admiteAmbos: true },
  { campo: 'correo', nombre: 'Correo', deLaCotizacion: (c) => c.cliente.email, admiteAmbos: true },
  { campo: 'ciudad', nombre: 'Ciudad', deLaCotizacion: (c) => c.cliente.ciudad },
];

/** Lo que hay que decidir antes de tocar nada. */
export interface Plan {
  /** La ficha con la que se va a enlazar. `null` significa «hay que crearla». */
  ficha: Cliente | null;
  /** Una ficha que se le parece y que nadie ha confirmado todavía. */
  parecido: Coincidencia | null;
  /** Campos vacíos de la ficha que esta cotización llena. Van solos. */
  rellenar: { campo: keyof DatosCliente; nombre: string; valor: string }[];
  /** Lo que discrepa. Se pregunta uno por uno. */
  preguntas: CambioPropuesto[];
  /**
   * El documento de la cotización no es el de la ficha.
   *
   * No se ofrece cambiarlo: un NIT distinto significa que se está cotizando a
   * otra empresa, y la salida es elegir o crear la ficha correcta, no reescribir
   * la que hay.
   */
  choqueNit: { actual: string; nuevo: string } | null;
}

/** Si el plan necesita que alguien conteste algo. */
export function hayQuePreguntar(plan: Plan): boolean {
  return plan.parecido !== null || plan.preguntas.length > 0 || plan.choqueNit !== null;
}

/** Lo que el cotizador sabe del cliente, listo para buscar. */
function claveDe(cotizacion: Cotizacion) {
  return {
    nit: cotizacion.cliente.nit,
    correo: cotizacion.cliente.email,
    empresa: cotizacion.cliente.empresa,
  };
}

/**
 * Arma el plan sin tocar nada.
 *
 * Devuelve `null` cuando no hay nada que sincronizar: una cotización sin nombre
 * de cliente no tiene ficha posible, y no es un error —se cotiza así mientras se
 * arma— sino simplemente nada que hacer.
 */
export async function planDe(
  cotizacion: Cotizacion,
  almacen: AlmacenClientes,
): Promise<Plan | null> {
  if (!cotizacion.cliente.empresa.trim()) return null;

  const ficha = await fichaDe(cotizacion, almacen);
  if (!ficha) {
    // Sin ficha conocida, se busca una que se le parezca. Si aparece, no se
    // decide: se pregunta.
    const parecido = await almacen.coincidencia(claveDe(cotizacion));
    if (parecido) {
      return { ficha: null, parecido, rellenar: [], preguntas: [], choqueNit: null };
    }
    return { ficha: null, parecido: null, rellenar: [], preguntas: [], choqueNit: null };
  }

  return { ...compararCon(ficha, cotizacion), ficha, parecido: null };
}

/** La ficha a la que ya está enlazada la cotización, o la que la reclama sola. */
async function fichaDe(cotizacion: Cotizacion, almacen: AlmacenClientes): Promise<Cliente | null> {
  const codigo = cotizacion.clienteCodigo?.trim();
  if (codigo) {
    // Si la ficha se borró de la papelera después de elegirla, el enlace se
    // queda huérfano. No es motivo para no emitir: se busca de nuevo.
    const ficha = await almacen.abrir(codigo).catch(() => null);
    if (ficha) return ficha;
  }

  const hallada = await almacen.coincidencia(claveDe(cotizacion));
  // Sólo el documento idéntico enlaza solo. Lo demás se pregunta.
  return hallada?.fuerte ? hallada.cliente : null;
}

/** Qué llenaría y qué discreparía esta cotización en esa ficha. */
export function compararCon(
  ficha: Cliente,
  cotizacion: Cotizacion,
): Pick<Plan, 'rellenar' | 'preguntas' | 'choqueNit'> {
  const rellenar: Plan['rellenar'] = [];
  const preguntas: CambioPropuesto[] = [];

  for (const { campo, nombre, deLaCotizacion, admiteAmbos } of CAMPOS) {
    const nuevo = deLaCotizacion(cotizacion).trim();
    if (!nuevo) continue;

    const actual = String(ficha[campo] ?? '').trim();
    if (!actual) {
      rellenar.push({ campo, nombre, valor: nuevo });
    } else if (!mismoValor(campo, actual, nuevo)) {
      preguntas.push({ campo, nombre, actual, nuevo, admiteAmbos: admiteAmbos === true });
    }
  }

  return { rellenar, preguntas, choqueNit: choqueDeNit(ficha, cotizacion) };
}

/** El documento se compara por sus dígitos, como en todo el resto del hub. */
function choqueDeNit(ficha: Cliente, cotizacion: Cotizacion): Plan['choqueNit'] {
  const nuevo = soloDigitos(cotizacion.cliente.nit);
  const actual = soloDigitos(ficha.nit);

  if (!nuevo || !actual || nuevo === actual) return null;
  return { actual: ficha.nit, nuevo: cotizacion.cliente.nit };
}

function mismoValor(campo: keyof DatosCliente, a: string, b: string): boolean {
  return campo === 'correo' ? correoNormal(a) === correoNormal(b) : sinTildes(a) === sinTildes(b);
}

/**
 * Aplica el plan y devuelve el código de la ficha.
 *
 * `resoluciones` sólo tiene sentido para las preguntas: lo que no venga
 * contestado **se deja como está**, que es el lado seguro de las dos formas de
 * equivocarse.
 */
export async function aplicar(
  plan: Plan,
  resoluciones: Partial<Record<string, Resolucion>>,
  cotizacion: Cotizacion,
  almacen: AlmacenClientes,
): Promise<string> {
  if (!plan.ficha) {
    const nueva = await almacen.crear(datosDesdeCotizacion(cotizacion));
    return nueva.codigo;
  }

  const datos = datosDe(plan.ficha);

  for (const { campo, valor } of plan.rellenar) {
    Object.assign(datos, { [campo]: valor });
  }

  for (const pregunta of plan.preguntas) {
    const resolucion = resoluciones[pregunta.campo] ?? 'dejar';
    if (resolucion === 'dejar') continue;

    if (resolucion === 'ambos') {
      // El principal se queda donde está y el de la cotización entra como
      // adicional. Es lo que pidió quien contestó: sumar, no cambiar.
      sumarAdicional(datos, pregunta.campo, pregunta.nuevo);
      continue;
    }

    // Reemplazar tampoco pierde nada: el valor anterior baja a los
    // adicionales. Nada se borra nunca desde una cotización.
    //
    // El orden importa y costó una prueba: `sumarAdicional` se niega a añadir
    // algo que ya es el principal, así que hay que poner el nuevo **antes** de
    // bajar el viejo. Al revés, el viejo seguía siendo el principal en ese
    // instante y se descartaba en silencio — perdiendo justo el dato que esta
    // línea existe para conservar.
    Object.assign(datos, { [pregunta.campo]: pregunta.nuevo });
    sumarAdicional(datos, pregunta.campo, pregunta.actual);
  }

  await almacen.actualizar(plan.ficha.codigo, datos);
  return plan.ficha.codigo;
}

/** Manda un correo o un teléfono a la lista de adicionales, sin repetirlo. */
function sumarAdicional(datos: DatosCliente, campo: keyof DatosCliente, valor: string): void {
  const limpio = valor.trim();
  if (!limpio) return;

  if (campo === 'correo') {
    const normal = correoNormal(limpio);
    if (normal === correoNormal(datos.correo)) return;
    if (!datos.correosExtra.some((v) => correoNormal(v) === normal)) {
      datos.correosExtra = [...datos.correosExtra, limpio];
    }
    return;
  }

  if (campo === 'telefono') {
    if (limpio === datos.telefono.trim()) return;
    if (!datos.telefonosExtra.includes(limpio)) {
      datos.telefonosExtra = [...datos.telefonosExtra, limpio];
    }
  }
}

/** La ficha sin lo que pone el servidor, lista para volver a guardarse. */
function datosDe(ficha: Cliente): DatosCliente {
  const { codigo: _c, creadoEn: _ce, actualizadoEn: _ae, eliminadoEn: _ee, eliminadoPor: _ep, ...datos } = ficha;
  return { ...datos, correosExtra: [...datos.correosExtra], telefonosExtra: [...datos.telefonosExtra] };
}

/** Una ficha nueva a partir de lo que la cotización sabe del cliente. */
export function datosDesdeCotizacion(cotizacion: Cotizacion): DatosCliente {
  const { cliente } = cotizacion;
  return {
    ...clienteVacio(),
    empresa: cliente.empresa.trim(),
    nit: cliente.nit.trim(),
    contacto: cliente.contacto.trim(),
    telefono: cliente.telefono.trim(),
    correo: correoNormal(cliente.email),
    ciudad: cliente.ciudad.trim(),
    // Quien firma la cotización es quien lo está atendiendo. Es lo que después
    // decide qué firma lleva el correo que se le mande.
    asesor: cotizacion.asesor ?? '',
  };
}
