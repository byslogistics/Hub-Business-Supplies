/**
 * Datos del emisor de la cotización.
 *
 * Se cruzaron dos fuentes: el sitio byslogistics-web (`src/data_files/
 * constants.ts`), que tiene los teléfonos y el correo comercial vigentes, y
 * las hojas COTIZACION FORMAL / COTIZACION YEIMY del listado de precios, que
 * son las únicas que traen NIT y dirección.
 *
 * Todo lo que se imprime en el pie del PDF sale de aquí; para cambiar un
 * teléfono no hay que tocar el generador de PDF.
 */

export const EMPRESA = {
  /**
   * Confirmado por la empresa: la razón social vigente es S.A.S. El `LTDA.`
   * que aparece en las hojas viejas del Excel es la forma anterior y no debe
   * volver a ningún documento que salga de aquí.
   */
  razonSocial: 'BUSINESS & SUPPLIES LOGISTICS S.A.S.',
  nombreComercial: 'B&S Logistics',
  eslogan: 'Líderes en Seguridad Preventiva',
  nit: '900.437.215-8',
  direccion: 'Carrera 86B No. 53 - 22 Sur, Bloque 13 Of. 152',
  ciudad: 'Bogotá D.C., Colombia',
  telefonos: ['(601) 469 9575', '(601) 469 9809'],
  celulares: ['320 951 4930', '311 253 3085', '321 418 9261'],
  panama: '(507) 6302 0175',
  email: 'ventas@precintosdeseguridad.co',
  sitioWeb: 'byslogistics.com.co',
  whatsapp: 'https://wa.me/573209514930',
  /** Cuenta bancaria: se deja vacía a propósito hasta que la confirmen. */
  datosBancarios: '',
} as const;

/**
 * Asesores que firman cotizaciones. El primero es el que se propone por
 * defecto en una cotización nueva.
 *
 * Salen de `compartido/equipo.js`, que es el mismo sitio del que salen los
 * remitentes del correo. Estaban escritos dos veces y ya se habían
 * desincronizado: el correo se quedó con dos personas cuando aquí ya había
 * tres. Para añadir a alguien se edita aquel archivo y nada más.
 */
export { NOMBRES_EQUIPO as ASESORES } from '../../../compartido/equipo.js';

/**
 * Tasa que se propone al pasar una cotización a dólares.
 *
 * Es un punto de partida para no arrancar en cero, **no la tasa del día**:
 * quien cotiza la corrige con la TRM que vaya a pactar, y la que quede
 * escrita se guarda dentro de la cotización. Conviene actualizar este número
 * de vez en cuando para que el punto de partida no quede ridículo, pero
 * ninguna cotización emitida depende de él: cada una lleva la suya.
 */
export const TASA_USD_SUGERIDA = 4000;

/**
 * Ciudades a las que el listado de precios promete flete incluido; el resto
 * se cotiza con flete contra entrega.
 */
export const CIUDADES_CON_FLETE: readonly string[] = [
  'Bogotá',
  'Medellín',
  'Bucaramanga',
  'Cali',
  'Manizales',
];
