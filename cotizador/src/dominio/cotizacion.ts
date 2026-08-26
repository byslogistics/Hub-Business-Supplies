/**
 * Construcción y persistencia de la cotización en curso.
 *
 * El borrador vive en `localStorage`, igual que el carrito del sitio público:
 * cerrar la pestaña por accidente no debe costar una cotización a medio armar.
 * Lo que sí sale de aquí es el documento emitido, que se guarda en el
 * historial (`historial/almacen.ts`) para que las dos socias lo vean.
 */

import { PLANTILLA_POR_DEFECTO } from '../datos/condiciones';
import { catalogo } from './catalogo';
import { ASESORES } from '../datos/empresa';
import { hoyIso } from './formato';
import { aMoneda, cambioDe, convertir, EN_PESOS, type Cambio } from './moneda';
import { sugerirPrecio } from './precios';
import type { Cliente, Cotizacion, Linea, Producto } from './tipos';

const CLAVE_BORRADOR = 'bys-cotizador:borrador';

export const CLIENTE_VACIO: Cliente = {
  empresa: '',
  nit: '',
  contacto: '',
  telefono: '',
  email: '',
  ciudad: '',
};

/**
 * Una cotización nueva nace **sin número**, y eso es a propósito.
 *
 * El consecutivo lo lleva ahora el servidor, no el navegador. El contador
 * local funcionaba con un solo asesor y se rompía con dos: cada navegador
 * tenía el suyo, así que dos personas cotizando el mismo día le entregaban
 * «COT-2026-0007» a dos clientes distintos, y nadie se enteraba hasta que
 * alguien cruzaba los dos PDF.
 *
 * Con el consecutivo central ya no se puede adivinar el número antes de
 * tiempo —depende de quién emita primero—, así que la pantalla dice «se
 * asigna al emitir» en vez de enseñar un número que podría cambiar. El número
 * llega al emitir, y desde ese momento acompaña al documento.
 */
export function cotizacionNueva(): Cotizacion {
  const fecha = hoyIso();
  return {
    numero: '',
    fecha,
    asesor: ASESORES[0]!,
    iva: catalogo.iva,
    // En pesos, que es la moneda del listado y la de casi todo lo que se
    // cotiza. Pasar a dólares es un cambio explícito de quien cotiza.
    moneda: 'COP',
    tasa: 1,
    catalogoVersion: catalogo.version,
    cliente: { ...CLIENTE_VACIO },
    lineas: [],
    condiciones: {
      ...PLANTILLA_POR_DEFECTO.condiciones,
      incluye: [...PLANTILLA_POR_DEFECTO.condiciones.incluye],
    },
  };
}

/**
 * Crea la línea de un producto con la cantidad y el precio que le corresponden.
 *
 * La cantidad por defecto es el mínimo publicado, que es lo que el asesor
 * termina escribiendo casi siempre y evita arrancar con un precio "bajo
 * mínimo" que no significa nada.
 */
export function lineaDesdeProducto(
  producto: Producto,
  opciones: { cantidad?: number; conLogo?: boolean; medida?: string } = {},
  cambio: Cambio = EN_PESOS,
): Linea {
  const conLogo = opciones.conLogo ?? (producto.admiteLogo && !producto.admiteSinLogo);
  const medida = opciones.medida ?? producto.medidas?.[0]?.nombre;
  const cantidad = opciones.cantidad ?? producto.minimo;
  const { unitario } = sugerirPrecio(producto, cantidad, { conLogo, medida });

  return {
    id: nuevoId(),
    productoId: producto.id,
    descripcion: producto.nombre,
    cantidad,
    conLogo,
    medida,
    // El listado está en pesos; la línea, en la moneda de la cotización.
    unitario: aMoneda(unitario, cambio),
    precioManual: false,
    descuento: 0,
  };
}

/**
 * Aplica cambios a una línea y recalcula el precio si toca.
 *
 * El precio se vuelve a sugerir cuando cambia algo que lo determina —cantidad,
 * logo o medida— salvo que el asesor ya lo haya escrito a mano: en ese caso su
 * número manda hasta que lo suelte.
 */
export function actualizarLinea(
  linea: Linea,
  cambios: Partial<Linea>,
  producto: Producto | undefined,
  cambio: Cambio = EN_PESOS,
): Linea {
  const siguiente: Linea = { ...linea, ...cambios };

  const cambioLaBase =
    ('cantidad' in cambios && cambios.cantidad !== linea.cantidad) ||
    ('conLogo' in cambios && cambios.conLogo !== linea.conLogo) ||
    ('medida' in cambios && cambios.medida !== linea.medida);

  const soltoElPrecio = cambios.precioManual === false;

  if (producto && (soltoElPrecio || (cambioLaBase && !siguiente.precioManual))) {
    siguiente.unitario = aMoneda(
      sugerirPrecio(producto, siguiente.cantidad, {
        conLogo: siguiente.conLogo,
        medida: siguiente.medida,
      }).unitario,
      cambio,
    );
    siguiente.precioManual = false;
  }

  return siguiente;
}

/**
 * Pasa una cotización entera a otra moneda, o a otra tasa.
 *
 * Los precios escritos a mano se **convierten**, no se recalculan: lo que el
 * asesor negoció es un importe, y 3.500 pesos pactados son 0,85 dólares, no
 * 3.500 dólares. Los demás se convierten igual — el resultado es el mismo que
 * volver a pedírselos al listado, porque de ahí salieron.
 *
 * Cambiar sólo la tasa (seguir en dólares con otra TRM) hace lo propio: los
 * automáticos se recolocan sobre la nueva tasa y los manuales se quedan como
 * están, porque son cifras en dólares que alguien decidió.
 */
export function convertirCotizacion(cotizacion: Cotizacion, hacia: Cambio): Cotizacion {
  const desde = cambioDe(cotizacion);
  const mismaMoneda = desde.moneda === hacia.moneda;

  return {
    ...cotizacion,
    moneda: hacia.moneda,
    tasa: hacia.tasa,
    lineas: cotizacion.lineas.map((linea) =>
      mismaMoneda && linea.precioManual
        ? linea
        : { ...linea, unitario: convertir(linea.unitario, desde, hacia) },
    ),
  };
}

/**
 * Completa una cotización que viene de fuera con lo que le falte.
 *
 * De fuera son dos sitios: el borrador de `localStorage` y el documento que
 * devuelve el historial al reabrir una cotización emitida. En los dos puede
 * faltar lo que se añadió después —la tarifa de IVA en su día, la moneda
 * ahora—, y dejarlo en `undefined` produce totales `NaN` y un PDF con «NaN»
 * impreso donde iba el total.
 */
export function normalizar(guardada: Cotizacion): Cotizacion {
  const cambio = cambioDe(guardada);
  return {
    ...guardada,
    iva: Number.isFinite(guardada.iva) ? guardada.iva : catalogo.iva,
    catalogoVersion: guardada.catalogoVersion ?? catalogo.version,
    moneda: cambio.moneda,
    tasa: cambio.tasa,
  };
}

export function guardarBorrador(cotizacion: Cotizacion): void {
  escribir(CLAVE_BORRADOR, cotizacion);
}

/** Recupera el borrador y completa lo que falte (ver `normalizar`). */
export function recuperarBorrador(): Cotizacion | null {
  const guardado = leer<Cotizacion>(CLAVE_BORRADOR);
  if (!guardado?.lineas || !Array.isArray(guardado.lineas)) return null;
  return normalizar(guardado);
}

export function descartarBorrador(): void {
  try {
    localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    /* Modo privado o almacenamiento lleno: se sigue sin persistencia. */
  }
}

export function nuevoId(): string {
  return crypto.randomUUID?.() ?? `l-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function leer<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* Ver `descartarBorrador`: perder el borrador no debe romper la pantalla. */
  }
}
