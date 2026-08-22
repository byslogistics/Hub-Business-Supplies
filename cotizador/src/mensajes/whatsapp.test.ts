import { describe, expect, it } from 'vitest';

import { enlaceWhatsapp, mensajeWhatsapp, numeroColombiano } from './whatsapp';
import type { Cotizacion } from '../dominio/tipos';

const base: Cotizacion = {
  numero: 'COT-2026-0007',
  fecha: '2026-08-13',
  asesor: 'Yeimy Mahecha',
  iva: 0.19,
  catalogoVersion: 'prueba',
  cliente: {
    empresa: 'SERVIHORIZONTAL',
    nit: '',
    contacto: 'Sandra Rojas',
    telefono: '300 790 5606',
    email: '',
    ciudad: 'Bogotá',
  },
  lineas: [
    {
      id: 'l1',
      productoId: 'etiqueta',
      descripcion: 'ETIQUETA VOID NO TRANSFER X 5 CMS',
      cantidad: 500,
      conLogo: true,
      medida: '20 X 5 CMS',
      unitario: 850,
      precioManual: false,
      descuento: 0,
    },
  ],
  condiciones: {
    validezDias: 8,
    tiempoEntrega: '5 a 8 días hábiles',
    formaPago: 'Anticipado',
    incluyeFlete: true,
    incluye: ['Incluye personalización con logo', 'Numeración consecutiva'],
    observaciones: '',
  },
};

describe('mensajeWhatsapp', () => {
  const mensaje = mensajeWhatsapp(base, 0.19);

  it('abre con los datos del emisor', () => {
    expect(mensaje).toContain('BUSINESS & SUPPLIES LOGISTICS S.A.S.');
    expect(mensaje).toContain('NIT: 900.437.215-8');
  });

  it('incluye producto, medida, cantidad y total con IVA', () => {
    expect(mensaje).toContain('ETIQUETA VOID NO TRANSFER X 5 CMS · 20 X 5 CMS');
    expect(mensaje).toContain('📦 Cantidad: 500 unidades');
    // 500 × 850 = 425.000 + 19% = 505.750, el mismo número de la hoja
    // COTIZACION YEIMY del listado de precios.
    expect(mensaje).toContain('505.750');
  });

  it('cierra con las condiciones y la fecha de vencimiento calculada', () => {
    expect(mensaje).toContain('🚚 Entrega estimada: 5 a 8 días hábiles');
    expect(mensaje).toContain('hasta el 21/08/2026');
    expect(mensaje).toContain('💳 Forma de pago: Anticipado');
  });

  it('no repite el total cuando hay una sola línea', () => {
    expect(mensaje).not.toContain('TOTAL CON IVA');
  });

  it('agrega el total cuando hay varias líneas', () => {
    const dos = { ...base, lineas: [...base.lineas, { ...base.lineas[0]!, id: 'l2' }] };
    expect(mensajeWhatsapp(dos, 0.19)).toContain('💰 TOTAL CON IVA: $ 1.011.500');
  });

  it('omite los campos del cliente que estén vacíos', () => {
    expect(mensaje).not.toContain('📧 Email:');
    expect(mensaje).toContain('📍 Ciudad: Bogotá');
  });

  it('declara la moneda: el «$» a secas no distingue peso de dólar', () => {
    expect(mensaje).toContain('pesos colombianos (COP)');
  });
});

describe('numeroColombiano', () => {
  it('acepta celulares con o sin espacios e indicativo', () => {
    expect(numeroColombiano('300 790 5606')).toBe('573007905606');
    expect(numeroColombiano('3007905606')).toBe('573007905606');
    expect(numeroColombiano('+57 300 790 5606')).toBe('573007905606');
  });

  it('descarta fijos y basura en lugar de armar un número inválido', () => {
    expect(numeroColombiano('6014699575')).toBeNull();
    expect(numeroColombiano('469 9575')).toBeNull();
    expect(numeroColombiano('')).toBeNull();
  });
});

describe('enlaceWhatsapp', () => {
  it('escribe al celular del cliente cuando lo hay', () => {
    expect(enlaceWhatsapp(base, 0.19)).toMatch(/^https:\/\/wa\.me\/573007905606\?text=/);
  });

  it('cae al número de la empresa si el cliente no dejó celular', () => {
    const sinCelular = { ...base, cliente: { ...base.cliente, telefono: '(601) 469 9575' } };
    expect(enlaceWhatsapp(sinCelular, 0.19)).toMatch(/^https:\/\/wa\.me\/573209514930\?text=/);
  });
});
