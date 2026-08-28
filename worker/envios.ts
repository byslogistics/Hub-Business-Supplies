/**
 * Mandar correo, y dejar constancia de lo que se mandó.
 *
 * Estaba dentro de `worker/index.ts` y salió cuando el cotizador ganó su propio
 * botón de enviar: son dos caminos —un correo suelto y una cotización— que
 * comparten el mismo motor, las mismas comprobaciones de adjuntos y el mismo
 * registro. Tenerlos en un archivo es lo que impide que uno gane una regla y el
 * otro se quede sin ella.
 *
 * Dos cosas que valen para los dos caminos:
 *
 * 1. **El HTML se genera aquí**, nunca llega del navegador. Una petición
 *    manipulada no puede meter en el correo de la empresa nada distinto de lo
 *    que las plantillas permiten.
 * 2. **Todo lo que sale queda registrado** en la tabla `envios`: cuándo, a
 *    quién, quién lo firmó y de qué cotización era. El texto no — ver
 *    `migraciones/0006_envios.sql`.
 */

import { BUZON_ARCHIVO, porNombre, respuestasDe, type Miembro } from '../compartido/equipo.js';
import { correoNormal } from '../compartido/texto';
import { datosDeLaCotizacion } from '../cotizador/src/envios/correoCotizacion';
import type { Cotizacion } from '../cotizador/src/dominio/tipos';
import { EMPRESA, MAXIMO_ADJUNTOS_BYTES, PLANTILLAS, REMITENTES, renderCorreo } from '../correo/plantillas.js';
import type { Env } from './entorno';
import { cuerpoJson, ErrorPeticion, texto } from './http';

// --- Correo comercial -------------------------------------------------------

const RESEND_POR_DEFECTO = 'https://api.resend.com/emails';

/** Ningún correo necesita más de esto para venderle a un cliente. */
const MAXIMO_ADJUNTOS = 5;

interface AdjuntoRecibido {
  nombre?: string;
  tipo?: string;
  contenidoBase64?: string;
}

interface PeticionCorreo {
  remitenteId?: string;
  plantillaId?: string;
  destinatario?: string;
  asunto?: string;
  datos?: Record<string, string>;
  adjuntos?: AdjuntoRecibido[];
  /** Si la vendedora marcó "Enviarme una copia". La dirección de esa copia
   *  nunca sale de aquí — sale de `correo`, la identidad ya comprobada por
   *  Access, para que nadie pueda pedir copia a una dirección ajena. */
  copiaAlRemitente?: boolean;
  /** Qué botones (CTA) incluir: 'sitio', 'whatsapp', 'facebook', 'instagram'.
   *  Si no viene, `renderCorreo` usa los que la plantilla trae sugeridos. */
  ctas?: string[];
  /** Copia oculta al buzón de la empresa, para que quede archivado. */
  copiaArchivo?: boolean;
}

/** Las únicas claves de CTA que existen — cualquier otra cosa que llegue en
 *  `ctas` se descarta en silencio, igual que hace `ctasDe` en plantillas.js. */
const CLAVES_CTA_VALIDAS = new Set(['sitio', 'whatsapp', 'facebook', 'instagram']);

/** Ningún correo comercial necesita más destinatarios que esto de una vez. */
const MAXIMO_DESTINATARIOS = 5;

/**
 * El campo del formulario admite varias direcciones separadas por coma. Cada
 * una se valida por separado, y una sola inválida rechaza todo el envío —
 * mejor que la vendedora corrija el correo mal escrito a que uno de cinco
 * clientes se quede sin recibirlo en silencio.
 */
export function parsearDestinatarios(destinatario: string | undefined): string[] {
  const direcciones = (destinatario ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  if (direcciones.length === 0) {
    throw new ErrorPeticion(400, 'invalida', 'Falta el correo del destinatario.');
  }
  if (direcciones.length > MAXIMO_DESTINATARIOS) {
    throw new ErrorPeticion(400, 'invalida', `No se pueden mandar más de ${MAXIMO_DESTINATARIOS} destinatarios a la vez.`);
  }
  for (const direccion of direcciones) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(direccion)) {
      throw new ErrorPeticion(400, 'invalida', `«${direccion}» no es un correo válido.`);
    }
  }

  return direcciones;
}

/**
 * Manda un correo comercial por Resend.
 *
 * El HTML nunca viene del navegador: se vuelve a generar aquí con
 * `renderCorreo`, a partir sólo de los valores sueltos de los campos. Así una
 * petición manipulada no puede meter en el correo de la empresa nada distinto
 * a lo que las plantillas permiten.
 *
 * Quién lo envía —para dejar rastro en los registros de Resend— sale de
 * `correo`, el mismo dato que ya comprobó `quienEs` con el token de Access;
 * no se le pregunta a quien llama.
 */
export async function enviarCorreo(
  base: D1Database,
  peticion: Request,
  env: Env,
  correo: string,
): Promise<{ enviado: true; id: string }> {
  const cuerpo = await cuerpoJson<PeticionCorreo>(peticion);

  const { remitenteId, plantillaId, destinatario, asunto, datos, adjuntos, copiaAlRemitente, copiaArchivo, ctas } =
    cuerpo;

  if (!remitenteId || !(remitenteId in REMITENTES)) {
    throw new ErrorPeticion(400, 'invalida', 'Ese remitente no existe.');
  }
  if (!plantillaId || !(plantillaId in PLANTILLAS)) {
    throw new ErrorPeticion(400, 'invalida', 'Esa plantilla no existe.');
  }
  // La plantilla de cotización no se arma desde aquí, y no por capricho: sus
  // cifras —el número, el total— las pone el servidor leyendo la cotización
  // guardada, igual que el historial no acepta totales ya calculados. Dejarla
  // pasar por esta puerta permitiría mandar un correo con el membrete de la
  // empresa diciendo un total que no es el de ninguna cotización.
  if (plantillaId === 'cotizacion') {
    throw new ErrorPeticion(
      400,
      'invalida',
      'La cotización se envía desde el cotizador, no desde esta pantalla.',
    );
  }
  const destinatarios = parsearDestinatarios(destinatario);
  const ctasActivos = Array.isArray(ctas) ? ctas.filter((c) => CLAVES_CTA_VALIDAS.has(c)) : undefined;

  let generado: ReturnType<typeof renderCorreo>;
  try {
    generado = renderCorreo(remitenteId, plantillaId, datos ?? {}, ctasActivos);
  } catch (error) {
    throw new ErrorPeticion(400, 'invalida', error instanceof Error ? error.message : 'Datos inválidos.');
  }

  // El tamaño ya se comprobó en el navegador, pero eso es sólo para que la
  // vendedora no espere el envío para enterarse — la comprobación que cuenta
  // es esta, del lado del servidor.
  const adjuntosValidados = validarAdjuntos(adjuntos);

  const asuntoFinal = (asunto ?? '').trim() || generado.asunto;

  const id = await mandarPorResend(env, {
    remitente: generado.remitente,
    destinatarios,
    asunto: asuntoFinal,
    html: generado.html,
    adjuntos: adjuntosValidados,
    copiaArchivo: copiaArchivo === true,
    copiaAlAutor: copiaAlRemitente ? correo : null,
    quienLoMando: correo,
  });

  await registrarEnvio(base, {
    id,
    autor: correo,
    remitenteId: generado.remitente.id,
    plantillaId,
    asunto: asuntoFinal,
    destinatarios,
    clienteCodigo: await codigoDelCliente(base, destinatarios),
    cotizacionNumero: null,
    adjuntos: adjuntosValidados.length,
    copiaArchivo: copiaArchivo === true,
  });

  return { enviado: true, id };
}

/**
 * Manda por Resend y devuelve el identificador del envío.
 *
 * Aparte de quien lo llama porque son dos caminos y un solo motor: el correo
 * suelto de `/correo/` y el de una cotización. Que compartan esto es lo que
 * hace que las dos direcciones de respuesta y la copia al archivo funcionen
 * igual en los dos sitios sin que nadie tenga que acordarse.
 */
export async function mandarPorResend(
  env: Env,
  correo: {
    remitente: Miembro;
    destinatarios: string[];
    asunto: string;
    html: string;
    adjuntos: { nombre: string; contenidoBase64: string }[];
    copiaArchivo: boolean;
    copiaAlAutor: string | null;
    quienLoMando: string;
  },
): Promise<string> {
  // Las copias ocultas y no visibles: el cliente no tiene por qué ver los
  // buzones internos de la empresa en la cabecera de su correo.
  const ocultas = [
    ...(correo.copiaArchivo ? [BUZON_ARCHIVO] : []),
    // Siempre la identidad ya comprobada por Access, nunca una dirección que
    // venga del cuerpo de la petición.
    ...(correo.copiaAlAutor ? [correo.copiaAlAutor] : []),
  ];

  const respuesta = await fetch(env.RESEND_ENDPOINT || RESEND_POR_DEFECTO, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${correo.remitente.nombre} - B&S Logistics <${EMPRESA.correoVentas}>`,
      // Dos direcciones y el archivo primero: hasta agosto de 2026 las
      // respuestas volvían a un buzón que nadie miraba y se perdían. Algunos
      // programas de correo se quedan sólo con la primera al responder, así
      // que el orden decide qué buzón no puede quedarse sin la respuesta.
      reply_to: respuestasDe(correo.remitente),
      to: correo.destinatarios,
      subject: correo.asunto,
      html: correo.html,
      ...(ocultas.length > 0 ? { bcc: [...new Set(ocultas)] } : {}),
      ...(correo.adjuntos.length > 0
        ? { attachments: correo.adjuntos.map((a) => ({ filename: a.nombre, content: a.contenidoBase64 })) }
        : {}),
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    console.error(`Resend respondió ${respuesta.status} al correo de ${correo.quienLoMando}:`, detalle);
    throw new ErrorPeticion(502, 'fallo', 'Resend no pudo enviar el correo. Vuelva a intentarlo.');
  }

  const { id } = (await respuesta.json()) as { id: string };
  return id;
}

/** Los mismos tipos que deja elegir `correo/index.html` en el `accept` del
 *  input — se repite aquí porque el navegador es sólo la primera línea de
 *  defensa, nunca la que cuenta. */
const EXTENSIONES_ADJUNTOS_PERMITIDAS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'xlsx', 'xls', 'docx', 'doc',
]);

function extensionDe(nombre: string): string {
  return nombre.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Revisa el tipo, la cantidad y el peso de los adjuntos antes de mandarlos.
 *
 * `contenidoBase64` no se decodifica entero para pesarlo — de un texto en
 * base64 el tamaño real se calcula con su longitud, sin necesidad de volverlo
 * bytes primero.
 */
export function validarAdjuntos(adjuntos: AdjuntoRecibido[] | undefined): { nombre: string; contenidoBase64: string }[] {
  if (!adjuntos || adjuntos.length === 0) return [];

  if (adjuntos.length > MAXIMO_ADJUNTOS) {
    throw new ErrorPeticion(400, 'invalida', `No se pueden adjuntar más de ${MAXIMO_ADJUNTOS} archivos.`);
  }

  let pesoTotal = 0;
  const validados: { nombre: string; contenidoBase64: string }[] = [];

  for (const adjunto of adjuntos) {
    const nombre = (adjunto?.nombre ?? '').trim();
    const contenidoBase64 = (adjunto?.contenidoBase64 ?? '').trim();
    if (!nombre || !contenidoBase64) {
      throw new ErrorPeticion(400, 'invalida', 'Uno de los adjuntos llegó incompleto.');
    }
    if (!EXTENSIONES_ADJUNTOS_PERMITIDAS.has(extensionDe(nombre))) {
      throw new ErrorPeticion(400, 'invalida', `«${nombre}» no es un tipo de archivo permitido.`);
    }

    pesoTotal += tamanoDeBase64(contenidoBase64);
    if (pesoTotal > MAXIMO_ADJUNTOS_BYTES) {
      throw new ErrorPeticion(
        400,
        'invalida',
        `Los adjuntos pesan más de lo permitido (máximo ${Math.round(MAXIMO_ADJUNTOS_BYTES / (1024 * 1024))} MB en total).`,
      );
    }

    validados.push({ nombre, contenidoBase64 });
  }

  return validados;
}

/** Bytes reales que representa un texto en base64, sin decodificarlo entero. */
function tamanoDeBase64(base64: string): number {
  const limpio = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const relleno = limpio.endsWith('==') ? 2 : limpio.endsWith('=') ? 1 : 0;
  return Math.floor((limpio.length * 3) / 4) - relleno;
}


// --- Enviar una cotización --------------------------------------------------

interface PeticionCotizacion {
  destinatario?: string;
  asunto?: string;
  mensaje?: string;
  remitenteId?: string;
  /** El PDF que el navegador acaba de generar, en base64. */
  pdfBase64?: string;
  nombrePdf?: string;
  adjuntos?: AdjuntoRecibido[];
  copiaAlRemitente?: boolean;
  copiaArchivo?: boolean;
  ctas?: string[];
}

/**
 * Manda por correo una cotización **ya guardada**.
 *
 * La diferencia con `enviarCorreo` es de dónde salen las cifras: aquí el
 * número, la fecha, el total y las condiciones se leen de la cotización que
 * está en la base y se calculan con las mismas funciones que usa la pantalla.
 * Del navegador sólo llegan el mensaje libre, los destinatarios y el PDF.
 *
 * Es la misma regla que gobierna el historial —el documento manda— aplicada al
 * correo: si el total pudiera venir ya escrito desde fuera, se podría mandar un
 * correo con el membrete de la empresa diciendo una cifra que no es la de
 * ninguna cotización.
 *
 * El PDF sí viene del navegador, y no hay alternativa razonable: lo genera
 * jsPDF en la pantalla y es exactamente el mismo archivo que se descarga. Lo
 * que se comprueba aquí es lo que se puede comprobar —que sea un PDF, que pese
 * lo que puede pesar—.
 */
export async function enviarCotizacion(
  base: D1Database,
  env: Env,
  numero: string,
  peticion: Request,
  autor: string,
): Promise<{ enviado: true; id: string }> {
  const fila = await base
    .prepare('SELECT documento, cliente_codigo FROM cotizaciones WHERE numero = ?')
    .bind(numero)
    .first<Record<string, unknown>>();

  if (!fila) {
    throw new ErrorPeticion(404, 'no-encontrada', `No hay ninguna cotización ${numero}.`);
  }

  const documento = JSON.parse(String(fila.documento)) as Cotizacion;
  const cuerpo = await cuerpoJson<PeticionCotizacion>(peticion);

  const remitente = remitenteDe(cuerpo.remitenteId, documento.asesor);
  const destinatarios = parsearDestinatarios(cuerpo.destinatario);
  const adjuntos = [...pdfDe(cuerpo, numero), ...validarAdjuntos(cuerpo.adjuntos)];

  let generado: ReturnType<typeof renderCorreo>;
  try {
    generado = renderCorreo(
      remitente.id,
      'cotizacion',
      datosDeLaCotizacion(documento, numero, texto(cuerpo.mensaje, 4000)),
      Array.isArray(cuerpo.ctas) ? cuerpo.ctas.filter((c) => CLAVES_CTA_VALIDAS.has(c)) : undefined,
    );
  } catch (error) {
    throw new ErrorPeticion(400, 'invalida', error instanceof Error ? error.message : 'Datos inválidos.');
  }

  const asunto = texto(cuerpo.asunto, 200) || generado.asunto;

  const id = await mandarPorResend(env, {
    remitente,
    destinatarios,
    asunto,
    html: generado.html,
    adjuntos,
    copiaArchivo: cuerpo.copiaArchivo === true,
    copiaAlAutor: cuerpo.copiaAlRemitente ? autor : null,
    quienLoMando: autor,
  });

  await registrarEnvio(base, {
    id,
    autor,
    remitenteId: remitente.id,
    plantillaId: 'cotizacion',
    asunto,
    destinatarios,
    clienteCodigo: fila.cliente_codigo ? String(fila.cliente_codigo) : null,
    cotizacionNumero: numero,
    adjuntos: adjuntos.length,
    copiaArchivo: cuerpo.copiaArchivo === true,
  });

  return { enviado: true, id };
}

/**
 * Quién firma el correo.
 *
 * Lo pide el navegador, pero si no lo dice —o dice algo que no existe— se cae
 * en quien firma la cotización, que es el dato que ya está dentro del
 * documento. Un correo sin firma no existe: siempre sale alguien.
 */
function remitenteDe(pedido: string | undefined, asesor: string): Miembro {
  if (pedido && pedido in REMITENTES) return REMITENTES[pedido]!;

  const porElAsesor = porNombre(asesor);
  if (porElAsesor) return porElAsesor;

  return REMITENTES.equipo!;
}

/**
 * El PDF, comprobado.
 *
 * Se exige de verdad y no «si viene»: una cotización que sale sin su PDF es un
 * correo que dice «adjunto encontrará» y no adjunta nada, y eso el cliente lo
 * lee como descuido de la empresa.
 */
function pdfDe(cuerpo: PeticionCotizacion, numero: string): { nombre: string; contenidoBase64: string }[] {
  const contenidoBase64 = (cuerpo.pdfBase64 ?? '').trim();
  if (!contenidoBase64) {
    throw new ErrorPeticion(400, 'invalida', 'La cotización llegó sin su PDF.');
  }
  if (tamanoDeBase64(contenidoBase64) > MAXIMO_ADJUNTOS_BYTES) {
    throw new ErrorPeticion(400, 'invalida', 'El PDF de la cotización pesa demasiado.');
  }

  const nombre = texto(cuerpo.nombrePdf, 120) || `${numero}.pdf`;
  return [{ nombre: nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`, contenidoBase64 }];
}

// --- El registro ------------------------------------------------------------

interface FilaEnvio {
  id: string;
  autor: string;
  remitenteId: string;
  plantillaId: string;
  asunto: string;
  destinatarios: string[];
  clienteCodigo: string | null;
  cotizacionNumero: string | null;
  adjuntos: number;
  copiaArchivo: boolean;
}

/**
 * Deja constancia de un correo que ya salió.
 *
 * **Nunca tumba el envío.** Si esto falla, el correo ya está en manos del
 * cliente y decirle a quien lo mandó que falló sería mentirle —y lo haría
 * mandarlo otra vez—. Se anota en la consola y se sigue: perder una fila de
 * registro es molesto, mandar la misma cotización dos veces es peor.
 */
async function registrarEnvio(base: D1Database, fila: FilaEnvio): Promise<void> {
  try {
    await base
      .prepare(
        `INSERT INTO envios (
           id, enviado_en, autor, remitente_id, plantilla_id, asunto,
           destinatarios, cliente_codigo, cotizacion_numero, adjuntos, copia_archivo
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        fila.id,
        new Date().toISOString(),
        fila.autor,
        fila.remitenteId,
        fila.plantillaId,
        fila.asunto,
        JSON.stringify(fila.destinatarios),
        fila.clienteCodigo,
        fila.cotizacionNumero,
        fila.adjuntos,
        fila.copiaArchivo ? 1 : 0,
      )
      .run();
  } catch (error) {
    console.error('El correo salió pero no se pudo registrar:', error);
  }
}

/**
 * A qué ficha pertenece un correo suelto, mirando a quién iba.
 *
 * Es lo que hace que un correo escrito desde `/correo/` acabe también en la
 * ficha de su cliente sin que nadie tenga que elegirlo. Basta con que una de
 * las direcciones sea la de una ficha; si no coincide ninguna, el envío queda
 * registrado sin cliente, que es correcto —se le escribió a alguien que no está
 * en la base.
 */
async function codigoDelCliente(base: D1Database, destinatarios: string[]): Promise<string | null> {
  for (const destinatario of destinatarios) {
    const correo = correoNormal(destinatario);
    if (!correo) continue;

    const fila = await base
      .prepare(
        `SELECT codigo FROM clientes
          WHERE eliminado_en IS NULL AND (correo_normal = ? OR correos_extra LIKE ?)
          LIMIT 1`,
      )
      .bind(correo, `%"${correo}"%`)
      .first<{ codigo: string }>();

    if (fila) return fila.codigo;
  }

  return null;
}
