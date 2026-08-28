import { describe, expect, it } from 'vitest';

import { clienteVacio, type Cliente } from '../../../compartido/clientes';
import { csvDeClientes, todosLosQueCumplen } from './exportar';
import type { AlmacenClientes } from './contrato';

function cliente(cambios: Partial<Cliente> = {}): Cliente {
  return {
    ...clienteVacio(),
    codigo: 'CLI-0001',
    empresa: 'Coordinadora Mercantil S.A.',
    creadoEn: '2026-08-01T10:00:00.000Z',
    actualizadoEn: '2026-08-01T10:00:00.000Z',
    eliminadoEn: null,
    eliminadoPor: null,
    ...cambios,
  };
}

describe('el archivo que se baja', () => {
  it('empieza por la fila de títulos', () => {
    const csv = csvDeClientes([]);

    expect(csv.split('\r\n')[0]).toContain('Código;Empresa;Tipo;NIT o cédula');
  });

  it('separa con punto y coma, que es lo que espera el Excel de acá', () => {
    const csv = csvDeClientes([cliente({ nit: '800.155.005-1', ciudad: 'Bogotá' })]);

    expect(csv).toContain('CLI-0001;Coordinadora Mercantil S.A.;Empresa;800.155.005-1');
  });

  it('entrecomilla lo que llevaría el archivo por delante', () => {
    // Una nota con punto y coma partiría la fila en dos columnas; una con
    // comillas rompería el entrecomillado si no se duplicaran.
    const csv = csvDeClientes([cliente({ notas: 'Paga a 30 días; pide "factura aparte"' })]);

    expect(csv).toContain('"Paga a 30 días; pide ""factura aparte"""');
  });

  it('junta los correos adicionales en una sola celda legible', () => {
    const csv = csvDeClientes([cliente({ correosExtra: ['uno@x.com', 'dos@x.com'] })]);

    expect(csv).toContain('uno@x.com | dos@x.com');
  });
});

describe('qué se exporta', () => {
  /** Un almacén de mentira que pagina de dos en dos. */
  function almacenDe(cuantos: number): AlmacenClientes {
    const todos = Array.from({ length: cuantos }, (_, i) =>
      cliente({ codigo: `CLI-${String(i + 1).padStart(4, '0')}` }),
    );

    return {
      listar: async (filtro) => {
        const pagina = filtro.pagina ?? 1;
        return { clientes: todos.slice((pagina - 1) * 2, pagina * 2), cuantos, pagina, porPagina: 2 };
      },
    } as AlmacenClientes;
  }

  it('recorre todas las páginas, no sólo la que se está viendo', async () => {
    // Quien pulsa «Exportar» con un filtro puesto quiere lo que cumple el
    // filtro, no los veinticinco de la primera página.
    const reunidos = await todosLosQueCumplen(almacenDe(5), {});

    expect(reunidos).toHaveLength(5);
    expect(reunidos.at(-1)?.codigo).toBe('CLI-0005');
  });

  it('con la lista vacía no se queda dando vueltas', async () => {
    expect(await todosLosQueCumplen(almacenDe(0), {})).toEqual([]);
  });
});
