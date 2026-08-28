/**
 * El panel de clientes por dentro.
 *
 * Está aparte de `index.ts` —que se quedó de enrutador— porque son dos cosas
 * que no comparten nada salvo la base y la forma de rechazar: una guarda
 * documentos de cotización y la otra fichas de cliente.
 *
 * Las dos reglas que gobiernan este archivo:
 *
 * 1. **La ficha manda.** Nada de aquí se pisa desde una cotización sin que
 *    alguien lo apruebe en pantalla. Este módulo sólo ofrece las piezas —leer,
 *    crear, actualizar— y quien decide es la persona.
 *
 * 2. **El cliente se reconoce, no se numera.** El código `CLI-0001` es lo que
 *    sale de haberlo reconocido, nunca la forma de reconocerlo. Ver
 *    `COINCIDENCIA` en `compartido/clientes.ts`.
 */

import {
  CLIENTES_POR_PAGINA,
  MAXIMO_SELECCION_CLIENTES,
  claveDe,
  claveUtil,
  coincidenciaFuerte,
  esEstadoCliente,
  esTipoCliente,
  formatoCodigoCliente,
  type ClaseCoincidencia,
  type Cliente,
  type Coincidencia,
  type CuantosClientes,
  type DatosCliente,
  type FiltroClientes,
  type PaginaClientes,
  type SeleccionClientes,
} from '../compartido/clientes';
import {
  ACTIVIDAD_POR_FICHA,
  type ActividadCliente,
  type ResumenEnvio,
  type TotalesCliente,
} from '../compartido/actividad';
import type { ResumenCotizacion } from '../compartido/historial';
import { correoNormal, pareceCorreo, sinTildes, soloDigitos } from '../compartido/texto';
import { cuerpoJson, ErrorPeticion, texto } from './http';

/** Ninguna ficha necesita más de esto, y más huele a pegado por error. */
const MAXIMO_EXTRA = 10;
/**
 * Por debajo de esto no se comparan documentos parecidos: un «12» y un «123»
 * se parecerían y de eso no se saca nada. Es el mismo mínimo que aplica
 * `documentosParecidos` en el contrato, escrito aquí porque quien compara es
 * SQLite y no puede llamar a aquella función.
 */
const MINIMO_DIGITOS_DOCUMENTO = 8;
const MAXIMO_NOTAS = 4000;

// --- Consultar --------------------------------------------------------------

export function filtroDeUrl(url: URL): FiltroClientes {
  const p = url.searchParams;
  return filtroSeguro({
    texto: p.get('texto') ?? undefined,
    estado: (p.get('estado') ?? undefined) as FiltroClientes['estado'],
    asesor: p.get('asesor') ?? undefined,
    pagina: Number(p.get('pagina')) || 1,
    papelera: p.get('papelera') === '1',
  });
}

/**
 * Deja un filtro en algo que se pueda meter en una consulta.
 *
 * Igual que en el historial, existe aparte porque el filtro llega por dos
 * caminos —la dirección del listado y el cuerpo de una operación en bloque— y
 * del segundo puede venir cualquier cosa.
 */
function filtroSeguro(crudo: Partial<FiltroClientes> | null | undefined): FiltroClientes {
  return {
    texto: typeof crudo?.texto === 'string' ? crudo.texto.trim().slice(0, 120) || undefined : undefined,
    estado: esEstadoCliente(crudo?.estado) ? crudo.estado : undefined,
    asesor: typeof crudo?.asesor === 'string' ? crudo.asesor.trim().slice(0, 120) || undefined : undefined,
    pagina: Math.max(1, Number(crudo?.pagina) || 1),
    papelera: crudo?.papelera === true,
  };
}

/**
 * El `WHERE` de un filtro, con sus valores enlazados.
 *
 * Lo comparten el listado y las operaciones en bloque: «eliminar todos los que
 * cumplen el filtro» tiene que alcanzar exactamente las fichas que la persona
 * está viendo, y la única forma de garantizarlo es armar las dos consultas con
 * el mismo código.
 */
function dondeDe(filtro: FiltroClientes): { donde: string; valores: unknown[] } {
  // La papelera nunca es opcional: o se listan las fichas a la vista o las
  // retiradas, jamás las dos mezcladas.
  const condiciones: string[] = [filtro.papelera ? 'eliminado_en IS NOT NULL' : 'eliminado_en IS NULL'];
  const valores: unknown[] = [];

  if (filtro.texto) {
    // Se busca por el texto tal cual y además por su forma normalizada, para
    // que «avila» encuentre a «Ávila» y «900437215-8» encuentre al NIT escrito
    // con puntos.
    const patron = `%${filtro.texto}%`;
    const patronNormal = `%${sinTildes(filtro.texto)}%`;
    const patronDigitos = soloDigitos(filtro.texto);
    condiciones.push(
      `(codigo LIKE ? OR empresa LIKE ? OR empresa_normal LIKE ? OR nit LIKE ? OR contacto LIKE ?
        OR correo LIKE ? OR ciudad LIKE ?${patronDigitos ? ' OR nit_digitos LIKE ?' : ''})`,
    );
    valores.push(patron, patron, patronNormal, patron, patron, patron, patron);
    if (patronDigitos) valores.push(`%${patronDigitos}%`);
  }
  if (filtro.estado) {
    condiciones.push('estado = ?');
    valores.push(filtro.estado);
  }
  if (filtro.asesor) {
    condiciones.push('asesor = ?');
    valores.push(filtro.asesor);
  }

  return { donde: `WHERE ${condiciones.join(' AND ')}`, valores };
}

export async function listar(base: D1Database, filtro: FiltroClientes): Promise<PaginaClientes> {
  const { donde, valores } = dondeDe(filtro);
  const pagina = Math.max(1, filtro.pagina ?? 1);

  const [resumen, filas] = await base.batch<Record<string, unknown>>([
    base.prepare(`SELECT COUNT(*) AS cuantos FROM clientes ${donde}`).bind(...valores),
    base
      .prepare(
        // Por nombre y no por fecha de alta: el panel de clientes se recorre
        // buscando a alguien, no mirando qué entró último. `empresa_normal`
        // existe justo para que «Ávila» no acabe detrás de «Zapata».
        `SELECT * FROM clientes ${donde} ORDER BY empresa_normal ASC LIMIT ? OFFSET ?`,
      )
      .bind(...valores, CLIENTES_POR_PAGINA, (pagina - 1) * CLIENTES_POR_PAGINA),
  ]);

  return {
    clientes: (filas?.results ?? []).map(aCliente),
    cuantos: Number(resumen?.results[0]?.cuantos ?? 0),
    pagina,
    porPagina: CLIENTES_POR_PAGINA,
  };
}

export async function abrir(base: D1Database, codigo: string): Promise<Cliente> {
  const fila = await base
    .prepare('SELECT * FROM clientes WHERE codigo = ?')
    .bind(codigo)
    .first<Record<string, unknown>>();

  if (!fila) throw new ErrorPeticion(404, 'no-encontrada', `No hay ningún cliente ${codigo}.`);
  return aCliente(fila);
}

/**
 * «¿A éste ya lo tengo?».
 *
 * Recorre la escalera de `COINCIDENCIA` y devuelve el primer peldaño que
 * responda, diciendo por cuál fue. Quien llama decide qué hacer con eso: el
 * NIT basta para dar por hecho que es el mismo, y los otros dos obligan a
 * preguntar. Aquí no se decide nada, sólo se busca.
 *
 * Alcanza también a las fichas de la papelera —`todos`— porque callar que el
 * cliente existe pero está retirado deja a quien lo busca creyendo que puede
 * crearlo, y luego chocando contra el índice único del NIT sin entender por qué.
 */
export async function coincidencia(
  base: D1Database,
  datos: { nit?: string; correo?: string; empresa?: string },
): Promise<{ coincidencia: Coincidencia | null }> {
  const clave = claveDe(datos);
  if (!claveUtil(clave)) return { coincidencia: null };

  const intentos: { clase: ClaseCoincidencia; sql: string; valor: string }[] = [];
  if (clave.nit) {
    intentos.push({ clase: 'nit', sql: 'nit_digitos = ?', valor: clave.nit });
    // Y, justo detrás, el mismo número con un dígito de más o de menos: el NIT
    // escrito con y sin dígito de verificación. `substr` recorta el último
    // dígito por los dos lados, para que dé igual cuál de las dos formas esté
    // guardada y cuál se esté escribiendo ahora.
    intentos.push({
      clase: 'parecido',
      sql: `nit_digitos <> '' AND length(nit_digitos) >= ${MINIMO_DIGITOS_DOCUMENTO}
            AND (nit_digitos = substr(?, 1, length(?) - 1)
                 OR ? = substr(nit_digitos, 1, length(nit_digitos) - 1))`,
      valor: clave.nit,
    });
  }
  if (clave.correo) {
    // El correo principal o cualquiera de los adicionales. La lista es un JSON
    // corto y se busca con LIKE sobre el texto entrecomillado: con cientos de
    // fichas es de sobra, y evita una tabla aparte para un dato que siempre se
    // lee junto al cliente.
    intentos.push({
      clase: 'correo',
      sql: '(correo_normal = ? OR correos_extra LIKE ?)',
      valor: clave.correo,
    });
  }
  if (clave.empresa) {
    intentos.push({ clase: 'empresa', sql: 'empresa_normal = ?', valor: clave.empresa });
  }

  for (const intento of intentos) {
    // Cada peldaño usa su valor tantas veces como huecos tenga su condición.
    const valores =
      intento.clase === 'correo'
        ? [intento.valor, `%"${intento.valor}"%`]
        : intento.clase === 'parecido'
          ? [intento.valor, intento.valor, intento.valor]
          : [intento.valor];

    const fila = await base
      .prepare(`SELECT * FROM clientes WHERE ${intento.sql} LIMIT 1`)
      .bind(...valores)
      .first<Record<string, unknown>>();

    if (fila) {
      return {
        coincidencia: {
          cliente: aCliente(fila),
          clase: intento.clase,
          fuerte: coincidenciaFuerte(intento.clase),
        },
      };
    }
  }

  return { coincidencia: null };
}

/**
 * Todo lo que ha pasado con un cliente.
 *
 * Tres consultas y una decisión: **qué cotizaciones son suyas**.
 *
 * Las emitidas desde que existen las fichas traen el enlace y no hay
 * ambigüedad. Las de antes no, y perderlas sería empezar la ficha de cada
 * cliente en blanco el día que se publique esto. Así que también cuentan las
 * que no tienen enlace y llevan **su mismo documento**, comparado por dígitos
 * —que es como se compara un NIT en todo el resto del hub—.
 *
 * Sin NIT no hay segunda vía, y es correcto: por nombre habría que decidir si
 * «Transportes del Norte» es este cliente o el otro, y esa es justo la clase de
 * suposición que este hub no hace sola.
 */
export async function actividad(base: D1Database, codigo: string): Promise<ActividadCliente> {
  const cliente = await abrir(base, codigo);
  const nit = soloDigitos(cliente.nit);

  // `REPLACE` anidado deja el NIT guardado en sólo dígitos dentro de la propia
  // consulta. Es feo y es lo que hay: la columna se escribió tal como la tecleó
  // quien cotizó, con sus puntos y su guion, y las filas viejas no se van a
  // reescribir para esto.
  const mismoDocumento = nit
    ? `OR (cliente_codigo IS NULL AND REPLACE(REPLACE(REPLACE(cliente_nit, '.', ''), '-', ''), ' ', '') = ?)`
    : '';
  const donde = `WHERE eliminada_en IS NULL AND (cliente_codigo = ? ${mismoDocumento})`;
  const valores = nit ? [codigo, nit] : [codigo];

  const [resumen, filas, correos] = await base.batch<Record<string, unknown>>([
    base
      .prepare(
        `SELECT estado, COUNT(*) AS cuantas, COALESCE(SUM(total), 0) AS suma
           FROM cotizaciones ${donde} GROUP BY estado`,
      )
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
          LIMIT ?`,
      )
      .bind(...valores, ACTIVIDAD_POR_FICHA),
    base
      .prepare(
        `SELECT * FROM envios WHERE cliente_codigo = ? ORDER BY enviado_en DESC LIMIT ?`,
      )
      .bind(codigo, ACTIVIDAD_POR_FICHA),
  ]);

  return {
    totales: totalesDe(resumen?.results ?? []),
    cotizaciones: (filas?.results ?? []).map(aResumenCotizacion),
    envios: (correos?.results ?? []).map(aResumenEnvio),
  };
}

/** Las cuatro cifras, a partir del recuento por estado. */
function totalesDe(filas: readonly Record<string, unknown>[]): TotalesCliente {
  const totales: TotalesCliente = { cotizado: 0, ganado: 0, pendiente: 0, perdido: 0, cuantas: 0 };

  for (const fila of filas) {
    const suma = Number(fila.suma ?? 0);
    const cuantas = Number(fila.cuantas ?? 0);

    totales.cotizado += suma;
    totales.cuantas += cuantas;

    if (fila.estado === 'aceptada') totales.ganado += suma;
    else if (fila.estado === 'perdida') totales.perdido += suma;
    else totales.pendiente += suma;
  }

  return totales;
}

/**
 * Una fila de cotización, para la ficha.
 *
 * Es una copia reducida de `aResumen` del enrutador, y no una importación,
 * porque traerse aquella arrastraría media lógica del historial —la moneda, la
 * conversión, los estados— a un módulo que sólo necesita pintar una lista. Lo
 * que sí comparten es la forma: `ResumenCotizacion`, del contrato.
 */
function aResumenCotizacion(fila: Record<string, unknown>): ResumenCotizacion {
  const moneda = fila.moneda === 'USD' ? 'USD' : 'COP';

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
    totalMoneda: Number(fila.total_divisa) || Number(fila.total ?? 0),
    moneda,
    tasa: Number(fila.tasa) > 0 ? Number(fila.tasa) : 1,
    unidades: Number(fila.unidades ?? 0),
    estado: fila.estado === 'aceptada' || fila.estado === 'perdida' ? fila.estado : 'emitida',
    estadoNota: String(fila.estado_nota ?? ''),
    estadoEn: fila.estado_en ? String(fila.estado_en) : null,
    estadoPor: fila.estado_por ? String(fila.estado_por) : null,
    eliminadaEn: null,
    eliminadaPor: null,
  };
}

function aResumenEnvio(fila: Record<string, unknown>): ResumenEnvio {
  return {
    id: String(fila.id),
    enviadoEn: String(fila.enviado_en ?? ''),
    autor: String(fila.autor ?? ''),
    remitenteId: String(fila.remitente_id ?? ''),
    plantillaId: String(fila.plantilla_id ?? ''),
    asunto: String(fila.asunto ?? ''),
    destinatarios: listaGuardada(fila.destinatarios),
    cotizacionNumero: fila.cotizacion_numero ? String(fila.cotizacion_numero) : null,
    adjuntos: Number(fila.adjuntos ?? 0),
  };
}

// --- Escribir ---------------------------------------------------------------

export async function crear(base: D1Database, peticion: Request): Promise<Cliente> {
  return crearConDatos(base, await cuerpoJson<Partial<DatosCliente>>(peticion));
}

/**
 * El alta, a partir de datos que ya están en memoria.
 *
 * La usa la carga por lote, que lee un archivo entero y no tiene una petición
 * HTTP por cliente. Las comprobaciones son exactamente las mismas —pasa por
 * `datosSeguros` y por `comprobarLibre` igual que el alta de a uno— porque una
 * fila de Excel no merece menos cuidado que un formulario.
 */
export async function crearConDatos(
  base: D1Database,
  crudo: Partial<DatosCliente>,
): Promise<Cliente> {
  const datos = datosSeguros(crudo);
  await comprobarLibre(base, datos, null);

  const codigo = await siguienteCodigo(base);
  const ahora = new Date().toISOString();

  await base
    .prepare(
      `INSERT INTO clientes (
         codigo, empresa, nit, nit_digitos, tipo, contacto, cargo,
         telefono, whatsapp, correo, correo_normal, correos_extra, telefonos_extra,
         ciudad, direccion, notas, asesor, estado, empresa_normal,
         creado_en, actualizado_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(...valoresDe(codigo, datos), ahora, ahora)
    .run();

  return { ...datos, codigo, creadoEn: ahora, actualizadoEn: ahora, eliminadoEn: null, eliminadoPor: null };
}

export async function actualizar(
  base: D1Database,
  codigo: string,
  peticion: Request,
): Promise<Cliente> {
  return actualizarConDatos(base, codigo, await cuerpoJson<Partial<DatosCliente>>(peticion));
}

/** La edición, a partir de datos que ya están en memoria. Ver `crearConDatos`. */
export async function actualizarConDatos(
  base: D1Database,
  codigo: string,
  crudo: Partial<DatosCliente>,
): Promise<Cliente> {
  const antes = await abrir(base, codigo);
  const datos = datosSeguros(crudo);
  await comprobarLibre(base, datos, codigo);

  const ahora = new Date().toISOString();

  await base
    .prepare(
      `UPDATE clientes SET
         empresa = ?, nit = ?, nit_digitos = ?, tipo = ?, contacto = ?, cargo = ?,
         telefono = ?, whatsapp = ?, correo = ?, correo_normal = ?,
         correos_extra = ?, telefonos_extra = ?,
         ciudad = ?, direccion = ?, notas = ?, asesor = ?, estado = ?, empresa_normal = ?,
         actualizado_en = ?
       WHERE codigo = ?`,
    )
    // `valoresDe` empieza por el código y aquí va al final, así que se
    // descarta el primero en vez de escribir la lista dos veces.
    .bind(...valoresDe(codigo, datos).slice(1), ahora, codigo)
    .run();

  return { ...antes, ...datos, actualizadoEn: ahora };
}

/**
 * Rechaza un NIT o un correo que ya sean de otra ficha.
 *
 * El índice único del NIT lo impediría igual, pero lo haría con un error de
 * base de datos que la pantalla no sabe explicar. Aquí se comprueba antes para
 * poder decir **de quién** es —y para que la pantalla ofrezca abrir esa ficha
 * en vez de dejar a quien escribe adivinando.
 *
 * El correo no lleva índice único a propósito: dos empresas pueden compartir
 * el correo de la misma secretaria y eso es legítimo. Se avisa, se ofrece la
 * ficha existente, y quien esté escribiendo decide.
 */
async function comprobarLibre(
  base: D1Database,
  datos: DatosCliente,
  codigoPropio: string | null,
): Promise<void> {
  const nit = soloDigitos(datos.nit);
  if (!nit) return;

  const fila = await base
    .prepare('SELECT codigo, empresa, eliminado_en FROM clientes WHERE nit_digitos = ? LIMIT 1')
    .bind(nit)
    .first<Record<string, unknown>>();

  if (!fila || String(fila.codigo) === codigoPropio) return;

  const empresa = String(fila.empresa ?? '').trim();
  const donde = fila.eliminado_en ? ' Está en la papelera: se puede restaurar.' : '';
  throw new ErrorPeticion(
    409,
    'cliente-duplicado',
    `Ese ${datos.tipo === 'persona' ? 'documento' : 'NIT'} ya es de ${empresa || 'otra ficha'} ` +
      `(${String(fila.codigo)}).${donde}`,
    String(fila.codigo),
  );
}

/**
 * Gasta un código del contador y lo devuelve.
 *
 * Una sola sentencia, igual que el consecutivo de cotizaciones: dos personas
 * dando de alta a la vez no pueden llevarse el mismo código porque SQLite
 * serializa la escritura y cada una ve el contador ya incrementado por la otra.
 */
async function siguienteCodigo(base: D1Database): Promise<string> {
  const fila = await base
    .prepare(
      `INSERT INTO contadores (nombre, valor) VALUES ('clientes', 1)
       ON CONFLICT(nombre) DO UPDATE SET valor = valor + 1
       RETURNING valor`,
    )
    .first<{ valor: number }>();

  if (!fila) throw new Error('El contador de clientes no devolvió valor.');
  return formatoCodigoCliente(fila.valor);
}

// --- Papelera ---------------------------------------------------------------

export async function leerSeleccion(peticion: Request): Promise<SeleccionClientes> {
  const cuerpo = await cuerpoJson<{ codigos?: unknown; todos?: unknown; filtro?: unknown }>(peticion);

  if (cuerpo.todos === true) {
    return { todos: true, filtro: filtroSeguro(cuerpo.filtro as Partial<FiltroClientes>) };
  }

  const codigos = Array.isArray(cuerpo.codigos)
    ? cuerpo.codigos.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    : [];

  if (codigos.length === 0) {
    throw new ErrorPeticion(400, 'invalida', 'No se indicó ningún cliente.');
  }
  if (codigos.length > MAXIMO_SELECCION_CLIENTES) {
    throw new ErrorPeticion(
      400,
      'invalida',
      `No se pueden tocar más de ${MAXIMO_SELECCION_CLIENTES} clientes de una vez por código. ` +
        'Use el filtro y «seleccionar todos».',
    );
  }

  return { codigos };
}

/**
 * A qué fichas llega la operación.
 *
 * `papelera` no lo decide quien llama: lo decide la operación. Eliminar sólo
 * alcanza lo que está a la vista, y restaurar o purgar sólo lo que ya está
 * retirado — diga lo que diga el cuerpo de la petición.
 */
function alcanceDe(seleccion: SeleccionClientes, papelera: boolean): { donde: string; valores: unknown[] } {
  if ('todos' in seleccion) return dondeDe({ ...seleccion.filtro, papelera });

  const huecos = seleccion.codigos.map(() => '?').join(', ');
  return {
    donde: `WHERE ${papelera ? 'eliminado_en IS NOT NULL' : 'eliminado_en IS NULL'} AND codigo IN (${huecos})`,
    valores: [...seleccion.codigos],
  };
}

/**
 * Manda fichas a la papelera.
 *
 * **No toca ninguna cotización.** Es la promesa que hace que esto se pueda
 * usar sin miedo: quitar de en medio a un cliente que ya no compra no puede
 * costar el historial de lo que se le vendió.
 */
export async function eliminar(
  base: D1Database,
  seleccion: SeleccionClientes,
  correo: string,
): Promise<CuantosClientes> {
  const { donde, valores } = alcanceDe(seleccion, false);
  const resultado = await base
    .prepare(`UPDATE clientes SET eliminado_en = ?, eliminado_por = ? ${donde}`)
    .bind(new Date().toISOString(), correo, ...valores)
    .run();

  return { cuantos: resultado.meta.changes ?? 0 };
}

export async function restaurar(
  base: D1Database,
  seleccion: SeleccionClientes,
): Promise<CuantosClientes> {
  const { donde, valores } = alcanceDe(seleccion, true);
  const resultado = await base
    .prepare(`UPDATE clientes SET eliminado_en = NULL, eliminado_por = NULL ${donde}`)
    .bind(...valores)
    .run();

  return { cuantos: resultado.meta.changes ?? 0 };
}

/** Borra de verdad, y sólo lo que ya está en la papelera. */
export async function purgar(
  base: D1Database,
  seleccion: SeleccionClientes,
): Promise<CuantosClientes> {
  const { donde, valores } = alcanceDe(seleccion, true);
  const resultado = await base.prepare(`DELETE FROM clientes ${donde}`).bind(...valores).run();

  return { cuantos: resultado.meta.changes ?? 0 };
}

// --- Traducciones -----------------------------------------------------------

/**
 * Lo que llega de fuera, dejado en una ficha que se puede guardar.
 *
 * Nada se acepta tal cual: todo pasa por `texto` —que recorta y limita el
 * largo— y los dos campos cerrados se comprueban contra su lista. El correo
 * mal escrito se rechaza aquí y no en Resend tres días después.
 */
function datosSeguros(crudo: Partial<DatosCliente>): DatosCliente {
  const empresa = texto(crudo.empresa);
  if (!empresa) throw new ErrorPeticion(400, 'invalida', 'La ficha necesita al menos el nombre.');

  const correo = correoNormal(texto(crudo.correo));
  if (correo && !pareceCorreo(correo)) {
    throw new ErrorPeticion(400, 'invalida', `«${correo}» no es un correo válido.`);
  }

  return {
    empresa,
    nit: texto(crudo.nit, 40),
    tipo: esTipoCliente(crudo.tipo) ? crudo.tipo : 'empresa',
    contacto: texto(crudo.contacto),
    cargo: texto(crudo.cargo, 120),
    telefono: texto(crudo.telefono, 60),
    whatsapp: texto(crudo.whatsapp, 60),
    correo,
    correosExtra: listaSegura(crudo.correosExtra, (v) => {
      const limpio = correoNormal(v);
      if (limpio && !pareceCorreo(limpio)) {
        throw new ErrorPeticion(400, 'invalida', `«${limpio}» no es un correo válido.`);
      }
      return limpio;
    }).filter((v) => v !== correo),
    telefonosExtra: listaSegura(crudo.telefonosExtra, (v) => texto(v, 60)),
    ciudad: texto(crudo.ciudad, 120),
    direccion: texto(crudo.direccion, 300),
    notas: texto(crudo.notas, MAXIMO_NOTAS),
    asesor: texto(crudo.asesor, 120),
    estado: esEstadoCliente(crudo.estado) ? crudo.estado : 'prospecto',
  };
}

/** Una lista de textos de fuera: limpia, sin vacíos, sin repetidos y con tope. */
function listaSegura(crudo: unknown, limpiar: (valor: string) => string): string[] {
  if (!Array.isArray(crudo)) return [];
  const vistos = new Set<string>();
  for (const bruto of crudo) {
    if (typeof bruto !== 'string') continue;
    const limpio = limpiar(bruto);
    if (limpio) vistos.add(limpio);
    if (vistos.size >= MAXIMO_EXTRA) break;
  }
  return [...vistos];
}

/** Los valores del INSERT, en el orden de sus columnas. */
function valoresDe(codigo: string, d: DatosCliente): unknown[] {
  return [
    codigo,
    d.empresa,
    d.nit,
    soloDigitos(d.nit),
    d.tipo,
    d.contacto,
    d.cargo,
    d.telefono,
    d.whatsapp,
    d.correo,
    correoNormal(d.correo),
    JSON.stringify(d.correosExtra),
    JSON.stringify(d.telefonosExtra),
    d.ciudad,
    d.direccion,
    d.notas,
    d.asesor,
    d.estado,
    sinTildes(d.empresa),
  ];
}

/** Una fila de la base, vuelta ficha. */
function aCliente(fila: Record<string, unknown>): Cliente {
  return {
    codigo: String(fila.codigo),
    empresa: String(fila.empresa ?? ''),
    nit: String(fila.nit ?? ''),
    tipo: esTipoCliente(fila.tipo) ? fila.tipo : 'empresa',
    contacto: String(fila.contacto ?? ''),
    cargo: String(fila.cargo ?? ''),
    telefono: String(fila.telefono ?? ''),
    whatsapp: String(fila.whatsapp ?? ''),
    correo: String(fila.correo ?? ''),
    correosExtra: listaGuardada(fila.correos_extra),
    telefonosExtra: listaGuardada(fila.telefonos_extra),
    ciudad: String(fila.ciudad ?? ''),
    direccion: String(fila.direccion ?? ''),
    notas: String(fila.notas ?? ''),
    asesor: String(fila.asesor ?? ''),
    estado: esEstadoCliente(fila.estado) ? fila.estado : 'prospecto',
    creadoEn: String(fila.creado_en ?? ''),
    actualizadoEn: String(fila.actualizado_en ?? ''),
    eliminadoEn: fila.eliminado_en ? String(fila.eliminado_en) : null,
    eliminadoPor: fila.eliminado_por ? String(fila.eliminado_por) : null,
  };
}

/**
 * Una lista guardada como JSON, vuelta arreglo.
 *
 * Nunca revienta: una fila con el JSON estropeado —por una carga a mano, por
 * una migración futura— deja la ficha sin sus correos adicionales, que es
 * molesto, en vez de tumbar el listado entero, que sería grave.
 */
function listaGuardada(crudo: unknown): string[] {
  if (typeof crudo !== 'string' || !crudo.trim()) return [];
  try {
    const leido: unknown = JSON.parse(crudo);
    return Array.isArray(leido) ? leido.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
