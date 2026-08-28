import { describe, expect, it } from 'vitest';

import { EQUIPO, porNombre, respuestasDe, BUZON_ARCHIVO } from '../../../compartido/equipo.js';
import type { Cotizacion } from '../dominio/tipos';
import { datosDeLaCotizacion } from './correoCotizacion';

function cotizacion(cambios: Partial<Cotizacion> = {}): Cotizacion {
  return {
    numero: 'COT-2026-0007',
    fecha: '2026-08-28',
    asesor: 'Paola Vargas',
    iva: 0.19,
    moneda: 'COP',
    tasa: 1,
    catalogoVersion: 'v1',
    cliente: {
      empresa: 'Distribuidora La Sabana S.A.S.',
      nit: '830.011.234-5',
      contacto: 'Marcela Ríos',
      telefono: '',
      email: 'compras@lasabana.com',
      ciudad: 'Bogotá',
    },
    lineas: [
      {
        id: 'l1',
        productoId: 'p1',
        descripcion: 'PRECINTO',
        cantidad: 1000,
        conLogo: false,
        unitario: 1200,
        precioManual: true,
        descuento: 0,
      },
    ],
    condiciones: {
      validezDias: 15,
      tiempoEntrega: '8 días hábiles',
      formaPago: 'Anticipado',
      incluyeFlete: true,
      incluye: [],
      observaciones: '',
    },
    ...cambios,
  };
}

/**
 * Estas cifras las calcula el servidor leyendo la cotización guardada, y la
 * vista previa del navegador llama a la misma función. Que sea una sola es lo
 * que impide que la pantalla enseñe un total y salga otro.
 */
describe('las cifras del correo', () => {
  it('salen del documento, no de quien las pida', () => {
    // 1000 × 1200 con IVA del 19 %.
    expect(datosDeLaCotizacion(cotizacion(), 'COT-2026-0007', '').total).toBe('$ 1.428.000');
  });

  it('respeta la moneda de la cotización', () => {
    const enDolares = cotizacion({
      moneda: 'USD',
      tasa: 4000,
      lineas: [{ ...cotizacion().lineas[0]!, unitario: 0.3 }],
    });

    expect(datosDeLaCotizacion(enDolares, 'COT-2026-0007', '').total).toContain('US$');
  });

  it('saluda al contacto, y a la empresa sólo si no hay contacto', () => {
    expect(datosDeLaCotizacion(cotizacion(), 'X', '').nombreCliente).toBe('Marcela Ríos');

    const sinContacto = cotizacion({ cliente: { ...cotizacion().cliente, contacto: '' } });
    expect(datosDeLaCotizacion(sinContacto, 'X', '').nombreCliente).toBe(
      'Distribuidora La Sabana S.A.S.',
    );
  });

  it('lleva las condiciones que el cliente necesita para decidir', () => {
    const datos = datosDeLaCotizacion(cotizacion(), 'X', 'hola');

    expect(datos).toMatchObject({
      validez: '15 días',
      entrega: '8 días hábiles',
      pago: 'Anticipado',
      mensaje: 'hola',
    });
  });
});

describe('quién firma', () => {
  it('reconoce al asesor por el nombre que quedó escrito en la cotización', () => {
    // Las cotizaciones guardan el nombre, no el identificador: es lo que se
    // imprime en el PDF.
    expect(porNombre('Paola Vargas')?.id).toBe('paola');
    expect(porNombre('NEYLA MAHECHA')?.id).toBe('neyla');
    expect(porNombre('yeimy mahecha')?.id).toBe('yeimy');
  });

  it('no inventa una persona cuando el nombre no es de nadie', () => {
    expect(porNombre('Alguien Que No Está')).toBeNull();
    expect(porNombre('')).toBeNull();
  });
});

describe('a dónde vuelven las respuestas', () => {
  it('siempre el buzón de la empresa, y de primero', () => {
    // Algunos programas de correo se quedan sólo con la primera dirección al
    // responder: el orden decide qué buzón no puede quedarse sin la respuesta.
    expect(respuestasDe(EQUIPO.yeimy!)[0]).toBe(BUZON_ARCHIVO);
    expect(respuestasDe(EQUIPO.yeimy!)).toContain('byslogisticsltda@hotmail.com');
  });

  it('no repite la dirección cuando la personal ya es la de la empresa', () => {
    expect(respuestasDe(EQUIPO.paola!)).toEqual([BUZON_ARCHIVO]);
  });
});
