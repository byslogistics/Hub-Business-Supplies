/**
 * La carga de clientes por lote: qué viaja y qué se responde.
 *
 * Se hace en **dos pasos y no en uno**, y ésa es toda la idea: primero el
 * servidor mira el archivo y cuenta qué va a pasar con cada fila **sin escribir
 * nada**, y sólo después, con eso a la vista y aprobado, escribe.
 *
 * Es la misma razón por la que el historial tiene papelera. Una carga por lote
 * toca cientos de fichas de una vez; si se equivoca, se equivoca en grande y en
 * silencio. Poner una pantalla en medio convierte «subí el archivo que no era»
 * en un susto de diez segundos.
 */

import { claveDe, type ClaseCoincidencia, type Cliente, type Coincidencia, type DatosCliente } from './clientes';
import { correoNormal, pareceCorreo, sinTildes, soloDigitos } from './texto';

/** Una fila del archivo, ya leída por el navegador. */
export interface FilaImportacion {
  /** Número de fila en la hoja, contando el encabezado. Sirve para señalarla. */
  linea: number;
  /** El código, si el archivo salió de una exportación de aquí mismo. */
  codigo?: string;
  datos: Partial<DatosCliente>;
  /**
   * Qué hacer con una fila dudosa.
   *
   * Sólo se mira en las que la revisión marcó como `revisar`: las que se
   * parecen a una ficha que ya existe sin ser idénticas. En las demás, quien
   * decide es la regla, no quien llama — mandar `decision: 'crear'` en una fila
   * que choca con un NIT ocupado no la crea igual.
   */
  decision?: 'crear' | 'completar' | 'omitir';
}

/** Qué se va a hacer con una fila. */
export type AccionFila =
  /** No existe: se crea. */
  | 'crear'
  /** Existe sin lugar a dudas: se rellena lo que tenga vacío. */
  | 'completar'
  /** Se parece a una que existe. No se toca hasta que alguien lo decida. */
  | 'revisar'
  /** No se puede usar: sin nombre, con un correo imposible, repetida. */
  | 'error'
  /** Alguien decidió dejarla fuera. */
  | 'omitir';

/** Un dato del archivo que discrepa de la ficha, y que **no** se va a pisar. */
export interface Conflicto {
  campo: string;
  actual: string;
  nuevo: string;
}

export interface FilaRevisada {
  linea: number;
  /** Cómo llamarla en pantalla, aunque la fila esté a medias. */
  nombre: string;
  accion: AccionFila;
  /** En español y listo para pintar: por qué esa acción y no otra. */
  motivo: string;
  /** Con qué ficha coincide, cuando coincide con alguna. */
  codigo?: string;
  clase?: ClaseCoincidencia;
  /** Campos vacíos de la ficha que esta fila llenaría. */
  rellenar?: string[];
  /** Lo que discrepa y se queda como está. */
  conflictos?: Conflicto[];
}

export interface RevisionImportacion {
  filas: FilaRevisada[];
  resumen: Record<AccionFila, number>;
}

export interface ResultadoImportacion {
  creados: number;
  completados: number;
  omitidos: number;
  errores: number;
}

/**
 * Cuántas filas se admiten de una vez.
 *
 * No es una restricción de la base, que aguantaría muchas más: es que una
 * pantalla de confirmación con cinco mil filas ya no se puede revisar, y una
 * confirmación que nadie lee no confirma nada.
 */
export const MAXIMO_FILAS_IMPORTACION = 1000;

// --- La cabeza: qué pasa con cada fila --------------------------------------
//
// Vive aquí, en el contrato, y no dentro del servidor, por lo mismo que
// `mismoCliente`: las dos implementaciones —la de verdad y la de la vista
// previa— tienen que decidir igual. Si la vista previa dejara pasar lo que el
// servidor rechaza, estaría enseñando algo que no va a ocurrir.

/** Lo poco que hace falta buscar para decidir qué hacer con una fila. */
export interface BuscadorClientes {
  porCodigo(codigo: string): Promise<Cliente | null>;
  coincidencia(clave: { nit?: string; correo?: string; empresa?: string }): Promise<Coincidencia | null>;
}

/** Los campos que una fila puede rellenar, con su nombre para la pantalla. */
export const CAMPOS_IMPORTABLES: readonly { clave: keyof DatosCliente; nombre: string }[] = [
  { clave: 'empresa', nombre: 'Empresa' },
  { clave: 'nit', nombre: 'NIT o cédula' },
  { clave: 'contacto', nombre: 'Contacto' },
  { clave: 'cargo', nombre: 'Cargo' },
  { clave: 'telefono', nombre: 'Teléfono' },
  { clave: 'whatsapp', nombre: 'WhatsApp' },
  { clave: 'correo', nombre: 'Correo' },
  { clave: 'ciudad', nombre: 'Ciudad' },
  { clave: 'direccion', nombre: 'Dirección' },
  { clave: 'asesor', nombre: 'Asesora' },
  { clave: 'notas', nombre: 'Notas' },
];

const MOTIVO_PARECIDO: Record<ClaseCoincidencia, string> = {
  nit: 'mismo documento',
  parecido: 'un documento casi igual',
  correo: 'el mismo correo',
  empresa: 'el mismo nombre',
};

/**
 * Qué hacer con una fila, sin tocar nada.
 *
 * El orden de las preguntas es el que evita los errores caros:
 *
 * 1. ¿Se puede usar? Sin nombre no hay ficha, y un correo imposible se rechaza
 *    aquí y no tres días después, cuando un envío falle.
 * 2. ¿Está repetida **dentro del propio archivo**? Es el error más común de una
 *    hoja de cálculo y el que peor se ve: la segunda fila «completaría» a la
 *    primera recién creada, y el resumen diría algo distinto de lo que la
 *    persona aprobó.
 * 3. ¿Ya existe sin discusión? Por código o por documento idéntico.
 * 4. ¿Se parece a alguna? Entonces no se decide sola: se marca para revisar.
 */
export async function examinarFila(
  fila: FilaImportacion,
  buscador: BuscadorClientes,
  vistas: FilasVistas,
): Promise<FilaRevisada> {
  const nombre = (fila.datos.empresa ?? '').trim();
  const salida = (accion: AccionFila, motivo: string, resto: Partial<FilaRevisada> = {}) =>
    ({
      linea: fila.linea,
      nombre: nombre || `Fila ${fila.linea}`,
      accion,
      motivo,
      ...resto,
    }) satisfies FilaRevisada;

  if (!nombre) {
    return salida('error', 'Sin nombre de empresa o persona. Es lo único que no puede faltar.');
  }

  const correo = correoNormal(fila.datos.correo ?? '');
  if (correo && !pareceCorreo(correo)) {
    return salida('error', `«${correo}» no es un correo válido.`);
  }

  const repetida = vistas.repetida(fila);
  if (repetida !== null) {
    return salida('error', `Repetida: es la misma que la fila ${repetida}.`);
  }

  const exacta = await sinDiscusion(fila, buscador);
  if (exacta) {
    vistas.recordar(exacta, fila.linea);
    const { rellenar, conflictos } = camposARellenar(exacta, fila.datos);

    if (rellenar.length === 0 && conflictos.length === 0) {
      return salida('omitir', 'Ya está en la base y no trae nada nuevo.', { codigo: exacta.codigo });
    }
    return salida(
      'completar',
      rellenar.length > 0
        ? `Ya está como ${exacta.codigo}. Se le ${rellenar.length === 1 ? 'llena un campo vacío' : `llenan ${rellenar.length} campos vacíos`}.`
        : `Ya está como ${exacta.codigo}. No hay nada vacío que llenar.`,
      { codigo: exacta.codigo, rellenar, conflictos },
    );
  }

  const parecida = await seParece(fila, buscador);
  if (parecida) {
    if (fila.decision === 'crear') {
      vistas.recordar(fila.datos, fila.linea);
      return salida('crear', 'Marcada como cliente distinto.', {
        codigo: parecida.cliente.codigo,
        clase: parecida.clase,
      });
    }
    if (fila.decision === 'completar') {
      vistas.recordar(parecida.cliente, fila.linea);
      const { rellenar, conflictos } = camposARellenar(parecida.cliente, fila.datos);
      return salida('completar', `Marcada como la misma que ${parecida.cliente.codigo}.`, {
        codigo: parecida.cliente.codigo,
        clase: parecida.clase,
        rellenar,
        conflictos,
      });
    }
    if (fila.decision === 'omitir') {
      return salida('omitir', 'Marcada para no importar.', { codigo: parecida.cliente.codigo });
    }

    return salida(
      'revisar',
      `Se parece a ${parecida.cliente.empresa} (${parecida.cliente.codigo}): ${MOTIVO_PARECIDO[parecida.clase]}.`,
      { codigo: parecida.cliente.codigo, clase: parecida.clase },
    );
  }

  vistas.recordar(fila.datos, fila.linea);
  return salida('crear', 'No está en la base.');
}

/** La ficha que es ésta sin discusión: por código, o por documento idéntico. */
async function sinDiscusion(
  fila: FilaImportacion,
  buscador: BuscadorClientes,
): Promise<Cliente | null> {
  const codigo = (fila.codigo ?? '').trim();
  if (codigo) {
    // Un código que no existe no convierte la fila en nueva: es una errata, y
    // crear un cliente por una errata es justo lo que no queremos. Se sigue
    // buscando por documento.
    const ficha = await buscador.porCodigo(codigo);
    if (ficha) return ficha;
  }

  if (!soloDigitos(fila.datos.nit ?? '')) return null;

  const hallada = await buscador.coincidencia({ nit: fila.datos.nit });
  return hallada?.clase === 'nit' ? hallada.cliente : null;
}

/** Una ficha que se le parece sin ser la misma. */
async function seParece(
  fila: FilaImportacion,
  buscador: BuscadorClientes,
): Promise<Coincidencia | null> {
  const clave = { nit: fila.datos.nit, correo: fila.datos.correo, empresa: fila.datos.empresa };
  const hallada = await buscador.coincidencia(clave);
  return hallada && !hallada.fuerte ? hallada : null;
}

/**
 * Qué llenaría esta fila y qué discreparía.
 *
 * La regla de toda la importación, en una función: **lo vacío se llena y lo
 * escrito no se toca**. Un archivo viejo no puede borrar el teléfono que
 * alguien corrigió ayer a mano, así que lo que discrepa se anota para que se
 * vea, y ahí se queda.
 */
export function camposARellenar(
  ficha: Cliente,
  datos: Partial<DatosCliente>,
): { rellenar: string[]; conflictos: Conflicto[] } {
  const rellenar: string[] = [];
  const conflictos: Conflicto[] = [];

  for (const { clave, nombre } of CAMPOS_IMPORTABLES) {
    const nuevo = String(datos[clave] ?? '').trim();
    if (!nuevo) continue;

    const actual = String(ficha[clave] ?? '').trim();
    if (!actual) {
      rellenar.push(nombre);
    } else if (sinTildes(actual) !== sinTildes(nuevo)) {
      conflictos.push({ campo: nombre, actual, nuevo });
    }
  }

  // Los correos y teléfonos adicionales cuentan como algo que llenar aunque no
  // haya ningún campo vacío: si no, una fila que sólo trae un correo nuevo se
  // leería como «no trae nada» y se descartaría — y luego el guardado sí lo
  // habría añadido. La revisión tiene que decir exactamente lo que va a pasar.
  const correos = sumarian(ficha.correosExtra, datos.correosExtra, correoNormal, ficha.correo);
  if (correos > 0) rellenar.push(correos === 1 ? 'Un correo más' : `${correos} correos más`);

  const telefonos = sumarian(ficha.telefonosExtra, datos.telefonosExtra, recortar, ficha.telefono);
  if (telefonos > 0) rellenar.push(telefonos === 1 ? 'Un teléfono más' : `${telefonos} teléfonos más`);

  return { rellenar, conflictos };
}

const recortar = (valor: string) => valor.trim();

/** Cuántos de los que trae el archivo no están ya en la ficha. */
function sumarian(
  actuales: readonly string[],
  entrantes: readonly string[] | undefined,
  normalizar: (valor: string) => string,
  principal: string,
): number {
  const yaEstan = new Set([...actuales, principal].map(normalizar).filter(Boolean));
  const nuevos = new Set<string>();

  for (const valor of entrantes ?? []) {
    const limpio = normalizar(valor);
    if (limpio && !yaEstan.has(limpio)) nuevos.add(limpio);
  }

  return nuevos.size;
}

/** La ficha con lo vacío rellenado, y ni un campo escrito tocado. */
export function fichaRellenada(ficha: Cliente, datos: Partial<DatosCliente>): DatosCliente {
  const { codigo: _c, creadoEn: _ce, actualizadoEn: _ae, eliminadoEn: _ee, eliminadoPor: _ep, ...resto } = ficha;
  const resultado: DatosCliente = { ...resto };

  for (const { clave } of CAMPOS_IMPORTABLES) {
    const nuevo = String(datos[clave] ?? '').trim();
    if (nuevo && !String(ficha[clave] ?? '').trim()) {
      // Todos los campos de `CAMPOS_IMPORTABLES` son de texto. Los dos que no
      // lo son —tipo y estado— quedan fuera a propósito: cambiar el estado de
      // un cliente activo desde una hoja de cálculo no es «rellenar un vacío».
      Object.assign(resultado, { [clave]: nuevo });
    }
  }

  // Los correos y teléfonos adicionales se suman sin pisar los que había:
  // añadir un contacto nuevo nunca puede perder el anterior. El principal se
  // excluye para no acabar con el mismo correo dos veces en la misma ficha.
  resultado.correosExtra = unir(ficha.correosExtra, datos.correosExtra, correoNormal, resultado.correo);
  resultado.telefonosExtra = unir(ficha.telefonosExtra, datos.telefonosExtra, recortar, resultado.telefono);

  return resultado;
}

function unir(
  actuales: readonly string[],
  nuevos: readonly string[] | undefined,
  normalizar: (valor: string) => string,
  principal: string,
): string[] {
  const fuera = normalizar(principal);
  const vistos = new Set<string>();

  for (const valor of [...actuales, ...(nuevos ?? [])]) {
    const limpio = normalizar(valor);
    if (limpio && limpio !== fuera) vistos.add(limpio);
  }

  return [...vistos];
}

/**
 * Lo que ya salió en el archivo, para cazar las filas repetidas.
 *
 * Una hoja con el mismo cliente dos veces es lo más común del mundo, y sin esto
 * la segunda fila «completaría» a la primera recién creada: la carga
 * funcionaría, el resultado sería correcto, y el resumen diría una cosa
 * distinta de la que la persona vio en la revisión. Mejor decirlo.
 */
export class FilasVistas {
  private readonly porNit = new Map<string, number>();
  private readonly porCorreo = new Map<string, number>();
  private readonly porNombre = new Map<string, number>();

  /** En qué línea del archivo salió ya este mismo cliente, si salió. */
  repetida(fila: FilaImportacion): number | null {
    const clave = claveDe({
      nit: fila.datos.nit,
      correo: fila.datos.correo,
      empresa: fila.datos.empresa,
    });

    // La misma escalera de siempre: manda el documento, luego el correo, y sólo
    // sin ninguno de los dos se compara el nombre.
    if (clave.nit) return this.porNit.get(clave.nit) ?? null;
    if (clave.correo) return this.porCorreo.get(clave.correo) ?? null;
    return this.porNombre.get(clave.empresa) ?? null;
  }

  recordar(datos: { nit?: string; correo?: string; empresa?: string }, linea: number): void {
    const clave = claveDe(datos);
    if (clave.nit && !this.porNit.has(clave.nit)) this.porNit.set(clave.nit, linea);
    if (clave.correo && !this.porCorreo.has(clave.correo)) this.porCorreo.set(clave.correo, linea);
    if (clave.empresa && !this.porNombre.has(clave.empresa)) this.porNombre.set(clave.empresa, linea);
  }
}

/** Cuántas filas caen en cada acción, para el resumen de la pantalla. */
export function contarAcciones(filas: readonly FilaRevisada[]): Record<AccionFila, number> {
  const resumen: Record<AccionFila, number> = { crear: 0, completar: 0, revisar: 0, error: 0, omitir: 0 };
  for (const fila of filas) resumen[fila.accion] += 1;
  return resumen;
}

/** Deja una lista de filas que llegó de fuera en algo que se pueda examinar. */
export function filasSeguras(crudas: unknown): FilaImportacion[] {
  const lista = Array.isArray(crudas) ? crudas : [];

  return lista.map((fila, indice) => {
    const cruda = (fila ?? {}) as Partial<FilaImportacion>;
    return {
      linea: Number(cruda.linea) || indice + 2,
      codigo: typeof cruda.codigo === 'string' ? cruda.codigo.trim() : undefined,
      datos: (cruda.datos ?? {}) as Partial<DatosCliente>,
      decision:
        cruda.decision === 'crear' || cruda.decision === 'completar' || cruda.decision === 'omitir'
          ? cruda.decision
          : undefined,
    } satisfies FilaImportacion;
  });
}
