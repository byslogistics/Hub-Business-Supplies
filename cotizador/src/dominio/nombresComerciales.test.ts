import { describe, expect, it } from 'vitest';

import catalogo from '../datos/catalogo.json';
import nombresComerciales from '../datos/nombres-comerciales.json';

/**
 * El puente entre las dos formas de llamar a un producto.
 *
 * El listado de precios dice «PRECINTO ANCLA CAJAS»; la dueña vende «Precinto
 * Ancla para Cajas de Seguridad Plásticas». El catálogo guarda los dos: el
 * comercial en `nombre`, que es lo que el cliente lee en el PDF, y el del
 * listado en `referencia`, que es como el asesor busca.
 *
 * `nombres-comerciales.json` es lo que hace que esa correspondencia sobreviva
 * al listado de precios del año que viene: `scripts/extraer_catalogo.py` lo
 * aplica al regenerar. Y ahí está el punto frágil que estos tests vigilan —
 * LA CLAVE DEL MAPA ES EL id, Y EL id SALE DE LA REFERENCIA DEL LISTADO. Si en
 * el Excel de precios alguien corrige el nombre de una referencia, su id
 * cambia, el mapa deja de encontrarla y ese producto vuelve a salir en
 * mayúsculas en la cotización del cliente. Sin estos tests, eso se descubre
 * cuando el cliente recibe el PDF.
 */
describe('nombres comerciales', () => {
  const productos = catalogo.productos as Array<{
    id: string;
    nombre: string;
    referencia?: string;
  }>;
  const mapa = nombresComerciales.productos as Record<
    string,
    { nombre: string; referencia: string }
  >;

  it('cada entrada del mapa corresponde a un producto del catálogo', () => {
    const ids = new Set(productos.map((p) => p.id));
    const huerfanas = Object.keys(mapa).filter((id) => !ids.has(id));
    expect(
      huerfanas,
      'sobran entradas: o la referencia se renombró en el listado de precios, o dejó de venderse',
    ).toEqual([]);
  });

  it('el catálogo publica el nombre comercial que dice el mapa', () => {
    for (const producto of productos) {
      const comercial = mapa[producto.id];
      if (!comercial) continue;
      expect(producto.nombre, `${producto.id} no lleva su nombre comercial`).toBe(
        comercial.nombre,
      );
    }
  });

  it('todo producto renombrado conserva su referencia del listado', () => {
    for (const producto of productos) {
      const comercial = mapa[producto.id];
      if (comercial) {
        expect(
          producto.referencia,
          `${producto.id} perdió la referencia con la que el asesor lo busca`,
        ).toBe(comercial.referencia);
      } else {
        // Sin nombre comercial, la referencia hace las dos veces: repetir el
        // mismo texto en dos campos no informa de nada.
        expect(producto.referencia).toBeUndefined();
      }
    }
  });

  it('ninguna referencia del listado se publica sin traducir', () => {
    /*
     * Un nombre en MAYÚSCULAS SOSTENIDAS es una referencia del listado que se
     * coló al PDF del cliente. Se permiten las que todavía no tienen nombre
     * comercial aprobado —hoy siete—, pero no más: si el número sube, es que
     * una regeneración perdió el mapa por el camino.
     */
    const enMayusculas = productos.filter(
      (p) => p.nombre === p.nombre.toUpperCase() && /[A-Z]{4}/.test(p.nombre),
    );
    expect(
      enMayusculas.map((p) => p.id),
      'hay más referencias sin nombre comercial que las conocidas',
    ).toHaveLength(7);
  });

  it('el nombre comercial no deja dos productos indistinguibles', () => {
    /*
     * Dos productos pueden llamarse igual —la dueña le dio el mismo nombre
     * comercial a la cinta de 50 m y al rollo troquelado—, pero entonces la
     * referencia es lo único que los separa en el panel, y tiene que estar.
     */
    const porNombre = new Map<string, string[]>();
    for (const p of productos) {
      porNombre.set(p.nombre, [...(porNombre.get(p.nombre) ?? []), p.id]);
    }
    for (const [nombre, ids] of porNombre) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        const producto = productos.find((p) => p.id === id)!;
        expect(
          producto.referencia,
          `«${nombre}» se repite y ${id} no trae referencia para distinguirlo`,
        ).toBeTruthy();
      }
    }
  });
});
