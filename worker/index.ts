/**
 * La API del historial de cotizaciones y del correo comercial.
 *
 * Es la única parte del hub que necesita servidor. El resto —la portada, el
 * cotizador, el PDF— sigue ocurriendo entero en el navegador, y este Worker
 * sirve además esos archivos estáticos.
 *
 * Dos reglas que explican casi todo lo de abajo:
 *
 * 1. **El documento manda.** De cada cotización se guarda el JSON completo, y
 *    las columnas del listado se calculan aquí a partir de él con las mismas
 *    funciones que usa la pantalla. Nada de cifras que llegan ya calculadas
 *    desde el navegador: el total del historial no puede discrepar del total
 *    del PDF que tiene el cliente.
 *
 * 2. **La identidad no se pide, se comprueba.** Quién emitió —o quién manda
 *    un correo— sale del token firmado de Cloudflare Access, nunca de un
 *    campo del cuerpo.
 */

import {
  esMoneda,
  formatoNumero,
  MAXIMO_SELECCION,
  mismoCliente,
  POR_PAGINA,
  type CotizacionGuardada,
  type Cuantas,
  type Estado,
  type FiltroHistorial,
  type Moneda,
  type PaginaHistorial,
  type ResumenCotizacion,
  type Seleccion,
} from '../compartido/historial';
import { cambioDe } from '../cotizador/src/dominio/moneda';
import { totalesDeCotizacion } from '../cotizador/src/dominio/precios';
import type { Cotizacion } from '../cotizador/src/dominio/tipos';
import * as clientes from './clientes';
import * as importacion from './importacion';
import { cuerpoJson, ErrorPeticion, fallo, json } from './http';
import type { Env } from './entorno';
import * as envios from './envios';
import { identificar, SinAcceso } from './acceso';

/** Un documento más grande que esto no es una cotización, es un error. */
const MAXIMO_DOCUMENTO = 512 * 1024;

export default {
  async fetch(peticion: Request, env: Env): Promise<Response> {
    const url = new URL(peticion.url);

    if (!url.pathname.startsWith('/api/')) {
      // La portada, el cotizador y el envío de correo. `assets` los sirve
      // directamente; esto sólo se ejecuta si la petición llegó igualmente
      // hasta el Worker.
      return env.ASSETS.fetch(peticion);
    }

    try {
      const correo = await quienEs(peticion, env);
      return await enrutar(peticion, url, env, correo);
    } catch (error) {
      if (error instanceof SinAcceso) {
        // 401 y no 403: quien llega sin token válido tiene que volver a
        // pasar por Access, y eso es lo que el navegador hace al recargar.
        return fallo(401, 'sin-acceso', 'La sesión caducó. Recargue la página para volver a entrar.');
      }
      if (error instanceof ErrorPeticion) {
        return fallo(error.http, error.codigo, error.message, error.detalle);
      }
      console.error(error);
      return fallo(500, 'fallo', 'La operación falló. Vuelva a intentarlo.');
    }
  },
} satisfies ExportedHandler<Env>;

async function quienEs(peticion: Request, env: Env): Promise<string> {
  if (env.MODO === 'desarrollo') return env.CORREO_DESARROLLO ?? 'desarrollo@local';
  return identificar(peticion, { dominio: env.ACCESO_DOMINIO, aud: env.ACCESO_AUD });
}

async function enrutar(
  peticion: Request,
  url: URL,
  env: Env,
  correo: string,
): Promise<Response> {
  const ruta = url.pathname.slice('/api/'.length).replace(/\/$/, '');
  const metodo = peticion.method.toUpperCase();

  if (ruta === 'yo' && metodo === 'GET') {
    return json({ correo });
  }

  if (ruta === 'correo/enviar' && metodo === 'POST') {
    return json(await envios.enviarCorreo(env.BASE, peticion, env, correo));
  }

  if (ruta === 'cotizaciones') {
    if (metodo === 'GET') return json(await listar(env.BASE, filtroDe(url)));
    if (metodo === 'POST') return json(await registrar(env.BASE, peticion, correo, null));
  }

  // Las operaciones en bloque van antes que la ruta de detalle: son POST y
  // aquélla sólo atiende GET y PUT, pero tenerlas juntas evita que mañana
  // alguien añada un POST al detalle y se pisen sin que nadie lo note.
  if (metodo === 'POST' && ruta === 'cotizaciones/eliminar') {
    return json(await eliminar(env.BASE, await leerSeleccion(peticion), correo));
  }
  if (metodo === 'POST' && ruta === 'cotizaciones/restaurar') {
    return json(await restaurar(env.BASE, await leerSeleccion(peticion)));
  }
  if (metodo === 'POST' && ruta === 'cotizaciones/purgar') {
    return json(await purgar(env.BASE, await leerSeleccion(peticion)));
  }

  const detalle = /^cotizaciones\/([^/]+)$/.exec(ruta);
  if (detalle) {
    const numero = decodeURIComponent(detalle[1]!);
    if (metodo === 'GET') return json(await abrir(env.BASE, numero));
    if (metodo === 'PUT') return json(await registrar(env.BASE, peticion, correo, numero));
  }

  // El envío va antes que la ruta de estado por costumbre del archivo: las
  // rutas con sufijo, agrupadas y antes del detalle.
  const enviar = /^cotizaciones\/([^/]+)\/enviar$/.exec(ruta);
  if (enviar && metodo === 'POST') {
    return json(
      await envios.enviarCotizacion(env.BASE, env, decodeURIComponent(enviar[1]!), peticion, correo),
    );
  }

  const estado = /^cotizaciones\/([^/]+)\/estado$/.exec(ruta);
  if (estado && metodo === 'PATCH') {
    return json(await marcar(env.BASE, decodeURIComponent(estado[1]!), peticion, correo));
  }

  const respuestaClientes = await enrutarClientes(peticion, url, env, correo, ruta, metodo);
  if (respuestaClientes) return respuestaClientes;

  throw new ErrorPeticion(404, 'no-encontrada', 'Esa dirección no existe.');
}

/**
 * Las rutas del panel de clientes.
 *
 * Aparte de `enrutar` para que el archivo de clientes no tenga que conocer la
 * forma de las direcciones y este no tenga que conocer la de las fichas.
 * Devuelve `null` cuando la ruta no es suya, y entonces el de arriba sigue
 * hasta el 404.
 */
async function enrutarClientes(
  peticion: Request,
  url: URL,
  env: Env,
  correo: string,
  ruta: string,
  metodo: string,
): Promise<Response | null> {
  if (ruta === 'clientes') {
    if (metodo === 'GET') return json(await clientes.listar(env.BASE, clientes.filtroDeUrl(url)));
    if (metodo === 'POST') return json(await clientes.crear(env.BASE, peticion), 201);
  }

  // `coincidencia` va antes que la ruta de detalle: las dos son GET bajo
  // `clientes/…`, y sin este orden «¿a éste ya lo tengo?» se leería como
  // «ábreme el cliente que se llama coincidencia».
  if (ruta === 'clientes/coincidencia' && metodo === 'GET') {
    return json(
      await clientes.coincidencia(env.BASE, {
        nit: url.searchParams.get('nit') ?? '',
        correo: url.searchParams.get('correo') ?? '',
        empresa: url.searchParams.get('empresa') ?? '',
      }),
    );
  }

  // La carga por lote, en dos pasos y nunca en uno: `revisar` cuenta qué
  // pasaría sin escribir nada, y `confirmar` lo hace. Que sean dos direcciones
  // distintas es lo que impide que un clic de más escriba sin que nadie haya
  // visto lo que iba a pasar.
  if (metodo === 'POST' && ruta === 'clientes/importar/revisar') {
    return json(await importacion.revisar(env.BASE, peticion));
  }
  if (metodo === 'POST' && ruta === 'clientes/importar/confirmar') {
    return json(await importacion.confirmar(env.BASE, peticion));
  }

  if (metodo === 'POST' && ruta === 'clientes/eliminar') {
    return json(await clientes.eliminar(env.BASE, await clientes.leerSeleccion(peticion), correo));
  }
  if (metodo === 'POST' && ruta === 'clientes/restaurar') {
    return json(await clientes.restaurar(env.BASE, await clientes.leerSeleccion(peticion)));
  }
  if (metodo === 'POST' && ruta === 'clientes/purgar') {
    return json(await clientes.purgar(env.BASE, await clientes.leerSeleccion(peticion)));
  }

  // Va antes que el detalle por lo mismo que `coincidencia`: las dos son GET
  // bajo `clientes/…` y sin este orden se leería como un código de cliente.
  const actividad = /^clientes\/([^/]+)\/actividad$/.exec(ruta);
  if (actividad && metodo === 'GET') {
    return json(await clientes.actividad(env.BASE, decodeURIComponent(actividad[1]!)));
  }

  const detalle = /^clientes\/([^/]+)$/.exec(ruta);
  if (detalle) {
    const codigo = decodeURIComponent(detalle[1]!);
    if (metodo === 'GET') return json(await clientes.abrir(env.BASE, codigo));
    if (metodo === 'PUT') return json(await clientes.actualizar(env.BASE, codigo, peticion));
  }

  return null;
}

// --- Registrar ------------------------------------------------------------

/**
 * Guarda una cotización emitida.
 *
 * Con `numero` en blanco (POST) el consecutivo lo asigna la base. Con número
 * (PUT) se respeta el que viene, que cubre dos casos: reemitir una cotización
 * que ya tiene número —el asesor baja el PDF y luego manda el WhatsApp, y lo
 * segundo debe actualizar lo guardado, no crear otra— y el número escrito a
 * mano cuando alguien recupera una cotización vieja del Excel.
 */
async function registrar(
  base: D1Database,
  peticion: Request,
  correo: string,
  numeroDado: string | null,
): Promise<{ numero: string; emitidaEn: string }> {
  const documento = await leerDocumento(peticion);
  const emitidaEn = new Date().toISOString();
  const cambio = cambioDe(documento);

  // Con número dado hay que mirar antes si ese número ya es de alguien: el
  // `ON CONFLICT` de abajo actualiza en silencio, y en silencio es justo como
  // no se puede perder una cotización emitida.
  if (numeroDado) await comprobarNumeroLibre(base, numeroDado, documento);

  const numero = numeroDado ?? (await siguienteNumero(base, documento.fecha));

  const totales = totalesDeCotizacion(documento.lineas, documento.iva, cambio.moneda);
  // Dos cifras y no una: la del documento, en su moneda, y su equivalente en
  // pesos, que es con el que el historial suma y ordena. Las dos se calculan
  // aquí a partir del documento, igual que antes: nada que llegue calculado
  // desde el navegador entra en la base.
  const totalEnPesos = Math.round(totales.total * cambio.tasa);

  // `INSERT OR REPLACE` no vale: se llevaría por delante el estado y la nota
  // de una cotización ya marcada como aceptada. Sólo se refresca lo que
  // depende del documento; el seguimiento comercial se queda como estaba.
  await base
    .prepare(
      `INSERT INTO cotizaciones (
         numero, fecha, emitida_en, autor, asesor,
         cliente_empresa, cliente_nit, cliente_contacto, cliente_codigo,
         total, total_divisa, moneda, tasa, unidades, catalogo_version, documento
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(numero) DO UPDATE SET
         fecha            = excluded.fecha,
         asesor           = excluded.asesor,
         cliente_empresa  = excluded.cliente_empresa,
         cliente_nit      = excluded.cliente_nit,
         cliente_contacto = excluded.cliente_contacto,
         -- Se refresca al reemitir: si el asesor eligió otra ficha antes de
         -- volver a mandarla, la cotización tiene que acabar donde él dijo.
         cliente_codigo   = excluded.cliente_codigo,
         total            = excluded.total,
         total_divisa     = excluded.total_divisa,
         moneda           = excluded.moneda,
         tasa             = excluded.tasa,
         unidades         = excluded.unidades,
         catalogo_version = excluded.catalogo_version,
         documento        = excluded.documento,
         -- Volver a emitir una cotización que estaba en la papelera la saca
         -- de ella: lo que acaba de salir hacia un cliente no puede quedarse
         -- escondido en el historial.
         eliminada_en     = NULL,
         eliminada_por    = NULL`,
    )
    .bind(
      numero,
      documento.fecha,
      emitidaEn,
      correo,
      documento.asesor ?? '',
      documento.cliente?.empresa ?? '',
      documento.cliente?.nit ?? '',
      documento.cliente?.contacto ?? '',
      // `null` y no cadena vacía: es «no hay ficha», no «la ficha se llama
      // vacío». Así la columna se puede consultar con IS NULL.
      documento.clienteCodigo?.trim() || null,
      totalEnPesos,
      totales.total,
      cambio.moneda,
      cambio.tasa,
      Math.round(totales.unidades),
      documento.catalogoVersion ?? '',
      JSON.stringify({ ...documento, numero }),
    )
    .run();

  return { numero, emitidaEn };
}

/**
 * Deja pasar el PUT sólo si ese número no es de otra cotización.
 *
 * El PUT cubre dos cosas que se parecen y no son la misma:
 *
 * 1. **Reemitir la propia.** El asesor baja el PDF y luego manda el WhatsApp.
 *    Son una cotización, no dos, y la segunda salida debe actualizar la que ya
 *    está guardada.
 * 2. **Escribir un número a mano.** Pasar al historial una cotización vieja
 *    del Excel, con el número que tuvo entonces.
 *
 * Lo segundo es lo que se puede equivocar: basta teclear `COT-2026-0007`
 * cuando esa cotización ya existe para que el documento de otro cliente quede
 * reemplazado por éste, sin aviso y sin forma de recuperarlo. El contrato ya
 * tenía previsto el código `numero-ocupado` para esto; lo que faltaba era
 * emitirlo.
 *
 * La cotización se reconoce por su cliente: mismo NIT —o mismo nombre, cuando
 * no hay NIT— es la misma, y reemitirla sigue funcionando como antes. Cliente
 * distinto es un choque, y se rechaza diciendo de quién es el número.
 */
async function comprobarNumeroLibre(
  base: D1Database,
  numero: string,
  documento: Cotizacion,
): Promise<void> {
  const fila = await base
    .prepare('SELECT cliente_empresa, cliente_nit, eliminada_en FROM cotizaciones WHERE numero = ?')
    .bind(numero)
    .first<Record<string, unknown>>();

  // Libre. Es el caso de la cotización vieja del Excel, que es legítimo.
  if (!fila) return;

  // Con el mismo cuidado que `aResumen`: lo que sale de la base se pasa por
  // `String(... ?? '')` antes de tratarlo como texto.
  const empresa = String(fila.cliente_empresa ?? '');

  if (
    mismoCliente(
      { empresa, nit: String(fila.cliente_nit ?? '') },
      { empresa: documento.cliente?.empresa ?? '', nit: documento.cliente?.nit ?? '' },
    )
  ) {
    return;
  }

  const dueno = empresa.trim();
  // Que esté en la papelera no libera el número, pero callarlo dejaría a
  // quien lo escribió buscando en el historial una cotización que no sale.
  const donde = fila.eliminada_en ? ' (está en la papelera)' : '';
  throw new ErrorPeticion(
    409,
    'numero-ocupado',
    `El número ${numero} ya es de una cotización${dueno ? ` de ${dueno}` : ''}${donde}. ` +
      'Verifique el número, o deje el campo vacío para que se asigne el siguiente.',
  );
}

/**
 * Gasta un número del consecutivo del año y lo devuelve.
 *
 * `ON CONFLICT ... RETURNING` es una sola sentencia, así que dos asesores que
 * emitan a la vez no pueden llevarse el mismo número: SQLite serializa la
 * escritura y cada uno ve el contador ya incrementado por el otro.
 *
 * Si el guardado posterior falla, el número queda gastado y la numeración
 * salta uno. Es el error correcto de los dos posibles: un hueco se explica,
 * dos cotizaciones distintas con el mismo número no.
 */
async function siguienteNumero(base: D1Database, fecha: string): Promise<string> {
  // El año sale de la fecha del documento —la que se imprime— y no del reloj
  // del servidor, que está en UTC y a las 7 de la tarde en Bogotá ya es el día
  // siguiente.
  const anio = /^\d{4}/.exec(fecha)?.[0] ?? String(new Date().getFullYear());

  const fila = await base
    .prepare(
      `INSERT INTO consecutivos (anio, valor) VALUES (?, 1)
       ON CONFLICT(anio) DO UPDATE SET valor = valor + 1
       RETURNING valor`,
    )
    .bind(anio)
    .first<{ valor: number }>();

  if (!fila) throw new Error('El consecutivo no devolvió valor.');
  return formatoNumero(anio, fila.valor);
}

async function leerDocumento(peticion: Request): Promise<Cotizacion> {
  const crudo = await peticion.text();

  if (crudo.length > MAXIMO_DOCUMENTO) {
    throw new ErrorPeticion(413, 'invalida', 'La cotización es demasiado grande.');
  }

  let documento: Cotizacion;
  try {
    documento = JSON.parse(crudo) as Cotizacion;
  } catch {
    throw new ErrorPeticion(400, 'invalida', 'El cuerpo no es JSON válido.');
  }

  if (!documento || typeof documento !== 'object' || !Array.isArray(documento.lineas)) {
    throw new ErrorPeticion(400, 'invalida', 'Eso no es una cotización.');
  }
  if (documento.lineas.length === 0) {
    throw new ErrorPeticion(400, 'invalida', 'Una cotización sin líneas no se emite.');
  }
  if (!Number.isFinite(documento.iva)) {
    throw new ErrorPeticion(400, 'invalida', 'La cotización no trae tarifa de IVA.');
  }
  // La moneda puede faltar —las emitidas antes de que existiera no la traen, y
  // eran todas en pesos—, pero si viene tiene que ser una de las dos, y una en
  // dólares sin tasa utilizable no se puede guardar: su equivalente en pesos
  // sería cero y el historial la sumaría como si no valiera nada.
  if (documento.moneda !== undefined && !esMoneda(documento.moneda)) {
    throw new ErrorPeticion(400, 'invalida', 'Esa moneda no existe.');
  }
  if (documento.moneda === 'USD' && !(Number(documento.tasa) > 0)) {
    throw new ErrorPeticion(
      400,
      'invalida',
      'Una cotización en dólares necesita la tasa de cambio con la que se hizo.',
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documento.fecha ?? '')) {
    throw new ErrorPeticion(400, 'invalida', 'La fecha de la cotización no es válida.');
  }

  return documento;
}

// --- Consultar ------------------------------------------------------------

function filtroDe(url: URL): FiltroHistorial {
  const p = url.searchParams;
  return filtroSeguro({
    texto: p.get('texto') ?? undefined,
    estado: (p.get('estado') ?? undefined) as FiltroHistorial['estado'],
    desde: p.get('desde') ?? undefined,
    hasta: p.get('hasta') ?? undefined,
    pagina: Number(p.get('pagina')) || 1,
    papelera: p.get('papelera') === '1',
  });
}

/**
 * Deja un filtro en algo que se pueda meter en una consulta.
 *
 * Lo usan los dos caminos por los que llega un filtro: la dirección del
 * listado y el cuerpo de una operación en bloque. El segundo es el que obliga
 * a que esto exista aparte — ahí el filtro viene de un JSON, y de un JSON
 * puede venir cualquier cosa. Los valores se acaban pasando como parámetros
 * enlazados, nunca concatenados, pero un `estado` inventado o una fecha
 * absurda tampoco deben llegar a la consulta.
 */
function filtroSeguro(crudo: Partial<FiltroHistorial> | null | undefined): FiltroHistorial {
  const estado = crudo?.estado;
  return {
    texto: typeof crudo?.texto === 'string' ? crudo.texto.trim() || undefined : undefined,
    estado:
      estado === 'emitida' || estado === 'aceptada' || estado === 'perdida' ? estado : undefined,
    desde: fechaValida(crudo?.desde),
    hasta: fechaValida(crudo?.hasta),
    pagina: Math.max(1, Number(crudo?.pagina) || 1),
    papelera: crudo?.papelera === true,
  };
}

function fechaValida(valor: string | null | undefined): string | undefined {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : undefined;
}

/**
 * El `WHERE` que corresponde a un filtro, con sus valores enlazados.
 *
 * Está aparte porque lo comparten el listado y las operaciones en bloque:
 * «eliminar todas las que cumplen el filtro» tiene que alcanzar exactamente
 * las filas que la persona está viendo, y la única forma de garantizarlo es
 * que las dos consultas se armen con el mismo código.
 */
function dondeDe(filtro: FiltroHistorial): { donde: string; valores: unknown[] } {
  // La papelera nunca es opcional: o se listan las que están a la vista o las
  // que están en ella, pero jamás las dos mezcladas.
  const condiciones: string[] = [filtro.papelera ? 'eliminada_en IS NOT NULL' : 'eliminada_en IS NULL'];
  const valores: unknown[] = [];

  if (filtro.texto) {
    const patron = `%${filtro.texto}%`;
    condiciones.push(
      `(numero LIKE ? OR cliente_empresa LIKE ? OR cliente_nit LIKE ? OR cliente_contacto LIKE ?)`,
    );
    valores.push(patron, patron, patron, patron);
  }
  if (filtro.estado) {
    condiciones.push('estado = ?');
    valores.push(filtro.estado);
  }
  // Se filtra por `emitida_en`, que es cuando salió de verdad. Como es un
  // instante ISO completo, el día `hasta` se cierra con la hora más alta para
  // que ese mismo día entre entero.
  if (filtro.desde) {
    condiciones.push('emitida_en >= ?');
    valores.push(`${filtro.desde}T00:00:00.000Z`);
  }
  if (filtro.hasta) {
    condiciones.push('emitida_en <= ?');
    valores.push(`${filtro.hasta}T23:59:59.999Z`);
  }

  return { donde: `WHERE ${condiciones.join(' AND ')}`, valores };
}

async function listar(base: D1Database, filtro: FiltroHistorial): Promise<PaginaHistorial> {
  const { donde, valores } = dondeDe(filtro);
  const pagina = Math.max(1, filtro.pagina ?? 1);

  const [resumen, filas] = await base.batch<Record<string, unknown>>([
    base
      .prepare(`SELECT COUNT(*) AS cuantas, COALESCE(SUM(total), 0) AS suma FROM cotizaciones ${donde}`)
      .bind(...valores),
    base
      .prepare(
        `SELECT numero, fecha, emitida_en, autor, asesor,
                cliente_empresa, cliente_nit, cliente_contacto, cliente_codigo,
                total, total_divisa, moneda, tasa,
                unidades, estado, estado_nota, estado_en, estado_por,
                eliminada_en, eliminada_por
           FROM cotizaciones ${donde}
          ORDER BY emitida_en DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...valores, POR_PAGINA, (pagina - 1) * POR_PAGINA),
  ]);

  const cuentas = resumen?.results[0] ?? {};

  return {
    cotizaciones: (filas?.results ?? []).map(aResumen),
    cuantas: Number(cuentas.cuantas ?? 0),
    sumaTotales: Number(cuentas.suma ?? 0),
    pagina,
    porPagina: POR_PAGINA,
  };
}

async function abrir(base: D1Database, numero: string): Promise<CotizacionGuardada<Cotizacion>> {
  const fila = await base
    .prepare('SELECT * FROM cotizaciones WHERE numero = ?')
    .bind(numero)
    .first<Record<string, unknown>>();

  if (!fila) {
    throw new ErrorPeticion(404, 'no-encontrada', `No hay ninguna cotización ${numero}.`);
  }

  return {
    ...aResumen(fila),
    documento: JSON.parse(String(fila.documento)) as Cotizacion,
  };
}

async function marcar(
  base: D1Database,
  numero: string,
  peticion: Request,
  correo: string,
): Promise<{ hecho: true }> {
  const cuerpo = (await peticion.json().catch(() => null)) as {
    estado?: Estado;
    nota?: string;
  } | null;

  const estado = cuerpo?.estado;
  if (estado !== 'emitida' && estado !== 'aceptada' && estado !== 'perdida') {
    throw new ErrorPeticion(400, 'invalida', 'Ese estado no existe.');
  }

  const resultado = await base
    .prepare(
      `UPDATE cotizaciones
          SET estado = ?, estado_nota = ?, estado_en = ?, estado_por = ?
        WHERE numero = ?`,
    )
    .bind(estado, (cuerpo?.nota ?? '').slice(0, 500), new Date().toISOString(), correo, numero)
    .run();

  if (!resultado.meta.changes) {
    throw new ErrorPeticion(404, 'no-encontrada', `No hay ninguna cotización ${numero}.`);
  }

  return { hecho: true };
}

// --- Papelera ---------------------------------------------------------------

/**
 * Lee del cuerpo qué cotizaciones alcanza la operación.
 *
 * Dos formas, y la segunda existe por el caso real: con mil cotizaciones
 * guardadas, mandar mil números por el cable para borrarlas no es una forma
 * de borrar. `{ todas: true, filtro }` deja que la condición la resuelva la
 * base con el mismo `WHERE` del listado.
 */
async function leerSeleccion(peticion: Request): Promise<Seleccion> {
  const cuerpo = await cuerpoJson<{ numeros?: unknown; todas?: unknown; filtro?: unknown }>(peticion);

  if (cuerpo.todas === true) {
    return { todas: true, filtro: filtroSeguro(cuerpo.filtro as Partial<FiltroHistorial>) };
  }

  const numeros = Array.isArray(cuerpo.numeros)
    ? cuerpo.numeros.filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    : [];

  if (numeros.length === 0) {
    throw new ErrorPeticion(400, 'invalida', 'No se indicó ninguna cotización.');
  }
  if (numeros.length > MAXIMO_SELECCION) {
    throw new ErrorPeticion(
      400,
      'invalida',
      `No se pueden tocar más de ${MAXIMO_SELECCION} cotizaciones de una vez por número. ` +
        'Use el filtro y «seleccionar todas».',
    );
  }

  return { numeros };
}

/**
 * A qué filas llega la operación, según de dónde vengan.
 *
 * `papelera` no lo decide quien llama: lo decide la operación. Eliminar sólo
 * puede tocar lo que está a la vista y restaurar o purgar sólo lo que ya está
 * en la papelera, y así una selección hecha en una pantalla no puede acabar
 * aplicándose sobre la otra.
 */
function alcanceDe(seleccion: Seleccion, papelera: boolean): { donde: string; valores: unknown[] } {
  if ('todas' in seleccion) {
    return dondeDe({ ...seleccion.filtro, papelera });
  }

  const huecos = seleccion.numeros.map(() => '?').join(', ');
  return {
    donde: `WHERE ${papelera ? 'eliminada_en IS NOT NULL' : 'eliminada_en IS NULL'} AND numero IN (${huecos})`,
    valores: [...seleccion.numeros],
  };
}

/**
 * Manda cotizaciones a la papelera.
 *
 * No borra nada: pone fecha y autor de retirada, y desde ese momento dejan de
 * salir en el historial. El número sigue ocupado —el consecutivo no retrocede
 * nunca— y el documento sigue entero, que es lo que permite deshacerlo.
 */
async function eliminar(base: D1Database, seleccion: Seleccion, correo: string): Promise<Cuantas> {
  const { donde, valores } = alcanceDe(seleccion, false);

  const resultado = await base
    .prepare(`UPDATE cotizaciones SET eliminada_en = ?, eliminada_por = ? ${donde}`)
    .bind(new Date().toISOString(), correo, ...valores)
    .run();

  return { cuantas: resultado.meta.changes ?? 0 };
}

/** Las saca de la papelera. Vuelven al historial tal como estaban. */
async function restaurar(base: D1Database, seleccion: Seleccion): Promise<Cuantas> {
  const { donde, valores } = alcanceDe(seleccion, true);

  const resultado = await base
    .prepare(`UPDATE cotizaciones SET eliminada_en = NULL, eliminada_por = NULL ${donde}`)
    .bind(...valores)
    .run();

  return { cuantas: resultado.meta.changes ?? 0 };
}

/**
 * Borra de verdad, y sólo lo que ya está en la papelera.
 *
 * El paso previo por la papelera no es una molestia inventada: es lo que
 * convierte «seleccioné trescientas sin querer» en algo que se deshace. Aquí
 * ya no — de esto no se vuelve, y por eso `alcanceDe` fuerza que la fila esté
 * retirada aunque quien llame diga otra cosa.
 */
async function purgar(base: D1Database, seleccion: Seleccion): Promise<Cuantas> {
  const { donde, valores } = alcanceDe(seleccion, true);

  const resultado = await base
    .prepare(`DELETE FROM cotizaciones ${donde}`)
    .bind(...valores)
    .run();

  return { cuantas: resultado.meta.changes ?? 0 };
}

function aResumen(fila: Record<string, unknown>): ResumenCotizacion {
  return {
    numero: String(fila.numero),
    fecha: String(fila.fecha),
    emitidaEn: String(fila.emitida_en),
    autor: String(fila.autor ?? ''),
    asesor: String(fila.asesor ?? ''),
    cliente: String(fila.cliente_empresa ?? ''),
    nit: String(fila.cliente_nit ?? ''),
    contacto: String(fila.cliente_contacto ?? ''),
    clienteCodigo: fila.cliente_codigo ? String(fila.cliente_codigo) : null,
    total: Number(fila.total ?? 0),
    // `?? ` no basta: la columna se añadió con `DEFAULT 0`, así que una fila
    // escrita entre la migración y el despliegue del código nuevo trae un cero
    // de verdad, no un nulo, y se enseñaría como «$ 0» en el listado. Esas
    // filas son de antes de las divisas y su total en moneda es su total.
    totalMoneda: Number(fila.total_divisa) || Number(fila.total ?? 0),
    moneda: esMoneda(fila.moneda) ? (fila.moneda as Moneda) : 'COP',
    tasa: Number(fila.tasa) > 0 ? Number(fila.tasa) : 1,
    unidades: Number(fila.unidades ?? 0),
    estado: (fila.estado as Estado) ?? 'emitida',
    estadoNota: String(fila.estado_nota ?? ''),
    estadoEn: fila.estado_en ? String(fila.estado_en) : null,
    estadoPor: fila.estado_por ? String(fila.estado_por) : null,
    eliminadaEn: fila.eliminada_en ? String(fila.eliminada_en) : null,
    eliminadaPor: fila.eliminada_por ? String(fila.eliminada_por) : null,
  };
}
