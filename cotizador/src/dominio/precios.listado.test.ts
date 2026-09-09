/**
 * Los casos que reportaron las clientas, contra el catálogo real.
 *
 * `precios.test.ts` prueba las reglas con productos de laboratorio; esto prueba
 * que el listado de precios que está publicado hoy los cumple. Es la diferencia
 * entre «la fórmula está bien» y «cotizar mil precintos da lo que Yeimy dice
 * que tiene que dar».
 *
 * Si el catálogo se regenera y alguno de estos precios cambia, esta prueba se
 * cae a propósito: un cambio de precio en estas referencias tiene que ser una
 * decisión, no un efecto secundario.
 */

import { describe, expect, it } from 'vitest';

import { catalogo, productoPorId } from './catalogo';
import { sugerirPrecio, totalesDeLinea } from './precios';
import type { Linea, Producto } from './tipos';

function producto(id: string): Producto {
  const encontrado = productoPorId(id);
  if (!encontrado) throw new Error(`falta la referencia ${id} en el catálogo`);
  return encontrado;
}

const DENTADO_35 = 'precinto-dentado-doble-cierre-35-cms';
const DOBLE_DENTADO_38 = 'precinto-doble-dentado-38-cms';

describe('PRECINTO DENTADO DOBLE CIERRE 35 CMS', () => {
  // Los seis casos de la especificación que mandaron las clientas: sin logo
  // hasta 500, con logo de 1.000 en adelante.
  const esperados = [
    { cantidad: 100, conLogo: false, unitario: 900 },
    { cantidad: 500, conLogo: false, unitario: 550 },
    { cantidad: 1000, conLogo: true, unitario: 400 },
    { cantidad: 2000, conLogo: true, unitario: 350 },
    { cantidad: 5000, conLogo: true, unitario: 320 },
    { cantidad: 10000, conLogo: true, unitario: 300 },
  ];

  for (const { cantidad, conLogo, unitario } of esperados) {
    it(`${cantidad} unidades ${conLogo ? 'con' : 'sin'} logo valen ${unitario}`, () => {
      const sugerido = sugerirPrecio(producto(DENTADO_35), cantidad, { conLogo });
      expect(sugerido.motivo).toBe('escalon');
      expect(sugerido.unitario).toBe(unitario);
    });
  }

  it('mil unidades sin logo no se cotizan al precio de quinientas', () => {
    const sugerido = sugerirPrecio(producto(DENTADO_35), 1000, { conLogo: false });

    expect(sugerido.unitario).not.toBe(550);
    expect(sugerido.motivo).toBe('otra-modalidad');
    expect(sugerido.alternativa?.escalon.unitario).toBe(400);
  });

  it('los totales de la especificación cuadran con el IVA del 19 %', () => {
    // 1.000 × 400 = 400.000 · IVA 76.000 · total 476.000.
    const linea: Linea = {
      id: 'l1',
      productoId: DENTADO_35,
      descripcion: 'PRECINTO DENTADO DOBLE CIERRE 35 CMS',
      cantidad: 1000,
      conLogo: true,
      unitario: sugerirPrecio(producto(DENTADO_35), 1000, { conLogo: true }).unitario,
      precioManual: false,
      descuento: 0,
    };

    expect(totalesDeLinea(linea, 0.19)).toMatchObject({
      subtotal: 400_000,
      iva: 76_000,
      total: 476_000,
    });
  });
});

describe('PRECINTO DOBLE DENTADO 38 CMS', () => {
  /*
   * La referencia que demuestra por qué la cantidad sola no alcanza: 500
   * unidades tienen dos precios publicados, y el que corresponde depende de si
   * el precinto lleva logo. Sin la modalidad no hay forma de acertar.
   */
  it('500 sin logo valen 550', () => {
    expect(sugerirPrecio(producto(DOBLE_DENTADO_38), 500, { conLogo: false })).toMatchObject({
      motivo: 'escalon',
      unitario: 550,
    });
  });

  it('500 con logo valen 700', () => {
    expect(sugerirPrecio(producto(DOBLE_DENTADO_38), 500, { conLogo: true })).toMatchObject({
      motivo: 'escalon',
      unitario: 700,
    });
  });

  it('1.000 sólo existen con logo, a 420', () => {
    expect(sugerirPrecio(producto(DOBLE_DENTADO_38), 1000, { conLogo: true })).toMatchObject({
      motivo: 'escalon',
      unitario: 420,
    });
    // Sin logo el listado se acaba en 500: no se cotiza a 550 por su cuenta.
    expect(sugerirPrecio(producto(DOBLE_DENTADO_38), 1000, { conLogo: false })).toMatchObject({
      motivo: 'otra-modalidad',
      unitario: 0,
    });
  });
});

describe('las referencias con dos escaleras no se cruzan solas', () => {
  /*
   * Barrido del catálogo entero. Para toda referencia que publique precios en
   * las dos modalidades, ninguna cantidad puede devolver un precio de la
   * modalidad contraria. Es la garantía que pedían las clientas, comprobada
   * sobre todas las referencias con dos tandas y no sólo sobre las dos que se
   * revisaron a mano.
   */
  const conDosEscaleras = (catalogo.productos as readonly Producto[]).filter(
    (p) => p.escalones.some((e) => e.logo === true) && p.escalones.some((e) => e.logo === false),
  );

  it('hay referencias con dos escaleras que vigilar', () => {
    expect(conDosEscaleras.length).toBeGreaterThan(0);
  });

  it('ninguna cantidad devuelve el precio de la otra modalidad', () => {
    const cantidades = [1, 100, 300, 500, 700, 1000, 2000, 3000, 5000, 10000, 20000];
    const cruces: string[] = [];

    for (const p of conDosEscaleras) {
      for (const conLogo of [false, true]) {
        for (const cantidad of cantidades) {
          const { escalon } = sugerirPrecio(p, cantidad, { conLogo });
          if (escalon && escalon.logo !== undefined && escalon.logo !== conLogo) {
            cruces.push(`${p.id} @${cantidad} ${conLogo ? 'con' : 'sin'} logo`);
          }
        }
      }
    }

    expect(cruces).toEqual([]);
  });
});
