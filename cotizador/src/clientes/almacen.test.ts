import { describe, expect, it } from 'vitest';

import { urlDeCoincidencia, urlDelListado } from './almacen';

/**
 * Las dos direcciones que arma este módulo son lo único que decide algo en él,
 * y equivocarse aquí no se ve: la pantalla enseñaría una lista completa
 * creyendo que está filtrada, o preguntaría «¿a éste ya lo tengo?» sin mandar
 * con qué buscarlo.
 */
describe('la dirección del listado', () => {
  it('sin filtro no lleva parámetros de más', () => {
    expect(urlDelListado({}, '/api')).toBe('/api/clientes');
    // Página 1 es la de por sí: escribirla sólo ensucia la dirección.
    expect(urlDelListado({ pagina: 1 }, '/api')).toBe('/api/clientes');
  });

  it('lleva cada filtro que esté puesto', () => {
    const url = urlDelListado(
      { texto: ' avila ', estado: 'activo', asesor: 'Paola Vargas', pagina: 3, papelera: true },
      '/api',
    );

    expect(url).toContain('texto=avila');
    expect(url).toContain('estado=activo');
    expect(url).toContain('asesor=Paola+Vargas');
    expect(url).toContain('pagina=3');
    expect(url).toContain('papelera=1');
  });

  it('no manda un texto que era sólo espacios', () => {
    expect(urlDelListado({ texto: '   ' }, '/api')).toBe('/api/clientes');
  });
});

describe('la dirección de la coincidencia', () => {
  it('manda sólo lo que se sabe del cliente', () => {
    expect(urlDeCoincidencia({ nit: '800.155.005-1' }, '/api')).toBe(
      '/api/clientes/coincidencia?nit=800.155.005-1',
    );
  });

  it('escapa lo que escribió la persona', () => {
    const url = urlDeCoincidencia({ empresa: 'Ávila & Cía.' }, '/api');

    expect(url).toContain('empresa=%C3%81vila+%26+C%C3%ADa.');
  });
});
