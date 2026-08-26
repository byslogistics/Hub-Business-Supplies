import { describe, expect, it } from 'vitest';

import { esGrave, revisarCotizacion, revisarLinea } from './revision';
import type { Linea, Producto } from './tipos';

const producto: Producto = {
  id: 'precinto-demo',
  nombre: 'PRECINTO DEMO',
  categoria: 'Precintos plásticos',
  minimo: 1000,
  admiteLogo: true,
  admiteSinLogo: false,
  escalones: [
    { desde: 1000, unitario: 400, logo: true },
    { desde: 5000, unitario: 320, logo: true },
  ],
};

function linea(parcial: Partial<Linea> = {}): Linea {
  return {
    id: 'l1',
    productoId: producto.id,
    descripcion: producto.nombre,
    cantidad: 1000,
    conLogo: true,
    unitario: 400,
    precioManual: false,
    descuento: 0,
    ...parcial,
  };
}

describe('revisarLinea', () => {
  it('no dice nada cuando la línea coincide con el listado', () => {
    expect(revisarLinea(linea(), producto)).toEqual([]);
  });

  it('avisa cuando la referencia ya no está en el listado', () => {
    // Es el caso de una referencia renombrada en el Excel: la línea guarda un
    // precio que nadie puede contrastar contra nada.
    expect(revisarLinea(linea(), undefined)).toEqual([{ tipo: 'referencia-desconocida' }]);
  });

  it('detecta el precio que quedó viejo tras regenerar el catálogo', () => {
    // La línea se armó a $400 y el listado ya va por $480.
    const subido: Producto = {
      ...producto,
      escalones: [{ desde: 1000, unitario: 480, logo: true }],
    };
    expect(revisarLinea(linea(), subido)).toEqual([
      { tipo: 'precio-desactualizado', guardado: 400, vigente: 480 },
    ]);
  });

  it('distingue el precio escrito a mano del precio desactualizado', () => {
    // Misma diferencia de precio, causa distinta: aquí la escribió el asesor.
    const alertas = revisarLinea(linea({ unitario: 380, precioManual: true }), producto);
    expect(alertas).toEqual([{ tipo: 'precio-manual', sugerido: 400 }]);
  });

  it('avisa de la cantidad por debajo del mínimo', () => {
    const alertas = revisarLinea(linea({ cantidad: 500 }), producto);
    expect(alertas).toContainEqual({ tipo: 'bajo-minimo', minimo: 1000 });
  });

  it('no confunde decimales con un cambio de precio', () => {
    const conDecimales: Producto = {
      ...producto,
      escalones: [{ desde: 1000, unitario: 400.34, logo: true }],
    };
    expect(revisarLinea(linea(), conDecimales)).toEqual([]);
  });

  it('no reclama por un producto sin precio para esa variante', () => {
    const sinPrecio: Producto = { ...producto, escalones: [] };
    expect(revisarLinea(linea(), sinPrecio)).toEqual([]);
  });
});

describe('esGrave', () => {
  it('bloquean el envío las que impiden verificar el precio', () => {
    expect(esGrave({ tipo: 'referencia-desconocida' })).toBe(true);
    expect(esGrave({ tipo: 'precio-desactualizado', guardado: 1, vigente: 2 })).toBe(true);
  });

  it('no bloquean las decisiones del asesor', () => {
    expect(esGrave({ tipo: 'precio-manual', sugerido: 400 })).toBe(false);
    expect(esGrave({ tipo: 'bajo-minimo', minimo: 1000 })).toBe(false);
  });
});

describe('revisarLinea en dólares', () => {
  const enDolares = { moneda: 'USD', tasa: 4000 } as const;

  it('no marca nada cuando la línea es el precio del listado convertido', () => {
    // 400 pesos a 4.000 son 0,10 dólares. Comparar sin convertir marcaría
    // todas las líneas de una cotización en dólares como desactualizadas.
    expect(revisarLinea(linea({ unitario: 0.1 }), producto, enDolares)).toEqual([]);
  });

  it('tolera lo que cuesta el propio redondeo a centavos', () => {
    // 480 pesos a 4.100 son 0,117…: se guarda 0,12, que de vuelta son 492. Con
    // la tolerancia del peso —medio peso— eso se marcaría como precio
    // desactualizado en cada línea, siempre.
    const catalogoSubido: Producto = {
      ...producto,
      escalones: [{ desde: 1000, unitario: 480, logo: true }],
    };

    expect(revisarLinea(linea({ unitario: 0.12 }), catalogoSubido, { moneda: 'USD', tasa: 4100 }))
      .toEqual([]);
  });

  it('sigue avisando de verdad cuando el listado cambió, y en dólares', () => {
    const catalogoSubido: Producto = {
      ...producto,
      escalones: [{ desde: 1000, unitario: 800, logo: true }],
    };

    expect(revisarLinea(linea({ unitario: 0.1 }), catalogoSubido, enDolares)).toEqual([
      // Las dos cifras van en la moneda del documento: un aviso que compara
      // dólares con pesos no avisa de nada.
      { tipo: 'precio-desactualizado', guardado: 0.1, vigente: 0.2 },
    ]);
  });
});

describe('revisarCotizacion', () => {
  const buscar = (id: string) => (id === producto.id ? producto : undefined);

  it('cuenta sólo las líneas con algo grave', () => {
    const revision = revisarCotizacion(
      [
        linea({ id: 'ok' }),
        linea({ id: 'manual', unitario: 380, precioManual: true }),
        linea({ id: 'huerfana', productoId: 'ya-no-existe' }),
      ],
      buscar,
    );

    expect(revision.graves).toBe(1);
    expect(revision.porLinea).toHaveLength(3);
    expect(revision.porLinea.find((r) => r.lineaId === 'ok')?.alertas).toEqual([]);
  });

  it('devuelve una revisión vacía sin líneas', () => {
    expect(revisarCotizacion([], buscar)).toEqual({ porLinea: [], graves: 0 });
  });
});
