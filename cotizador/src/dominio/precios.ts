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
  /** La cantidad cae en un escalón publicado de esta modalidad. */
  | 'escalon'
  /** No llega al escalón más bajo de esta modalidad; se propone ése igual. */
  | 'bajo-minimo'
  /**
   * Esta modalidad tiene precios, pero se quedan cortos para la cantidad
   * pedida y la otra modalidad sí la cubre. No se propone precio: elegir por
   * el asesor es justo lo que se le pide.
   */
  | 'otra-modalidad'
  /** El producto no publica ningún precio en esta modalidad. */
  | 'modalidad-no-publicada'
  /** El producto no tiene precios publicados, ni con logo ni sin él. */
  | 'sin-precio';

/** Lo que la otra modalidad sí ofrece para la cantidad pedida. */
export interface Alternativa {
  readonly conLogo: boolean;
  readonly escalon: Escalon;
}

export interface PrecioSugerido {
  readonly unitario: number;
  readonly escalon: Escalon | null;
  readonly motivo: MotivoPrecio;
  /** Cantidad a partir de la cual baja el siguiente escalón, si existe. */
  readonly siguienteEscalon: Escalon | null;
  /**
   * Cantidad más baja con precio publicado **en esta modalidad**.
   *
   * No es `producto.minimo`, que es el mínimo del producto entero: una
   * referencia que arranca en 100 sin logo puede arrancar en 1.000 con logo, y
   * avisar «por debajo del mínimo (100)» al pedir 100 con logo no dice nada.
   */
  readonly minimo: number | null;
  /**
   * El escalón de la **otra** modalidad que sí cubre la cantidad pedida.
   *
   * Se informa; no se cobra. Cambiar de sin logo a con logo cambia el producto
   * que se despacha, así que esa decisión es del asesor y no del cálculo.
   */
  readonly alternativa: Alternativa | null;
  /**
   * Escalón más alto que la cantidad alcanza en esta modalidad, aunque no se
   * proponga como precio. Es lo que permite ofrecer «cotizar las 1.000 al
   * precio de las 500 sin logo» como decisión explícita.
   */
  readonly topeDeLaModalidad: Escalon | null;
}

/**
 * Escalones de un producto para una variante concreta, de menor a mayor
 * cantidad.
 *
 * **El logo es una dimensión del precio, no una etiqueta.** El listado publica
 * dos tandas por referencia —«PRECINTO DENTADO DOBLE CIERRE 35 CMS» vale 900 a
 * partir de 100 unidades sin logo, y 400 a partir de 1.000 con logo— y cada
 * tanda es una escalera independiente. Mezclarlas es lo que hacía que pedir
 * 1.000 unidades sin logo devolviera el precio de 500 (550) en vez de decir
 * que sin logo no hay precio publicado para esa cantidad.
 *
 * Por eso aquí no hay red de seguridad: si la modalidad pedida no tiene
 * escalones, la lista sale vacía y `sugerirPrecio` lo dice. Los escalones sin
 * logo declarado —el producto que se vende igual marcado o no— sirven para las
 * dos modalidades, que es distinto de servir de repuesto de la otra.
 */
export function escalonesDe(producto: Producto, variante: Variante): Escalon[] {
  const porMedida = producto.escalones.filter((e) =>
    variante.medida ? e.medida === variante.medida : true,
  );

  const elegidos = porMedida.filter(
    (e) => e.logo === undefined || e.logo === variante.conLogo,
  );

  return [...elegidos].sort((a, b) => a.desde - b.desde);
}

/**
 * Escalones que son **exclusivos** de la otra modalidad.
 *
 * Los que no declaran logo valen para las dos, así que no son «la otra»: un
 * producto que se vende igual marcado o no —las bolsas, casi todos los
 * accesorios— no tiene dos escaleras y no debe ofrecer alternativa ninguna.
 */
function escalonesDeLaOtraModalidad(producto: Producto, variante: Variante): Escalon[] {
  return producto.escalones
    .filter((e) => (variante.medida ? e.medida === variante.medida : true))
    .filter((e) => e.logo !== undefined && e.logo !== variante.conLogo)
    .sort((a, b) => a.desde - b.desde);
}

/**
 * El listado publica precios distintos según la referencia lleve logo o no.
 *
 * Es falso en lo que se vende igual marcado o sin marcar —bolsas, accesorios—,
 * donde el logo es una nota de la línea y no una dimensión del precio.
 */
export function distingueLogo(producto: Producto): boolean {
  return producto.escalones.some((e) => e.logo !== undefined);
}

/** El escalón más alto que la cantidad alcanza, o `null` si no llega a ninguno. */
function escalonAlcanzado(escalones: readonly Escalon[], cantidad: number): Escalon | null {
  let alcanzado: Escalon | null = null;
  for (const escalon of escalones) {
    if (cantidad >= escalon.desde) alcanzado = escalon;
  }
  return alcanzado;
}

/**
 * Precio unitario que corresponde a una cantidad **en la modalidad pedida**.
 *
 * Dentro de la modalidad manda el escalón más alto que la cantidad alcanza:
 * pedir 1.500 cuando los escalones son 1.000 y 2.000 se cobra al precio de
 * 1.000. Si la cantidad no llega ni al escalón más bajo se propone ese precio
 * igual, marcado como `bajo-minimo` para que el asesor decida si lo respeta.
 *
 * Lo que no hace nunca es cruzar de modalidad. Cuando la cantidad pedida se
 * sale de la escalera de esta modalidad y la otra sí la cubre —el caso que
 * reportaron las clientas: 1.000 unidades sin logo, cuando sin logo el listado
 * llega hasta 500— devuelve `otra-modalidad` sin precio, con `alternativa`
 * apuntando al escalón que sí existe y `topeDeLaModalidad` al último escalón
 * de la escalera pedida. Elegir entre los dos es una decisión comercial, no
 * aritmética: son dos productos distintos, uno marcado y otro no.
 */
export function sugerirPrecio(
  producto: Producto,
  cantidad: number,
  variante: Variante,
): PrecioSugerido {
  const escalones = escalonesDe(producto, variante);
  const otros = escalonesDeLaOtraModalidad(producto, variante);

  const alcanzadoAqui = escalonAlcanzado(escalones, cantidad);
  const alcanzadoAlla = escalonAlcanzado(otros, cantidad);
  const alternativa: Alternativa | null = alcanzadoAlla
    ? { conLogo: !variante.conLogo, escalon: alcanzadoAlla }
    : null;

  const sinPrecio = (motivo: MotivoPrecio): PrecioSugerido => ({
    unitario: 0,
    escalon: null,
    motivo,
    siguienteEscalon: null,
    minimo: escalones[0]?.desde ?? null,
    alternativa,
    topeDeLaModalidad: alcanzadoAqui,
  });

  if (escalones.length === 0) {
    return sinPrecio(otros.length ? 'modalidad-no-publicada' : 'sin-precio');
  }

  // La otra escalera llega más lejos que ésta para esta cantidad: el precio
  // de aquí sería el de un escalón que la cantidad dejó atrás hace rato.
  if (alcanzadoAlla && (!alcanzadoAqui || alcanzadoAlla.desde > alcanzadoAqui.desde)) {
    return sinPrecio('otra-modalidad');
  }

  const primero = escalones[0]!;
  const escalon = alcanzadoAqui ?? primero;
  const siguienteEscalon = escalones.find((e) => e.desde > escalon.desde) ?? null;

  return {
    unitario: escalon.unitario,
    escalon,
    motivo: alcanzadoAqui ? 'escalon' : 'bajo-minimo',
    siguienteEscalon,
    minimo: primero.desde,
    alternativa,
    topeDeLaModalidad: alcanzadoAqui,
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
