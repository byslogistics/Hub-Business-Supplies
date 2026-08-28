import { beforeEach, describe, expect, it } from 'vitest';

import { clienteVacio, type DatosCliente } from '../../../compartido/clientes';
import type { FilaImportacion } from '../../../compartido/importacion';
import { clientesLocales } from './almacenLocal';

/**
 * La carga por lote se prueba contra el almacén de la vista previa, que decide
 * con **la misma cabeza** que el servidor (`examinarFila`, en el contrato). Lo
 * que se comprueba aquí es esa cabeza: qué se crea, qué se completa, qué se
 * queda fuera y, sobre todo, qué **no** se pisa.
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

let linea = 1;
function fila(datos: Partial<DatosCliente>, resto: Partial<FilaImportacion> = {}): FilaImportacion {
  linea += 1;
  return { linea, datos, ...resto };
}

beforeEach(() => {
  linea = 1;
});

describe('la revisión no escribe nada', () => {
  it('cuenta lo que pasaría y deja la base como estaba', async () => {
    const revision = await clientesLocales.revisarImportacion([
      fila({ empresa: 'Uno S.A.S.', nit: '900.111.111-1' }),
      fila({ empresa: 'Dos Ltda.', nit: '900.222.222-2' }),
    ]);

    expect(revision.resumen.crear).toBe(2);
    // Lo importante de este paso: mirar no crea.
    expect((await clientesLocales.listar({})).cuantos).toBe(0);
  });
});

describe('qué se hace con cada fila', () => {
  it('crea las que no están', async () => {
    const filas = [fila({ empresa: 'Uno S.A.S.', nit: '900.111.111-1', correo: 'a@uno.com' })];

    expect(await clientesLocales.confirmarImportacion(filas)).toMatchObject({ creados: 1 });
    expect((await clientesLocales.listar({})).clientes[0]?.empresa).toBe('Uno S.A.S.');
  });

  it('completa lo vacío de una ficha que ya existe, sin pisar lo escrito', async () => {
    await clientesLocales.crear({
      ...clienteVacio(),
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
      telefono: '601 111 1111',
    });

    const revision = await clientesLocales.revisarImportacion([
      fila({
        empresa: 'Uno S.A.S.',
        nit: '900.111.111-1',
        telefono: '601 999 9999', // discrepa: no se toca
        ciudad: 'Bogotá', // vacío en la ficha: se llena
      }),
    ]);

    const [revisada] = revision.filas;
    expect(revisada?.accion).toBe('completar');
    expect(revisada?.rellenar).toContain('Ciudad');
    expect(revisada?.conflictos?.[0]).toMatchObject({
      campo: 'Teléfono',
      actual: '601 111 1111',
      nuevo: '601 999 9999',
    });

    await clientesLocales.confirmarImportacion(revision.filas.map((f) => ({ linea: f.linea, datos: { empresa: 'Uno S.A.S.', nit: '900.111.111-1', telefono: '601 999 9999', ciudad: 'Bogotá' } })));

    const ficha = (await clientesLocales.listar({})).clientes[0]!;
    expect(ficha.ciudad).toBe('Bogotá');
    // La promesa de toda la importación: un archivo viejo no borra lo que
    // alguien corrigió a mano.
    expect(ficha.telefono).toBe('601 111 1111');
  });

  it('suma los correos adicionales sin perder los que había', async () => {
    const alta = await clientesLocales.crear({
      ...clienteVacio(),
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
      correosExtra: ['viejo@uno.com'],
    });

    await clientesLocales.confirmarImportacion([
      fila({ empresa: 'Uno S.A.S.', nit: '900.111.111-1', correosExtra: ['nuevo@uno.com'] }),
    ]);

    const ficha = await clientesLocales.abrir(alta.codigo);
    expect(ficha.correosExtra).toEqual(['viejo@uno.com', 'nuevo@uno.com']);
  });

  it('deja fuera la fila sin nombre y la del correo imposible', async () => {
    const revision = await clientesLocales.revisarImportacion([
      fila({ nit: '900.111.111-1' }),
      fila({ empresa: 'Dos', correo: 'esto no es un correo' }),
    ]);

    expect(revision.resumen.error).toBe(2);
    expect(revision.filas[0]?.motivo).toContain('Sin nombre');
    expect(revision.filas[1]?.motivo).toContain('no es un correo');
  });

  it('caza la fila repetida dentro del propio archivo y dice cuál era', async () => {
    const revision = await clientesLocales.revisarImportacion([
      fila({ empresa: 'Uno S.A.S.', nit: '900.111.111-1' }),
      fila({ empresa: 'Uno otra vez', nit: '9001111111' }),
    ]);

    expect(revision.filas[1]?.accion).toBe('error');
    expect(revision.filas[1]?.motivo).toBe('Repetida: es la misma que la fila 2.');
    // Y no se cuela por la puerta de atrás al confirmar.
    expect(await clientesLocales.confirmarImportacion(revision.filas.map((f, i) => ({
      linea: f.linea,
      datos: i === 0 ? { empresa: 'Uno S.A.S.', nit: '900.111.111-1' } : { empresa: 'Uno otra vez', nit: '9001111111' },
    })))).toMatchObject({ creados: 1, errores: 1 });
  });
});

describe('las filas dudosas no se importan solas', () => {
  beforeEach(async () => {
    await clientesLocales.crear({
      ...clienteVacio(),
      empresa: 'Distribuidora La Sabana S.A.S.',
      nit: '830.011.234-5',
    });
  });

  it('un documento parecido se marca para decidir, y se queda fuera', async () => {
    const filas = [fila({ empresa: 'La Sabana', nit: '830011234' })];

    const revision = await clientesLocales.revisarImportacion(filas);
    expect(revision.filas[0]?.accion).toBe('revisar');
    expect(revision.filas[0]?.motivo).toContain('casi igual');

    // Sin decisión no entra: es la razón de ser de toda esta pantalla.
    expect(await clientesLocales.confirmarImportacion(filas)).toMatchObject({
      creados: 0,
      omitidos: 1,
    });
  });

  it('«es otro cliente» la crea aparte', async () => {
    const filas = [fila({ empresa: 'La Sabana', nit: '830011234' }, { decision: 'crear' })];

    expect(await clientesLocales.confirmarImportacion(filas)).toMatchObject({ creados: 1 });
    expect((await clientesLocales.listar({})).cuantos).toBe(2);
  });

  it('«es el mismo» completa la ficha que ya estaba', async () => {
    const filas = [
      fila(
        { empresa: 'La Sabana', nit: '830011234', ciudad: 'Bogotá' },
        { decision: 'completar' },
      ),
    ];

    expect(await clientesLocales.confirmarImportacion(filas)).toMatchObject({ completados: 1 });

    const clientes = (await clientesLocales.listar({})).clientes;
    expect(clientes).toHaveLength(1);
    expect(clientes[0]?.ciudad).toBe('Bogotá');
    // El nombre de la ficha no se pisa con el del archivo.
    expect(clientes[0]?.empresa).toBe('Distribuidora La Sabana S.A.S.');
  });
});

describe('el código del archivo', () => {
  it('manda sobre todo lo demás: es el viaje de ida y vuelta', async () => {
    const alta = await clientesLocales.crear({
      ...clienteVacio(),
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
    });

    // Exportar, corregir el nombre en Excel y volver a subir: la fila apunta a
    // su ficha por el código, aunque el nombre haya cambiado.
    const revision = await clientesLocales.revisarImportacion([
      fila({ empresa: 'Uno S.A.S. (corregido)', nit: '900.111.111-1' }, { codigo: alta.codigo }),
    ]);

    expect(revision.filas[0]?.accion).toBe('completar');
    expect(revision.filas[0]?.codigo).toBe(alta.codigo);
  });

  it('un código que no existe no crea un cliente por una errata', async () => {
    await clientesLocales.crear({ ...clienteVacio(), empresa: 'Uno S.A.S.', nit: '900.111.111-1' });

    const revision = await clientesLocales.revisarImportacion([
      fila({ empresa: 'Uno S.A.S.', nit: '900.111.111-1' }, { codigo: 'CLI-DEMO-9999' }),
    ]);

    // Sigue buscando por documento y encuentra la de verdad: la fila no trae
    // nada nuevo, así que no hay nada que hacer con ella. Lo que importa es que
    // el código equivocado **no** creó un cliente de más.
    expect(revision.filas[0]?.accion).toBe('omitir');
    expect(revision.filas[0]?.codigo).toBe('CLI-DEMO-0001');
    expect(revision.resumen.crear).toBe(0);
  });
});
