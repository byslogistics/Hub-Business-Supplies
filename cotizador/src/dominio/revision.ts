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
 * Diferencia por debajo de la cual dos precios se consideran el mismo. Los
 * unitarios del listado llegan con hasta dos decimales.
 */
const TOLERANCIA = 0.5;

export function revisarLinea(linea: Linea, producto: Producto | undefined): Alerta[] {
  if (!producto) return [{ tipo: 'referencia-desconocida' }];

  const alertas: Alerta[] = [];
  const sugerido = sugerirPrecio(producto, linea.cantidad, {
    conLogo: linea.conLogo,
    medida: linea.medida,
  });

  if (sugerido.motivo === 'bajo-minimo') {
    alertas.push({ tipo: 'bajo-minimo', minimo: producto.minimo });
  }

  const difiere = Math.abs(sugerido.unitario - linea.unitario) > TOLERANCIA;
  if (difiere && sugerido.motivo !== 'sin-precio') {
    // `precioManual` es lo que separa las dos causas de una misma diferencia:
    // o la escribió el asesor, o el listado cambió por debajo. Antes las dos
    // se anunciaban como «precio editado a mano», que en el segundo caso es
    // sencillamente falso.
    alertas.push(
      linea.precioManual
        ? { tipo: 'precio-manual', sugerido: sugerido.unitario }
        : { tipo: 'precio-desactualizado', guardado: linea.unitario, vigente: sugerido.unitario },
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
): Revision {
  const porLinea = lineas.map((linea) => ({
    lineaId: linea.id,
    alertas: revisarLinea(linea, buscarProducto(linea.productoId)),
  }));

  return {
    porLinea,
    graves: porLinea.filter(({ alertas }) => alertas.some(esGrave)).length,
  };
}
