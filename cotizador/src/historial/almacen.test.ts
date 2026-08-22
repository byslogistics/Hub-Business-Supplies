import { describe, expect, it } from 'vitest';

import { formatoNumero, mismoCliente } from '../../../compartido/historial';
import { urlDelListado } from './almacen';

describe('urlDelListado', () => {
  it('sin filtro pide el listado a secas', () => {
    expect(urlDelListado({})).toBe('/api/cotizaciones');
  });

  it('no manda la página cuando es la primera', () => {
    // Es la de por defecto en el servidor: mandarla sólo ensucia la dirección
    // y hace que dos consultas iguales parezcan distintas.
    expect(urlDelListado({ pagina: 1 })).toBe('/api/cotizaciones');
    expect(urlDelListado({ pagina: 3 })).toBe('/api/cotizaciones?pagina=3');
  });

  it('ignora el texto en blanco', () => {
    // El campo de búsqueda vacío no es un filtro: sin esto, borrar lo escrito
    // dejaría `texto=` y el listado seguiría creyendo que hay filtro puesto.
    expect(urlDelListado({ texto: '   ' })).toBe('/api/cotizaciones');
  });

  it('recorta los espacios sueltos del texto', () => {
    expect(urlDelListado({ texto: '  Coordinadora ' })).toBe(
      '/api/cotizaciones?texto=Coordinadora',
    );
  });

  it('escapa lo que escriba la persona', () => {
    // Un NIT con guion, un «&» en el nombre de la empresa o un acento no
    // pueden romper la consulta.
    expect(urlDelListado({ texto: 'B&S Logistics' })).toBe(
      '/api/cotizaciones?texto=B%26S+Logistics',
    );
  });

  it('junta todos los filtros', () => {
    expect(
      urlDelListado({
        texto: 'ANCLA',
        estado: 'aceptada',
        desde: '2026-01-01',
        hasta: '2026-06-30',
        pagina: 2,
      }),
    ).toBe(
      '/api/cotizaciones?texto=ANCLA&estado=aceptada&desde=2026-01-01&hasta=2026-06-30&pagina=2',
    );
  });
});

describe('formatoNumero', () => {
  it('rellena hasta cuatro cifras', () => {
    expect(formatoNumero('2026', 1)).toBe('COT-2026-0001');
    expect(formatoNumero('2026', 47)).toBe('COT-2026-0047');
    expect(formatoNumero('2026', 1234)).toBe('COT-2026-1234');
  });

  it('no recorta cuando se pasa de cuatro cifras', () => {
    // Con el ritmo actual no llega, pero truncar produciría dos cotizaciones
    // con el mismo número, que es justo lo que el consecutivo central existe
    // para impedir.
    expect(formatoNumero('2026', 12345)).toBe('COT-2026-12345');
  });
});

describe('mismoCliente', () => {
  it('manda el NIT cuando los dos lo traen', () => {
    // Corregir el nombre antes de reemitir no puede tomarse por un choque de
    // números: lo que identifica a la empresa es el NIT.
    expect(
      mismoCliente(
        { empresa: 'Coordinadora Mercantil S.A.', nit: '800.155.005-1' },
        { empresa: 'COORDINADORA MERCANTIL S.A.S.', nit: '800155005-1' },
      ),
    ).toBe(true);
  });

  it('con NIT distinto son distintos por mucho que se llamen igual', () => {
    expect(
      mismoCliente(
        { empresa: 'Transportes del Norte', nit: '900.111.222-3' },
        { empresa: 'Transportes del Norte', nit: '901.999.888-7' },
      ),
    ).toBe(false);
  });

  it('sin NIT compara el nombre sin tildes ni mayúsculas', () => {
    expect(
      mismoCliente(
        { empresa: '  Logística del Caribe ', nit: '' },
        { empresa: 'LOGISTICA DEL CARIBE', nit: '' },
      ),
    ).toBe(true);
    expect(mismoCliente({ empresa: 'Uno', nit: '' }, { empresa: 'Otro', nit: '' })).toBe(false);
  });

  it('cae al nombre cuando sólo uno de los dos trae NIT', () => {
    // Pasa de verdad: la cotización vieja del Excel no siempre traía NIT.
    expect(
      mismoCliente(
        { empresa: 'Coordinadora Mercantil S.A.', nit: '' },
        { empresa: 'Coordinadora Mercantil S.A.', nit: '800.155.005-1' },
      ),
    ).toBe(true);
  });

  it('dos cotizaciones sin cliente son la misma, no un choque', () => {
    // Un borrador sin datos de cliente que se baja en PDF y luego se manda por
    // WhatsApp: son una cotización. Rechazar la segunda salida sería absurdo.
    expect(mismoCliente({ empresa: '', nit: '' }, { empresa: '', nit: '' })).toBe(true);
  });
});
