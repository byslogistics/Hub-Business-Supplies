/**
 * Quién es quién en el equipo comercial.
 *
 * Un solo sitio para lo que estaba escrito en dos y ya se había desincronizado:
 * el cotizador tenía tres nombres que podían firmar una cotización
 * (`ASESORES`) y el correo tenía dos que podían firmar un correo
 * (`REMITENTES`), en archivos distintos, y añadir a alguien obligaba a
 * acordarse de los dos.
 *
 * Está en JavaScript llano y no en TypeScript porque lo cargan tres sitios y
 * uno de ellos no compila nada: `correo/index.html` lo pide tal cual desde el
 * navegador, con `<script type="module">`. Los tipos van en JSDoc, que el
 * compilador entiende igual.
 *
 * Para añadir o corregir a alguien, este archivo y nada más.
 */

/**
 * El buzón de la empresa, al que llega copia de todo.
 *
 * Todas las respuestas de los clientes pasan por aquí, y a propósito: hasta
 * agosto de 2026 volvían a un buzón que nadie miraba y se perdían sin dejar
 * rastro. Es además a donde apunta el reenvío del dominio.
 */
export const BUZON_ARCHIVO = 'byslogisticssas@gmail.com';

/**
 * @typedef {object} Miembro
 * @property {string} id
 * @property {string} nombre    Como firma: en el PDF y al pie del correo.
 * @property {string} cargo
 * @property {string} whatsapp
 * @property {string} correoDirecto A este buzón vuelven sus respuestas.
 */

/** @type {Record<string, Miembro>} */
export const EQUIPO = {
  yeimy: {
    id: 'yeimy',
    nombre: 'Yeimy Mahecha',
    cargo: 'Departamento comercial',
    whatsapp: '+57 321 418 9261',
    correoDirecto: 'byslogisticsltda@hotmail.com',
  },
  paola: {
    id: 'paola',
    nombre: 'Paola Vargas',
    cargo: 'Departamento comercial',
    whatsapp: '+57 311 253 3085',
    // Paola también entra al buzón de Hotmail, pero la empresa está pasando
    // todo al de arriba. Empezar por aquí es empezar la mudanza.
    correoDirecto: BUZON_ARCHIVO,
  },
  neyla: {
    id: 'neyla',
    nombre: 'Neyla Mahecha',
    cargo: 'Departamento comercial · Panamá',
    // El mismo número que ya estaba en los datos de la empresa como el
    // teléfono de Panamá. No es un dato nuevo: es el mismo con nombre.
    whatsapp: '+507 6302 0175',
    correoDirecto: BUZON_ARCHIVO,
  },
  equipo: {
    id: 'equipo',
    nombre: 'Equipo comercial B&S Logistics',
    cargo: 'Departamento comercial',
    // El celular principal de la empresa, el mismo del botón de WhatsApp del
    // cotizador.
    whatsapp: '+57 320 951 4930',
    correoDirecto: BUZON_ARCHIVO,
  },
};

/** El orden en que salen en los desplegables. El primero es el de por defecto. */
export const ORDEN_EQUIPO = ['yeimy', 'paola', 'neyla', 'equipo'];

/** Los nombres que pueden firmar, en orden. */
export const NOMBRES_EQUIPO = ORDEN_EQUIPO.map((id) => EQUIPO[id].nombre);

/**
 * Quién es, a partir del nombre que quedó escrito en una cotización.
 *
 * Las cotizaciones guardan el nombre y no el identificador —es lo que se
 * imprime en el PDF— así que al mandarla por correo hay que volver del nombre a
 * la persona. Compara sin tildes ni mayúsculas: lo emitido hace un año puede
 * traerlo escrito de otra forma.
 *
 * @param {string} nombre
 * @returns {Miembro | null}
 */
export function porNombre(nombre) {
  const buscado = normalizar(nombre);
  if (!buscado) return null;
  return ORDEN_EQUIPO.map((id) => EQUIPO[id]).find((m) => normalizar(m.nombre) === buscado) ?? null;
}

/**
 * A dónde vuelven las respuestas de un correo que firma esta persona.
 *
 * **Siempre dos, y el archivo primero.** Algunos programas de correo se quedan
 * sólo con la primera dirección al responder, así que el orden decide qué buzón
 * no se puede quedar sin la respuesta — y ése tiene que ser el de la empresa.
 *
 * @param {Miembro} miembro
 * @returns {string[]}
 */
export function respuestasDe(miembro) {
  return [...new Set([BUZON_ARCHIVO, miembro.correoDirecto])];
}

/** @param {string} valor */
function normalizar(valor) {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
