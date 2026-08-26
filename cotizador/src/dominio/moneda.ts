/**
 * En qué moneda va una cotización, y a cuántos pesos equivale.
 *
 * El listado de precios de la empresa está en pesos y no va a dejar de
 * estarlo: los proveedores facturan en pesos y el margen se calcula en pesos.
 * Cotizar en dólares es, entonces, **convertir al salir**, y la pregunta que
 * decide todo lo de este archivo es a cuántos pesos equivale un dólar y quién
 * lo dice.
 *
 * Lo dice el asesor, escribiendo la tasa, y **queda guardada dentro de la
 * cotización**. No se consulta a ningún servicio de tasas ni se toma del día
 * en que alguien reabra el documento, por la misma razón por la que el IVA
 * vive dentro de la cotización y no en el catálogo: lo que el cliente tiene
 * en la mano dice unas cifras, y esas cifras no pueden cambiar por debajo
 * porque el dólar se movió el martes siguiente.
 *
 * `tasa` son **pesos por una unidad de la moneda**: 1 en una cotización en
 * pesos, y la TRM pactada en una en dólares. Con eso, convertir es siempre lo
 * mismo en los dos sentidos y no hay que preguntarse en cuál va cada cifra:
 *
 *     pesos  = valor × tasa
 *     divisa = pesos ÷ tasa
 */

import { esMoneda, type Moneda } from '../../../compartido/historial';

export type { Moneda };
export { MONEDAS, NOMBRE_MONEDA, esMoneda } from '../../../compartido/historial';

/** La moneda de una cotización con su tasa: lo que hace falta para convertir. */
export interface Cambio {
  readonly moneda: Moneda;
  /** Pesos por una unidad de `moneda`. Siempre mayor que cero. */
  readonly tasa: number;
}

export const EN_PESOS: Cambio = { moneda: 'COP', tasa: 1 };

/**
 * Cuántos decimales tiene la moneda.
 *
 * El peso colombiano no se factura con centavos —de ahí el redondeo a entero
 * de toda la vida— y el dólar sí. Redondear un unitario en dólares a entero
 * convertiría 0,87 USD en 1 USD, un 15 % de sobreprecio en una sola línea.
 */
const DECIMALES: Record<Moneda, number> = { COP: 0, USD: 2 };

/**
 * Por debajo de esto, dos precios de la misma moneda son el mismo.
 *
 * Es la unidad más pequeña que la moneda distingue, y existe para que la
 * revisión contra el listado no marque como «precio desactualizado» la
 * diferencia que produce el propio redondeo al convertir.
 */
const TOLERANCIA: Record<Moneda, number> = { COP: 0.5, USD: 0.005 };

export function decimalesDe(moneda: Moneda): number {
  return DECIMALES[moneda];
}

export function toleranciaDe(moneda: Moneda): number {
  return TOLERANCIA[moneda];
}

/** Deja un importe con los decimales que la moneda admite. */
export function redondear(valor: number, moneda: Moneda): number {
  if (!Number.isFinite(valor)) return 0;
  const factor = 10 ** DECIMALES[moneda];
  return Math.round(valor * factor) / factor;
}

/**
 * El cambio de una cotización, tolerando documentos viejos.
 *
 * Las cotizaciones emitidas antes de que esto existiera no traen `moneda` ni
 * `tasa`, y se siguen abriendo desde el historial para regenerar su PDF. Sin
 * este único sitio donde se resuelve la ausencia, cada uno de los cinco que
 * convierten tendría que acordarse de que puede faltar.
 */
export function cambioDe(cotizacion: { moneda?: Moneda; tasa?: number }): Cambio {
  if (!esMoneda(cotizacion.moneda) || cotizacion.moneda === 'COP') return EN_PESOS;

  const tasa = Number(cotizacion.tasa);
  // Una cotización en dólares sin tasa utilizable no se puede convertir. Se
  // trata como pesos —lo que hace la conversión un no-op— en vez de dividir
  // por cero y llenar el PDF de «NaN»: las cifras del documento son las que
  // son, y lo único que se pierde es el equivalente en pesos.
  if (!Number.isFinite(tasa) || tasa <= 0) return EN_PESOS;

  return { moneda: 'USD', tasa };
}

/** De pesos a la moneda del documento, ya redondeado. */
export function aMoneda(pesos: number, cambio: Cambio): number {
  return redondear(pesos / cambio.tasa, cambio.moneda);
}

/**
 * De la moneda del documento a pesos, sin redondear.
 *
 * Sin redondear a propósito: quien lo llama sabe si lo que sigue es enseñar
 * una cifra (y entonces redondea a peso) o compararla con otra.
 */
export function aPesosDesde(valor: number, cambio: Cambio): number {
  return valor * cambio.tasa;
}

/**
 * Pasa un importe de un cambio a otro.
 *
 * Es lo que ocurre al cambiar la moneda de una cotización a medio armar: los
 * precios escritos a mano se convierten en vez de perderse, porque lo que el
 * asesor negoció es un importe, no una cifra atada a un símbolo.
 */
export function convertir(valor: number, desde: Cambio, hacia: Cambio): number {
  if (desde.moneda === hacia.moneda && desde.tasa === hacia.tasa) return valor;
  return redondear((valor * desde.tasa) / hacia.tasa, hacia.moneda);
}
