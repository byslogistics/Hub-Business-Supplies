import { beforeEach, describe, expect, it } from 'vitest';

import { clienteVacio } from '../../../compartido/clientes';
import type { Cotizacion } from '../dominio/tipos';
import { almacenLocal as historial } from '../historial/almacenLocal';
import { clientesLocales } from './almacenLocal';

/**
 * Las cuatro cifras de una ficha, contra el almacén de la vista previa.
 *
 * Lo que se comprueba es cómo se reparten: «ganado» es lo aceptado —que en este
 * hub es lo que significa «lo que ha comprado»—, «perdido» lo perdido, y todo lo
 * demás sigue pendiente. Equivocarse aquí no da un error: da una cifra que
 * alguien va a mirar el lunes para decidir.
 */
beforeEach(() => {
  const datos = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (clave: string) => datos.get(clave) ?? null,
      setItem: (clave: string, valor: string) => void datos.set(clave, valor),
      removeItem: (clave: string) => void datos.delete(clave),
    },
  });
});

function cotizacion(codigo: string | undefined, unitario: number): Cotizacion {
  return {
    numero: '',
    fecha: '2026-08-28',
    asesor: 'Paola Vargas',
    iva: 0,
    moneda: 'COP',
    tasa: 1,
    catalogoVersion: 'v1',
    clienteCodigo: codigo,
    cliente: {
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
      contacto: '',
      telefono: '',
      email: '',
      ciudad: '',
    },
    lineas: [
      {
        id: 'l1',
        productoId: 'p1',
        descripcion: 'X',
        cantidad: 1,
        conLogo: false,
        unitario,
        precioManual: true,
        descuento: 0,
      },
    ],
    condiciones: {
      validezDias: 15,
      tiempoEntrega: '8 días',
      formaPago: 'Anticipado',
      incluyeFlete: true,
      incluye: [],
      observaciones: '',
    },
  };
}

describe('las cifras de la ficha', () => {
  it('reparte lo cotizado entre ganado, pendiente y perdido', async () => {
    const ficha = await clientesLocales.crear({
      ...clienteVacio(),
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
    });

    const uno = await historial.registrar(cotizacion(ficha.codigo, 100));
    const dos = await historial.registrar(cotizacion(ficha.codigo, 200));
    await historial.registrar(cotizacion(ficha.codigo, 300));

    await historial.marcar(uno.numero, 'aceptada', 'orden de compra');
    await historial.marcar(dos.numero, 'perdida', '');

    const { totales } = await clientesLocales.actividad(ficha.codigo);

    expect(totales).toEqual({
      cotizado: 600,
      ganado: 100,
      pendiente: 300,
      perdido: 200,
      cuantas: 3,
    });
  });

  it('no cuenta las cotizaciones de otro cliente', async () => {
    const uno = await clientesLocales.crear({ ...clienteVacio(), empresa: 'Uno S.A.S.' });
    const dos = await clientesLocales.crear({ ...clienteVacio(), empresa: 'Dos Ltda.' });

    await historial.registrar(cotizacion(uno.codigo, 500));

    expect((await clientesLocales.actividad(dos.codigo)).totales.cuantas).toBe(0);
  });

  it('una ficha recién creada empieza en cero, no en blanco', async () => {
    const ficha = await clientesLocales.crear({ ...clienteVacio(), empresa: 'Nueva S.A.S.' });
    const actividad = await clientesLocales.actividad(ficha.codigo);

    expect(actividad.totales.cotizado).toBe(0);
    expect(actividad.cotizaciones).toEqual([]);
    // En la vista previa no se manda ningún correo: enseñar una lista inventada
    // haría creer que sí.
    expect(actividad.envios).toEqual([]);
  });
});
