/**
 * Modelo de datos del cotizador.
 *
 * `Producto` y `Escalon` reflejan el catálogo generado desde el Excel: son de
 * sólo lectura y se regeneran con `npm run catalogo`. El resto —`Cliente`,
 * `Linea`, `Cotizacion`— es lo que arma el asesor en pantalla.
 *
 * Todo lo que sale del catálogo está **en pesos**, siempre: es la moneda en
 * la que compra la empresa y en la que se calcula el margen. Los importes que
 * arma el asesor —el unitario de cada línea— están en la moneda de la
 * cotización, que puede no ser ésa. Convertir entre las dos es cosa de
 * `dominio/moneda.ts`.
 */

import type { Moneda } from '../../../compartido/historial';

/** Un renglón de la lista de precios: desde `desde` unidades, vale `unitario`. */
export interface Escalon {
  /** Cantidad mínima a la que aplica este precio. */
  readonly desde: number;
  /** Precio por unidad, en pesos y sin IVA. */
  readonly unitario: number;
  /** Si el precio corresponde a la versión marcada con el logo del cliente. */
  readonly logo?: boolean;
  /** Sólo etiquetas: medida a la que aplica el precio, p. ej. "10 X 5 CMS". */
  readonly medida?: string;
  /** Nota del Excel pegada a este renglón. */
  readonly nota?: string;
}

/** Una medida cotizable de las etiquetas, con su recargo por largo extra. */
export interface Medida {
  readonly nombre: string;
  /**
   * Pesos por centímetro adicional sobre esta medida base. El listado lo
   * declara por medida, no por producto: cuanto más larga la etiqueta, más
   * barato sale cada centímetro extra.
   */
  readonly cmAdicional?: number;
}

export interface Producto {
  readonly id: string;
  readonly nombre: string;
  readonly categoria: string;
  readonly escalones: readonly Escalon[];
  /** Cantidad más baja con precio publicado. */
  readonly minimo: number;
  readonly admiteLogo: boolean;
  readonly admiteSinLogo: boolean;
  readonly medidas?: readonly Medida[];
  /** Empaque mínimo de despacho, p. ej. "Caja x 25". */
  readonly empaque?: string;
  readonly proveedor?: string;
  /** Costo de compra más bajo registrado. Interno: nunca sale en el PDF. */
  readonly costoReferencia?: number;
  readonly notas?: readonly string[];
}

export interface EquipoSatelital {
  readonly modelo: string;
  readonly tiers: readonly { desde: number; etiqueta: string; valor: number }[];
}

export interface Catalogo {
  readonly generadoEl: string;
  /** Huella de los precios. Cambia sólo si cambió algún precio. */
  readonly version: string;
  readonly origen: string;
  /** Tarifa de IVA que se propone al abrir una cotización nueva. */
  readonly iva: number;
  readonly categorias: readonly string[];
  readonly productos: readonly Producto[];
  readonly satelitales: {
    readonly equipos: readonly EquipoSatelital[];
    readonly planes: readonly EquipoSatelital[];
    readonly alquiler: readonly { periodo: string; valor: number }[];
  };
  /** Rarezas detectadas al leer el Excel. Se muestran en el panel de revisión. */
  readonly incidencias: readonly { tipo: string; detalle: string; producto?: string }[];
}

/** Datos del destinatario de la cotización. */
export interface Cliente {
  empresa: string;
  nit: string;
  contacto: string;
  telefono: string;
  email: string;
  ciudad: string;
}

/** Una línea de la cotización en construcción. */
export interface Linea {
  /** Identificador de la línea, no del producto: el mismo producto puede ir dos veces. */
  readonly id: string;
  readonly productoId: string;
  /** Texto que se imprime en el PDF; arranca con el nombre del producto y es editable. */
  descripcion: string;
  cantidad: number;
  conLogo: boolean;
  medida?: string;
  /** Precio unitario aplicado, sin IVA, **en la moneda de la cotización**. */
  unitario: number;
  /**
   * `true` cuando el asesor escribió el precio a mano. Mientras sea `false`,
   * el precio se recalcula solo al cambiar cantidad, logo o medida.
   */
  precioManual: boolean;
  /** Descuento de la línea, en porcentaje sobre el subtotal. */
  descuento: number;
}

export type FormaPago = 'Anticipado' | 'Contra entrega' | 'Crédito 30 días' | 'Crédito 45 días';

/** Condiciones comerciales que acompañan a la oferta. */
export interface Condiciones {
  validezDias: number;
  tiempoEntrega: string;
  formaPago: FormaPago;
  incluyeFlete: boolean;
  /** Viñetas libres que se imprimen bajo la tabla. */
  incluye: string[];
  observaciones: string;
}

export interface Cotizacion {
  numero: string;
  fecha: string;
  asesor: string;
  /**
   * Tarifa de IVA de **esta** cotización, como fracción.
   *
   * Va aquí y no en el catálogo a propósito. Cuando se leía del catálogo, un
   * cambio de tarifa recalculaba todas las cotizaciones guardadas: el PDF que
   * el cliente ya tenía en la mano decía un total y la pantalla otro. Con la
   * tarifa dentro del documento, lo emitido se queda como se emitió.
   *
   * También es lo que permite cotizar una exportación (0 %) sin tocar el
   * catálogo. Es cosa aparte de la moneda: una venta en dólares suele ir sin
   * IVA, pero las dos decisiones se toman por separado y no se implican.
   */
  iva: number;
  /**
   * La moneda de **esta** cotización.
   *
   * Va dentro del documento por lo mismo que el IVA: lo emitido conserva sus
   * cifras. El catálogo sigue estando en pesos pase lo que pase aquí.
   */
  moneda: Moneda;
  /**
   * Pesos por una unidad de `moneda`. Vale 1 cuando se cotiza en pesos, y la
   * TRM que escribió el asesor cuando se cotiza en dólares.
   *
   * Guardarla —en vez de consultarla al abrir— es lo que impide que el PDF
   * que el cliente ya tiene en la mano diga un total y la pantalla otro
   * porque el dólar se movió el martes siguiente.
   */
  tasa: number;
  /**
   * Versión del catálogo con la que se calcularon los precios. Sirve para
   * avisar, al reabrir un borrador, de que la lista de precios cambió.
   */
  catalogoVersion: string;
  cliente: Cliente;
  lineas: Linea[];
  condiciones: Condiciones;
}

/** Cifras de una línea ya calculadas. */
export interface TotalesLinea {
  readonly bruto: number;
  readonly descuento: number;
  readonly subtotal: number;
  readonly iva: number;
  readonly total: number;
}

/** Cifras del documento completo. */
export interface TotalesCotizacion extends TotalesLinea {
  readonly unidades: number;
}
