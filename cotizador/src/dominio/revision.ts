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
  /** La cantidad no llega al mínimo publicado de la modalidad elegida. */
  | { readonly tipo: 'bajo-minimo'; readonly minimo: number; readonly conLogo: boolean }
  /**
   * El listado no publica precio para esta cantidad **en esta modalidad**.
   *
   * Es el aviso del error que reportaron las clientas: pedir 1.000 unidades
   * sin logo de una referencia que sin logo llega hasta 500. Antes se cobraban
   * a 550 sin decir nada; ahora la línea se queda sin precio y aquí van las
   * dos salidas que tiene el asesor —cambiar de modalidad, o cotizar a mano el
   * escalón más alto de ésta— con las cifras ya en la moneda del documento.
   */
  | {
      readonly tipo: 'sin-precio-en-modalidad';
      readonly conLogo: boolean;
      /** Mínimo publicado en la modalidad elegida, si tiene precios. */
      readonly minimo: number | null;
      /** Lo que sí cubre la cantidad en la otra modalidad. */
      readonly alternativa: {
        readonly conLogo: boolean;
        readonly desde: number;
        readonly unitario: number;
      } | null;
      /** Escalón más alto alcanzado en la modalidad elegida, si lo hay. */
      readonly tope: { readonly desde: number; readonly unitario: number } | null;
    };

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
  return (
    alerta.tipo === 'referencia-desconocida' ||
    alerta.tipo === 'precio-desactualizado' ||
    // Sin precio no hay oferta: la línea vale 0 hasta que alguien elija.
    alerta.tipo === 'sin-precio-en-modalidad'
  );
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

  // Las cifras que llevan las alertas van en la moneda del documento: se
  // pintan al lado del precio de la línea, y un aviso que compara dólares con
  // pesos no avisa de nada.
  const enDocumento = (valorEnPesos: number) => aMoneda(valorEnPesos, cambio);

  if (sugerido.motivo === 'bajo-minimo') {
    // El mínimo que se anuncia es el de la modalidad elegida, no el del
    // producto: una referencia que arranca en 100 sin logo puede arrancar en
    // 1.000 con logo, y decir «mínimo 100» al pedir 100 con logo no avisa nada.
    alertas.push({
      tipo: 'bajo-minimo',
      minimo: sugerido.minimo ?? producto.minimo,
      conLogo: linea.conLogo,
    });
  }

  if (sugerido.motivo === 'otra-modalidad' || sugerido.motivo === 'modalidad-no-publicada') {
    alertas.push({
      tipo: 'sin-precio-en-modalidad',
      conLogo: linea.conLogo,
      minimo: sugerido.minimo,
      alternativa: sugerido.alternativa
        ? {
            conLogo: sugerido.alternativa.conLogo,
            desde: sugerido.alternativa.escalon.desde,
            unitario: enDocumento(sugerido.alternativa.escalon.unitario),
          }
        : null,
      tope: sugerido.topeDeLaModalidad
        ? {
            desde: sugerido.topeDeLaModalidad.desde,
            unitario: enDocumento(sugerido.topeDeLaModalidad.unitario),
          }
        : null,
    });
  }

  // Comparar contra el listado sólo tiene sentido cuando el listado propuso
  // algo. Sin precio propuesto, el «vigente» sería 0 y el aviso diría que la
  // referencia bajó a cero.
  const tienePrecioSugerido =
    sugerido.motivo === 'escalon' || sugerido.motivo === 'bajo-minimo';
  const unitarioSugerido = enDocumento(sugerido.unitario);
  const difiere = Math.abs(unitarioSugerido - linea.unitario) > toleranciaDe(cambio.moneda);
  if (difiere && tienePrecioSugerido) {
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
