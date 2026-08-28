import { describe, expect, it } from 'vitest';

/**
 * Las reglas de identidad viven en `compartido/`, fuera del cotizador, pero se
 * prueban desde aquí: es donde corre vitest, y son las reglas de las que
 * depende que no acaben dos fichas del mismo cliente en la base.
 */

import { documentosParecidos, formatoCodigoCliente } from '../../../compartido/clientes';

describe('el código de cliente', () => {
  it('va a cuatro cifras y sin año', () => {
    // Sin año a propósito: los códigos de cliente no se reinician en enero,
    // al revés que el consecutivo de cotizaciones.
    expect(formatoCodigoCliente(1)).toBe('CLI-0001');
    expect(formatoCodigoCliente(500)).toBe('CLI-0500');
    expect(formatoCodigoCliente(12345)).toBe('CLI-12345');
  });
});

describe('documentos que se parecen', () => {
  it('reconoce el NIT con y sin dígito de verificación', () => {
    expect(documentosParecidos('900.437.215-8', '900437215')).toBe(true);
    expect(documentosParecidos('900437215', '9004372158')).toBe(true);
  });

  it('no le importa cuál venga primero', () => {
    expect(documentosParecidos('9004372158', '900437215')).toBe(
      documentosParecidos('900437215', '9004372158'),
    );
  });

  it('el mismo documento no «se parece»: es el mismo', () => {
    // Esa es otra coincidencia, la fuerte, y se resuelve antes que ésta.
    expect(documentosParecidos('900.437.215-8', '9004372158')).toBe(false);
  });

  it('no se parecen dos números que sólo empiezan igual', () => {
    expect(documentosParecidos('900437215', '90043721599')).toBe(false);
    expect(documentosParecidos('900437215', '900437216')).toBe(false);
  });

  it('con números cortos no opina', () => {
    // Un «12» y un «123» se parecerían, y de eso no se saca nada.
    expect(documentosParecidos('12', '123')).toBe(false);
    expect(documentosParecidos('1234567', '12345678')).toBe(false);
  });

  it('sin documento no hay parecido', () => {
    expect(documentosParecidos('', '900437215')).toBe(false);
    expect(documentosParecidos('sin números', '900437215')).toBe(false);
  });
});
