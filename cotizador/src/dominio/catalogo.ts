/**
 * Acceso al catálogo: índice por id, búsqueda y agrupación.
 *
 * El JSON lo genera `scripts/extraer_catalogo.py` desde el Excel. Aquí no se
 * corrige nada: si un precio está mal, se arregla en el Excel y se vuelve a
 * generar, para que la lista de precios siga teniendo una sola fuente.
 */

import datos from '../datos/catalogo.json';
import type { Catalogo, Producto } from './tipos';

export const catalogo = datos as unknown as Catalogo;

export const IVA = catalogo.iva;

const porId = new Map(catalogo.productos.map((p) => [p.id, p]));

export function productoPorId(id: string): Producto | undefined {
  return porId.get(id);
}

/** Quita tildes y mayúsculas para que "precinto guaya" encuentre "PRECINTO GUAYA". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/*
 * La referencia del listado de precios entra al índice junto al nombre
 * comercial. El asesor tiene delante la lista de precios, que dice
 * «PRECINTO ANCLA CAJAS», y el catálogo enseña «Precinto Ancla para Cajas de
 * Seguridad Plásticas»: sin la referencia dentro, esa búsqueda devolvía cero.
 */
const indiceBusqueda = new Map(
  catalogo.productos.map((p) => [
    p.id,
    normalizar(`${p.nombre} ${p.referencia ?? ''} ${p.categoria}`),
  ]),
);

/**
 * Búsqueda por palabras sueltas y en cualquier orden: "guaya 40" encuentra
 * "Precinto de Guaya Ref. 01 40 cm", y "PRECINTO GUAYA REF. 01 - 40 CMS"
 * también, porque la referencia del listado está en el índice. Con la consulta
 * vacía devuelve todo.
 */
export function buscarProductos(consulta: string, categoria?: string): Producto[] {
  const terminos = normalizar(consulta).split(/\s+/).filter(Boolean);

  return catalogo.productos.filter((producto) => {
    if (categoria && producto.categoria !== categoria) return false;
    if (terminos.length === 0) return true;
    const texto = indiceBusqueda.get(producto.id) ?? '';
    return terminos.every((termino) => texto.includes(termino));
  });
}

export interface GrupoDeProductos {
  readonly categoria: string;
  readonly productos: readonly Producto[];
}

/** Agrupa respetando el orden comercial que ya trae el catálogo. */
export function agruparPorCategoria(productos: readonly Producto[]): GrupoDeProductos[] {
  const grupos = new Map<string, Producto[]>();
  for (const producto of productos) {
    const lista = grupos.get(producto.categoria);
    if (lista) lista.push(producto);
    else grupos.set(producto.categoria, [producto]);
  }

  return catalogo.categorias
    .filter((categoria) => grupos.has(categoria))
    .map((categoria) => ({ categoria, productos: grupos.get(categoria)! }));
}

/** Rango de precios publicado, para orientar antes de elegir cantidad. */
export function rangoDePrecios(producto: Producto): { minimo: number; maximo: number } {
  const precios = producto.escalones.map((e) => e.unitario);
  return { minimo: Math.min(...precios), maximo: Math.max(...precios) };
}
