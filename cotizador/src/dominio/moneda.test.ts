import { describe, expect, it } from 'vitest';

import { aMoneda, cambioDe, convertir, EN_PESOS, redondear } from './moneda';

const A_4000 = { moneda: 'USD', tasa: 4000 } as const;

describe('redondear', () => {
  it('en pesos no deja centavos, en dólares sí', () => {
    // El peso colombiano no se factura con centavos; el dólar no se puede
    // facturar sin ellos: redondear 0,87 USD a entero es un 15 % de
    // sobreprecio en una sola línea.
    expect(redondear(1250.6, 'COP')).toBe(1251);
    expect(redondear(0.8675, 'USD')).toBe(0.87);
  });

  it('un valor que no es número no envenena el total', () => {
    // Un campo vacío o un documento corrupto darían `NaN`, y `NaN` se propaga
    // hasta imprimirse en el PDF donde iba el total.
    expect(redondear(Number.NaN, 'USD')).toBe(0);
  });
});

describe('cambioDe', () => {
  it('las cotizaciones sin moneda son en pesos', () => {
    // Las emitidas antes de que esto existiera. Se siguen abriendo desde el
    // historial para regenerar su PDF.
    expect(cambioDe({})).toEqual(EN_PESOS);
    expect(cambioDe({ moneda: 'COP', tasa: 1 })).toEqual(EN_PESOS);
  });

  it('una cotización en dólares sin tasa utilizable no divide por cero', () => {
    // Cae a pesos: las cifras del documento son las que son y lo único que se
    // pierde es el equivalente. Dividir por cero llenaría el PDF de «NaN».
    expect(cambioDe({ moneda: 'USD', tasa: 0 })).toEqual(EN_PESOS);
    expect(cambioDe({ moneda: 'USD' })).toEqual(EN_PESOS);
  });

  it('con tasa buena devuelve dólares', () => {
    expect(cambioDe({ moneda: 'USD', tasa: 4100 })).toEqual({ moneda: 'USD', tasa: 4100 });
  });
});

describe('aMoneda', () => {
  it('convierte el precio del listado a la moneda del documento', () => {
    expect(aMoneda(3480, A_4000)).toBe(0.87);
    expect(aMoneda(3480, EN_PESOS)).toBe(3480);
  });
});

describe('convertir', () => {
  it('un importe pactado no cambia de cifra al cambiar de moneda, cambia de valor', () => {
    // 3.500 pesos pactados son 0,88 dólares, no 3.500 dólares. Es lo que hace
    // que pasar una cotización a medio armar de una moneda a otra no destruya
    // lo negociado.
    expect(convertir(3500, EN_PESOS, A_4000)).toBe(0.88);
    expect(convertir(0.88, A_4000, EN_PESOS)).toBe(3520);
  });

  it('cambiar sólo la tasa recoloca el precio', () => {
    expect(convertir(1, A_4000, { moneda: 'USD', tasa: 5000 })).toBe(0.8);
  });

  it('ida y vuelta no se aleja más de lo que cuesta el redondeo', () => {
    const ida = convertir(3480, EN_PESOS, A_4000);
    // Medio centavo de dólar son veinte pesos: eso es lo que cuesta pasar por
    // una moneda con menos precisión, y es la razón de que la tolerancia de la
    // revisión de precios sea la de la moneda del documento y no la del peso.
    expect(Math.abs(convertir(ida, A_4000, EN_PESOS) - 3480)).toBeLessThanOrEqual(20);
  });
});
