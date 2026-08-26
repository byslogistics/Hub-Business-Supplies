/**
 * Reglas de precio. Todo lo de este archivo son funciones puras: es la parte
 * del cotizador que decide cuánto cuesta algo, y la que conviene poder probar
 * sin abrir un navegador (`src/dominio/precios.test.ts`).
 */

import { EN_PESOS, redondear, type Cambio, type Moneda } from './moneda';
import type {
  Escalon,
  Linea,
  Producto,
  TotalesCotizacion,
  TotalesLinea,
} from './tipos';

/** Criterios que estrechan la lista de precios de un producto. */
export interface Variante {
  conLogo: boolean;
  medida?: string;
}

/** Por qué el precio propuesto es el que es. */
export type MotivoPrecio =
  | 'escalon'
  | 'bajo-minimo'
  | 'sin-precio';

export interface PrecioSugerido {
  readonly unitario: number;
  readonly escalon: Escalon | null;
  readonly motivo: MotivoPrecio;
  /** Cantidad a partir de la cual baja el siguiente escalón, si existe. */
  readonly siguienteEscalon: Escalon | null;
}

/**
 * Escalones de un producto para una variante concreta, de menor a mayor
 * cantidad.
 *
 * El Excel no siempre distingue con/sin logo: cuando un producto tiene un solo
 * juego de precios, ese juego sirve para las dos variantes en vez de dejar el
 * producto sin precio.
 */
export function escalonesDe(producto: Producto, variante: Variante): Escalon[] {
  const porMedida = producto.escalones.filter((e) =>
    variante.medida ? e.medida === variante.medida : true,
  );

  const conLogoDefinido = porMedida.filter((e) => e.logo !== undefined);
  const candidatos = conLogoDefinido.length
    ? porMedida.filter((e) => e.logo === undefined || e.logo === variante.conLogo)
    : porMedida;

  const elegidos = candidatos.length ? candidatos : porMedida;
  return [...elegidos].sort((a, b) => a.desde - b.desde);
}

/**
 * Precio unitario que corresponde a una cantidad.
 *
 * Manda el escalón más alto que la cantidad alcanza; pedir 1.500 unidades
 * cuando los escalones son 1.000 y 2.000 se cobra al precio de 1.000. Si la
 * cantidad no llega ni al escalón más bajo se propone ese precio igual, pero
 * marcado como `bajo-minimo` para que el asesor decida si lo respeta.
 */
export function sugerirPrecio(
  producto: Producto,
  cantidad: number,
  variante: Variante,
): PrecioSugerido {
  const escalones = escalonesDe(producto, variante);
  if (escalones.length === 0) {
    return { unitario: 0, escalon: null, motivo: 'sin-precio', siguienteEscalon: null };
  }

  const primero = escalones[0]!;
  const aplicables = escalones.filter((e) => cantidad >= e.desde);
  const escalon = aplicables.length ? aplicables[aplicables.length - 1]! : primero;
  const siguienteEscalon = escalones.find((e) => e.desde > escalon.desde) ?? null;

  return {
    unitario: escalon.unitario,
    escalon,
    motivo: cantidad < primero.desde ? 'bajo-minimo' : 'escalon',
    siguienteEscalon,
  };
}

/**
 * Cuánto ahorraría el cliente si subiera al siguiente escalón.
 *
 * Es el argumento de venta que hoy el comercial hace de cabeza: "si me lleva
 * 2.000 en vez de 1.500, le sale más barato el total".
 */
export interface OportunidadVolumen {
  readonly cantidad: number;
  readonly unitario: number;
  readonly totalActual: number;
  readonly totalSugerido: number;
  /** Positivo cuando llevar más unidades cuesta menos dinero en total. */
  readonly ahorro: number;
  readonly unidadesExtra: number;
}

export function oportunidadDeVolumen(
  producto: Producto,
  cantidad: number,
  variante: Variante,
): OportunidadVolumen | null {
  const actual = sugerirPrecio(producto, cantidad, variante);
  const siguiente = actual.siguienteEscalon;
  if (!siguiente || cantidad >= siguiente.desde) return null;

  const totalActual = actual.unitario * cantidad;
  const totalSugerido = siguiente.unitario * siguiente.desde;

  return {
    cantidad: siguiente.desde,
    unitario: siguiente.unitario,
    totalActual,
    totalSugerido,
    ahorro: totalActual - totalSugerido,
    unidadesExtra: siguiente.desde - cantidad,
  };
}

/**
 * Cifras de una línea, redondeadas como admita la moneda.
 *
 * `moneda` decide sólo el redondeo —peso entero o centavo—, no la aritmética:
 * el unitario ya viene en la moneda del documento. Por defecto pesos, que es
 * como se cotizó siempre y como sigue viniendo todo lo que no diga otra cosa.
 */
export function totalesDeLinea(linea: Linea, iva: number, moneda: Moneda = 'COP'): TotalesLinea {
  const bruto = redondear(linea.unitario * linea.cantidad, moneda);
  const descuento = redondear((bruto * clamp(linea.descuento, 0, 100)) / 100, moneda);
  const subtotal = redondear(bruto - descuento, moneda);
  const impuesto = redondear(subtotal * iva, moneda);
  return {
    bruto,
    descuento,
    subtotal,
    iva: impuesto,
    total: redondear(subtotal + impuesto, moneda),
  };
}

export function totalesDeCotizacion(
  lineas: readonly Linea[],
  iva: number,
  moneda: Moneda = 'COP',
): TotalesCotizacion {
  const suma = lineas.reduce<TotalesCotizacion>(
    (acumulado, linea) => {
      const t = totalesDeLinea(linea, iva, moneda);
      return {
        bruto: acumulado.bruto + t.bruto,
        descuento: acumulado.descuento + t.descuento,
        subtotal: acumulado.subtotal + t.subtotal,
        iva: acumulado.iva + t.iva,
        total: acumulado.total + t.total,
        unidades: acumulado.unidades + linea.cantidad,
      };
    },
    { bruto: 0, descuento: 0, subtotal: 0, iva: 0, total: 0, unidades: 0 },
  );

  // Sumar centavos en coma flotante deja restos de la milésima —0,1 + 0,2 no
  // da 0,3 en ningún lenguaje— y ese resto acaba impreso en el PDF. Cada
  // sumando ya estaba redondeado; volver a redondear la suma la deja limpia
  // sin cambiar ninguna cifra.
  return {
    ...suma,
    bruto: redondear(suma.bruto, moneda),
    descuento: redondear(suma.descuento, moneda),
    subtotal: redondear(suma.subtotal, moneda),
    iva: redondear(suma.iva, moneda),
    total: redondear(suma.total, moneda),
  };
}

/**
 * Margen sobre el costo de compra registrado en el Excel.
 *
 * Es información interna de apoyo a la negociación: se ve en pantalla y no
 * se imprime en ningún documento que salga al cliente.
 *
 * El costo del catálogo está en pesos y el unitario de la línea en la moneda
 * del documento, así que la cuenta se hace en pesos: comparar 0,87 dólares
 * con un costo de 2.100 pesos daría un margen catastrófico e inventado.
 */
export function margenDeLinea(
  producto: Producto | undefined,
  linea: Linea,
  cambio: Cambio = EN_PESOS,
): number | null {
  const unitarioEnPesos = linea.unitario * cambio.tasa;
  if (!producto?.costoReferencia || unitarioEnPesos <= 0) return null;
  return (unitarioEnPesos - producto.costoReferencia) / unitarioEnPesos;
}

function clamp(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}
