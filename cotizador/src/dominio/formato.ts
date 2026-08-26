/**
 * Formato colombiano de cifras y fechas.
 *
 * Los `Intl.NumberFormat` se crean una sola vez: construirlos dentro de un
 * render cuesta más que formatear.
 */

import { decimalesDe, type Cambio, type Moneda } from './moneda';

const MONEDA = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MONEDA_SIN_SIMBOLO = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * El dólar, escrito como lo escribe Colombia: «US$ 1.250,00».
 *
 * Con símbolo explícito y con centavos. Un «$ 1.250» a secas en un documento
 * que va en dólares se lee como mil doscientos cincuenta pesos —son cuatro
 * millones de diferencia— y por eso el símbolo del dólar no se abrevia en
 * ninguna cifra de este cotizador.
 */
const DOLAR = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DOLAR_SIN_SIMBOLO = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const ENTERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const PORCENTAJE = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * La moneda, dicha con todas las letras.
 *
 * Los documentos que salen al cliente la declaran, porque el «$» que imprime
 * `pesos()` lo comparten el peso y el dólar —y la empresa atiende también
 * Panamá—, y en las celdas de la tabla del PDF el número va sin símbolo
 * ninguno. Quien recibe una oferta no tiene por qué averiguar en qué moneda
 * está.
 *
 * En dólares, además, se imprime la tasa con la que se convirtió. No es un
 * adorno: es lo que permite a los dos lados reconstruir la cifra en pesos
 * meses después, cuando el dólar ya esté en otro sitio.
 *
 * Vive aquí, junto a los formateadores, para que el PDF y el mensaje de
 * WhatsApp digan exactamente lo mismo.
 */
export function monedaDeclarada(cambio: Cambio): string {
  if (cambio.moneda === 'COP') {
    return 'Todas las cifras están expresadas en pesos colombianos (COP).';
  }
  return (
    'Todas las cifras están expresadas en dólares estadounidenses (USD). ' +
    `Tasa de conversión pactada: 1 USD = ${pesos(cambio.tasa)} COP.`
  );
}

/** "$ 1.250" — para pantalla. Sólo pesos; en dólares, `dinero`. */
export function pesos(valor: number): string {
  return MONEDA.format(valor).replace(/\s/g, ' ');
}

/**
 * "1.250" — para las tablas del PDF, donde repetir el símbolo en cada celda
 * sólo añadiría ruido. La moneda la declara `monedaDeclarada` bajo la tabla,
 * una vez y para todas las cifras del documento.
 */
export function pesosSinSimbolo(valor: number): string {
  return MONEDA_SIN_SIMBOLO.format(valor);
}

/**
 * Un importe en la moneda que sea: "$ 1.250" o "US$ 0,87".
 *
 * Es la que usan todas las cifras que salen de la cotización —pantalla, PDF y
 * WhatsApp—. `pesos()` se queda para lo que es pesos pase lo que pase: el
 * costo de compra, el margen, y la suma del historial.
 */
export function dinero(valor: number, moneda: Moneda): string {
  return moneda === 'USD' ? DOLAR.format(valor).replace(/\s/g, ' ') : pesos(valor);
}

/** Lo mismo sin símbolo, para las celdas de la tabla del PDF. */
export function dineroSinSimbolo(valor: number, moneda: Moneda): string {
  return moneda === 'USD' ? DOLAR_SIN_SIMBOLO.format(valor) : pesosSinSimbolo(valor);
}

/**
 * Cuántos decimales admite escribir un campo de importe.
 *
 * En pesos, ninguno; en dólares, centavos. Es lo que hace que el campo del
 * unitario deje teclear «0,87» en vez de saltar de 0 a 1.
 */
export function pasoDe(moneda: Moneda): number {
  return 10 ** -decimalesDe(moneda);
}

export function unidades(valor: number): string {
  return ENTERO.format(valor);
}

export function porcentaje(fraccion: number): string {
  return PORCENTAJE.format(fraccion);
}

/** ISO `2026-08-13` → `13 de agosto de 2026`. */
export function fechaLarga(iso: string): string {
  return FECHA_LARGA.format(desdeIso(iso));
}

/** ISO `2026-08-13` → `13/08/2026`. */
export function fechaCorta(iso: string): string {
  const d = desdeIso(iso);
  return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
    .map((n, i) => (i < 2 ? String(n).padStart(2, '0') : n))
    .join('/');
}

export function hoyIso(): string {
  return aIso(new Date());
}

export function sumarDias(iso: string, dias: number): string {
  const fecha = desdeIso(iso);
  fecha.setDate(fecha.getDate() + dias);
  return aIso(fecha);
}

function aIso(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * `new Date('2026-08-13')` se interpreta como UTC y en Colombia (UTC-5) cae en
 * el día anterior. Construir la fecha por partes la deja en hora local.
 */
function desdeIso(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio ?? 1970, (mes ?? 1) - 1, dia ?? 1);
}
