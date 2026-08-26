/**
 * Revisión de una cotización contra el listado de precios vigente.
 *
 * Existe por un caso concreto: el asesor arma una cotización el lunes, el
 * martes se regenera el catálogo porque un proveedor subió, y el miércoles
 * reabre el borrador y lo envía. La línea guarda el precio con el que se
 * armó, así que sin esta revisión la oferta sale al precio viejo sin que nada
 * lo advierta.
 *
 * Son funciones puras: reciben las líneas y una forma de buscar productos, y
 * devuelven qué habría que mirar. No deciden nada por su cuenta —corregir el
 * precio es del asesor— pero tampoco dejan que pase inadvertido.
 */

import { EN_PESOS, aMoneda, toleranciaDe, type Cambio } from './moneda';
import { sugerirPrecio } from './precios';
import type { Linea, Producto } from './tipos';

export type Alerta =
  /** La referencia ya no está en el listado: nadie puede verificar su precio. */
  | { readonly tipo: 'referencia-desconocida' }
  /** El listado cambió por debajo: el precio guardado ya no es el vigente. */
  | { readonly tipo: 'precio-desactualizado'; readonly guardado: number; readonly vigente: number }
  /** El asesor escribió el precio a mano; se recuerda cuál sugiere el listado. */
  | { readonly tipo: 'precio-manual'; readonly sugerido: number }
  /** La cantidad no llega al mínimo publicado. */
  | { readonly tipo: 'bajo-minimo'; readonly minimo: number };

/**
 * Una alerta que merece la franja de aviso al principio del formulario.
 *
 * Avisa, no bloquea: los botones de emitir siguen habilitados a propósito.
 * Que el listado haya cambiado no significa que la oferta esté mal —puede
 * haberse pactado el precio viejo—, y una herramienta que impide enviar
 * acabaría usándose por fuera. La decisión sigue siendo del asesor; lo que no
 * puede es tomarla sin enterarse.
 */
export function esGrave(alerta: Alerta): boolean {
  return alerta.tipo === 'referencia-desconocida' || alerta.tipo === 'precio-desactualizado';
}

/**
 * Revisa una línea contra el listado.
 *
 * `cambio` existe porque el listado está en pesos y la línea puede no
 * estarlo: lo que se compara es el precio del listado **ya convertido** a la
 * moneda del documento, y con la tolerancia de esa moneda. Comparar sin
 * convertir marcaría como «precio desactualizado» todas las líneas de una
 * cotización en dólares, y compararlas con la tolerancia del peso —medio
 * peso— las marcaría igual, porque medio peso es una diezmilésima de dólar y
 * el propio redondeo a centavos ya la supera.
 */
export function revisarLinea(
  linea: Linea,
  producto: Producto | undefined,
  cambio: Cambio = EN_PESOS,
): Alerta[] {
  if (!producto) return [{ tipo: 'referencia-desconocida' }];

  const alertas: Alerta[] = [];
  const sugerido = sugerirPrecio(producto, linea.cantidad, {
    conLogo: linea.conLogo,
    medida: linea.medida,
  });

  if (sugerido.motivo === 'bajo-minimo') {
    alertas.push({ tipo: 'bajo-minimo', minimo: producto.minimo });
  }

  // Las cifras que llevan las alertas van en la moneda del documento: se
  // pintan al lado del precio de la línea, y un aviso que compara dólares con
  // pesos no avisa de nada.
  const unitarioSugerido = aMoneda(sugerido.unitario, cambio);
  const difiere = Math.abs(unitarioSugerido - linea.unitario) > toleranciaDe(cambio.moneda);
  if (difiere && sugerido.motivo !== 'sin-precio') {
    // `precioManual` es lo que separa las dos causas de una misma diferencia:
    // o la escribió el asesor, o el listado cambió por debajo. Antes las dos
    // se anunciaban como «precio editado a mano», que en el segundo caso es
    // sencillamente falso.
    alertas.push(
      linea.precioManual
        ? { tipo: 'precio-manual', sugerido: unitarioSugerido }
        : { tipo: 'precio-desactualizado', guardado: linea.unitario, vigente: unitarioSugerido },
    );
  }

  return alertas;
}

export interface RevisionLinea {
  readonly lineaId: string;
  readonly alertas: readonly Alerta[];
}

export interface Revision {
  readonly porLinea: readonly RevisionLinea[];
  /** Líneas con algo que impide enviar a ciegas. */
  readonly graves: number;
}

export function revisarCotizacion(
  lineas: readonly Linea[],
  buscarProducto: (id: string) => Producto | undefined,
  cambio: Cambio = EN_PESOS,
): Revision {
  const porLinea = lineas.map((linea) => ({
    lineaId: linea.id,
    alertas: revisarLinea(linea, buscarProducto(linea.productoId), cambio),
  }));

  return {
    porLinea,
    graves: porLinea.filter(({ alertas }) => alertas.some(esGrave)).length,
  };
}
