/**
 * La API del historial de cotizaciones.
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
 * 2. **La identidad no se pide, se comprueba.** Quién emitió sale del token
 *    firmado de Cloudflare Access, nunca de un campo del cuerpo.
 */

import {
  formatoNumero,
  mismoCliente,
  POR_PAGINA,
  type CotizacionGuardada,
  type ErrorApi,
  type Estado,
  type FiltroHistorial,
  type PaginaHistorial,
  type ResumenCotizacion,
} from '../compartido/historial';
import { totalesDeCotizacion } from '../cotizador/src/dominio/precios';
import type { Cotizacion } from '../cotizador/src/dominio/tipos';
import { identificar, SinAcceso } from './acceso';

interface Env {
  BASE: D1Database;
  ASSETS: Fetcher;
  ACCESO_DOMINIO: string;
  ACCESO_AUD: string;
  /** `desarrollo` salta la comprobación de Access. Nunca en producción. */
  MODO?: string;
  CORREO_DESARROLLO?: string;
}

/** Un documento más grande que esto no es una cotización, es un error. */
const MAXIMO_DOCUMENTO = 512 * 1024;

export default {
  async fetch(peticion: Request, env: Env): Promise<Response> {
    const url = new URL(peticion.url);

    if (!url.pathname.startsWith('/api/')) {
      // La portada y el cotizador. `assets` los sirve directamente; esto sólo
      // se ejecuta si la petición llegó igualmente hasta el Worker.
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
        return fallo(error.http, error.codigo, error.message);
      }
      console.error(error);
      return fallo(500, 'fallo', 'El historial falló. Vuelva a intentarlo.');
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

  if (ruta === 'cotizaciones') {
    if (metodo === 'GET') return json(await listar(env.BASE, filtroDe(url)));
    if (metodo === 'POST') return json(await registrar(env.BASE, peticion, correo, null));
  }

  const detalle = /^cotizaciones\/([^/]+)$/.exec(ruta);
  if (detalle) {
    const numero = decodeURIComponent(detalle[1]!);
    if (metodo === 'GET') return json(await abrir(env.BASE, numero));
    if (metodo === 'PUT') return json(await registrar(env.BASE, peticion, correo, numero));
  }

  const estado = /^cotizaciones\/([^/]+)\/estado$/.exec(ruta);
  if (estado && metodo === 'PATCH') {
    return json(await marcar(env.BASE, decodeURIComponent(estado[1]!), peticion, correo));
  }

  throw new ErrorPeticion(404, 'no-encontrada', 'Esa dirección no existe.');
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

  // Con número dado hay que mirar antes si ese número ya es de alguien: el
  // `ON CONFLICT` de abajo actualiza en silencio, y en silencio es justo como
  // no se puede perder una cotización emitida.
  if (numeroDado) await comprobarNumeroLibre(base, numeroDado, documento);

  const numero = numeroDado ?? (await siguienteNumero(base, documento.fecha));

  const totales = totalesDeCotizacion(documento.lineas, documento.iva);

  // `INSERT OR REPLACE` no vale: se llevaría por delante el estado y la nota
  // de una cotización ya marcada como aceptada. Sólo se refresca lo que
  // depende del documento; el seguimiento comercial se queda como estaba.
  await base
    .prepare(
      `INSERT INTO cotizaciones (
         numero, fecha, emitida_en, autor, asesor,
         cliente_empresa, cliente_nit, cliente_contacto,
         total, unidades, catalogo_version, documento
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(numero) DO UPDATE SET
         fecha            = excluded.fecha,
         asesor           = excluded.asesor,
         cliente_empresa  = excluded.cliente_empresa,
         cliente_nit      = excluded.cliente_nit,
         cliente_contacto = excluded.cliente_contacto,
         total            = excluded.total,
         unidades         = excluded.unidades,
         catalogo_version = excluded.catalogo_version,
         documento        = excluded.documento`,
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
      Math.round(totales.total),
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
    .prepare('SELECT cliente_empresa, cliente_nit FROM cotizaciones WHERE numero = ?')
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
  throw new ErrorPeticion(
    409,
    'numero-ocupado',
    `El número ${numero} ya es de una cotización${dueno ? ` de ${dueno}` : ''}. ` +
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documento.fecha ?? '')) {
    throw new ErrorPeticion(400, 'invalida', 'La fecha de la cotización no es válida.');
  }

  return documento;
}

// --- Consultar ------------------------------------------------------------

function filtroDe(url: URL): FiltroHistorial {
  const p = url.searchParams;
  const estado = p.get('estado');
  return {
    texto: p.get('texto')?.trim() || undefined,
    estado: estado === 'emitida' || estado === 'aceptada' || estado === 'perdida' ? estado : undefined,
    desde: fechaValida(p.get('desde')),
    hasta: fechaValida(p.get('hasta')),
    pagina: Math.max(1, Number(p.get('pagina')) || 1),
  };
}

function fechaValida(valor: string | null): string | undefined {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : undefined;
}

async function listar(base: D1Database, filtro: FiltroHistorial): Promise<PaginaHistorial> {
  const condiciones: string[] = [];
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

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const pagina = Math.max(1, filtro.pagina ?? 1);

  const [resumen, filas] = await base.batch<Record<string, unknown>>([
    base
      .prepare(`SELECT COUNT(*) AS cuantas, COALESCE(SUM(total), 0) AS suma FROM cotizaciones ${donde}`)
      .bind(...valores),
    base
      .prepare(
        `SELECT numero, fecha, emitida_en, autor, asesor,
                cliente_empresa, cliente_nit, cliente_contacto,
                total, unidades, estado, estado_nota, estado_en, estado_por
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
    total: Number(fila.total ?? 0),
    unidades: Number(fila.unidades ?? 0),
    estado: (fila.estado as Estado) ?? 'emitida',
    estadoNota: String(fila.estado_nota ?? ''),
    estadoEn: fila.estado_en ? String(fila.estado_en) : null,
    estadoPor: fila.estado_por ? String(fila.estado_por) : null,
  };
}

// --- Respuestas -----------------------------------------------------------

class ErrorPeticion extends Error {
  constructor(
    readonly http: number,
    readonly codigo: ErrorApi['codigo'],
    mensaje: string,
  ) {
    super(mensaje);
  }
}

function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // El historial es de la empresa: que no lo guarde ninguna caché
      // intermedia ni quede en el disco del portátil del asesor.
      'Cache-Control': 'no-store',
    },
  });
}

function fallo(http: number, codigo: ErrorApi['codigo'], mensaje: string): Response {
  return json({ codigo, mensaje } satisfies ErrorApi, http);
}
