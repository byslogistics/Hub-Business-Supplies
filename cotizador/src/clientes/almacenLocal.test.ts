import { beforeEach, describe, expect, it } from 'vitest';

import { clienteVacio, type DatosCliente } from '../../../compartido/clientes';
import { FalloApi } from '../api/fallo';
import { clientesLocales } from './almacenLocal';

/**
 * Las pruebas corren en Node, donde no hay `localStorage`. Este remedo basta:
 * lo que se prueba es la lógica del almacén —la escalera de coincidencia, el
 * rechazo por NIT repetido, la papelera—, no el almacenamiento del navegador.
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

function cliente(cambios: Partial<DatosCliente> = {}): DatosCliente {
  return { ...clienteVacio(), empresa: 'Coordinadora Mercantil S.A.', ...cambios };
}

describe('dar de alta', () => {
  it('numera con códigos marcados, para que la vista previa no se confunda con la base real', async () => {
    const primero = await clientesLocales.crear(cliente());
    const segundo = await clientesLocales.crear(cliente({ empresa: 'Otra S.A.S.' }));

    expect(primero.codigo).toBe('CLI-DEMO-0001');
    expect(segundo.codigo).toBe('CLI-DEMO-0002');
  });

  it('no guarda una ficha sin nombre', async () => {
    await expect(clientesLocales.crear(cliente({ empresa: '   ' }))).rejects.toThrow(FalloApi);
  });

  it('rechaza un NIT que ya es de otra ficha, y dice de quién', async () => {
    await clientesLocales.crear(cliente({ nit: '800.155.005-1' }));

    // Mismo NIT escrito de otra forma: para la base es el mismo cliente.
    const choque = clientesLocales.crear(cliente({ empresa: 'Coordinadora', nit: '8001550051' }));

    await expect(choque).rejects.toMatchObject({
      codigo: 'cliente-duplicado',
      detalle: 'CLI-DEMO-0001',
    });
  });

  it('deja repetir el nombre mientras los NIT sean distintos', async () => {
    await clientesLocales.crear(cliente({ nit: '800.155.005-1' }));
    const segundo = await clientesLocales.crear(cliente({ nit: '900.437.215-8' }));

    expect(segundo.codigo).toBe('CLI-DEMO-0002');
  });
});

describe('reconocer a un cliente que llega', () => {
  it('el NIT manda, aunque el nombre esté escrito distinto', async () => {
    await clientesLocales.crear(cliente({ nit: '800.155.005-1', correo: 'ana@coordinadora.com' }));

    const hallado = await clientesLocales.coincidencia({
      nit: '8001550051',
      empresa: 'COORDINADORA MERCANTIL',
    });

    expect(hallado?.clase).toBe('nit');
    // Sólo el NIT permite unir sin preguntarle a la persona.
    expect(hallado?.fuerte).toBe(true);
  });

  it('sin NIT reconoce por el correo, pero pide confirmación', async () => {
    await clientesLocales.crear(cliente({ correo: 'Ana@Coordinadora.com' }));

    const hallado = await clientesLocales.coincidencia({ correo: 'ana@coordinadora.com' });

    expect(hallado?.clase).toBe('correo');
    expect(hallado?.fuerte).toBe(false);
  });

  it('también reconoce por los correos adicionales de la ficha', async () => {
    await clientesLocales.crear(
      cliente({ correo: 'compras@coordinadora.com', correosExtra: ['pagos@coordinadora.com'] }),
    );

    const hallado = await clientesLocales.coincidencia({ correo: 'pagos@coordinadora.com' });

    expect(hallado?.cliente.codigo).toBe('CLI-DEMO-0001');
  });

  it('en último caso reconoce por el nombre, sin tildes ni mayúsculas', async () => {
    await clientesLocales.crear(cliente({ empresa: 'Almacén Ávila' }));

    const hallado = await clientesLocales.coincidencia({ empresa: 'almacen avila' });

    expect(hallado?.clase).toBe('empresa');
    expect(hallado?.fuerte).toBe(false);
  });

  it('sin nada con qué buscar no inventa una coincidencia', async () => {
    await clientesLocales.crear(cliente());

    expect(await clientesLocales.coincidencia({})).toBeNull();
    expect(await clientesLocales.coincidencia({ nit: '   ' })).toBeNull();
  });
});

describe('buscar y filtrar', () => {
  beforeEach(async () => {
    await clientesLocales.crear(
      cliente({ empresa: 'Almacén Ávila', ciudad: 'Bogotá', estado: 'activo', asesor: 'Paola Vargas' }),
    );
    await clientesLocales.crear(
      cliente({ empresa: 'Zapata Ltda.', nit: '900.437.215-8', ciudad: 'Cali', asesor: 'Yeimy Mahecha' }),
    );
  });

  it('ordena por nombre sin que las tildes manden a Ávila al final', async () => {
    const { clientes } = await clientesLocales.listar({});

    expect(clientes.map((c) => c.empresa)).toEqual(['Almacén Ávila', 'Zapata Ltda.']);
  });

  it('encuentra escribiendo sin tildes', async () => {
    const { clientes } = await clientesLocales.listar({ texto: 'avila' });

    expect(clientes).toHaveLength(1);
    expect(clientes[0]?.empresa).toBe('Almacén Ávila');
  });

  it('encuentra el NIT escrito sin puntos', async () => {
    const { clientes } = await clientesLocales.listar({ texto: '9004372158' });

    expect(clientes[0]?.empresa).toBe('Zapata Ltda.');
  });

  it('filtra por estado y por asesora', async () => {
    expect((await clientesLocales.listar({ estado: 'activo' })).cuantos).toBe(1);
    expect((await clientesLocales.listar({ asesor: 'Yeimy Mahecha' })).cuantos).toBe(1);
    expect((await clientesLocales.listar({ asesor: 'Nadie' })).cuantos).toBe(0);
  });
});

describe('la papelera', () => {
  it('saca de la lista sin borrar, y devuelve intacto', async () => {
    const alta = await clientesLocales.crear(cliente({ nit: '800.155.005-1' }));

    expect(await clientesLocales.eliminar({ codigos: [alta.codigo] })).toEqual({ cuantos: 1 });
    expect((await clientesLocales.listar({})).cuantos).toBe(0);
    expect((await clientesLocales.listar({ papelera: true })).cuantos).toBe(1);

    await clientesLocales.restaurar({ codigos: [alta.codigo] });

    const vuelto = await clientesLocales.abrir(alta.codigo);
    expect(vuelto.nit).toBe('800.155.005-1');
    expect(vuelto.eliminadoEn).toBeNull();
  });

  it('un NIT retirado sigue ocupado: se ofrece restaurar, no duplicar', async () => {
    const alta = await clientesLocales.crear(cliente({ nit: '800.155.005-1' }));
    await clientesLocales.eliminar({ codigos: [alta.codigo] });

    await expect(clientesLocales.crear(cliente({ nit: '800.155.005-1' }))).rejects.toMatchObject({
      codigo: 'cliente-duplicado',
    });
  });

  it('eliminar no alcanza lo que ya está retirado, ni purgar lo que está a la vista', async () => {
    const alta = await clientesLocales.crear(cliente());

    // Purgar sólo puede tocar la papelera, diga lo que diga quien llame: es lo
    // que convierte «me llevé el que no era» en algo que se deshace.
    expect(await clientesLocales.purgar({ codigos: [alta.codigo] })).toEqual({ cuantos: 0 });
    expect((await clientesLocales.listar({})).cuantos).toBe(1);

    await clientesLocales.eliminar({ codigos: [alta.codigo] });
    expect(await clientesLocales.eliminar({ codigos: [alta.codigo] })).toEqual({ cuantos: 0 });
    expect(await clientesLocales.purgar({ codigos: [alta.codigo] })).toEqual({ cuantos: 1 });
  });

  it('«todos los que cumplen el filtro» alcanza sólo a los que cumplen', async () => {
    await clientesLocales.crear(cliente({ empresa: 'Uno', estado: 'activo' }));
    await clientesLocales.crear(cliente({ empresa: 'Dos', estado: 'inactivo' }));
    await clientesLocales.crear(cliente({ empresa: 'Tres', estado: 'inactivo' }));

    const { cuantos } = await clientesLocales.eliminar({ todos: true, filtro: { estado: 'inactivo' } });

    expect(cuantos).toBe(2);
    expect((await clientesLocales.listar({})).clientes.map((c) => c.empresa)).toEqual(['Uno']);
  });
});

describe('editar', () => {
  it('no deja que una ficha se lleve el NIT de otra', async () => {
    await clientesLocales.crear(cliente({ empresa: 'Uno', nit: '800.155.005-1' }));
    const dos = await clientesLocales.crear(cliente({ empresa: 'Dos', nit: '900.437.215-8' }));

    await expect(
      clientesLocales.actualizar(dos.codigo, cliente({ empresa: 'Dos', nit: '800.155.005-1' })),
    ).rejects.toMatchObject({ codigo: 'cliente-duplicado' });
  });

  it('deja guardar la misma ficha con su propio NIT', async () => {
    const uno = await clientesLocales.crear(cliente({ empresa: 'Uno', nit: '800.155.005-1' }));

    const editado = await clientesLocales.actualizar(
      uno.codigo,
      cliente({ empresa: 'Uno S.A.S.', nit: '800.155.005-1' }),
    );

    expect(editado.empresa).toBe('Uno S.A.S.');
    expect(editado.codigo).toBe(uno.codigo);
  });
});

describe('el NIT con y sin dígito de verificación', () => {
  it('avisa del parecido, pero no lo da por hecho', async () => {
    // `900.437.215-8` y `900437215` son casi con seguridad la misma empresa
    // escrita de las dos formas en que se escribe un NIT en Colombia.
    await clientesLocales.crear(cliente({ empresa: 'Ávila', nit: '900.437.215-8' }));

    const hallado = await clientesLocales.coincidencia({ nit: '900437215' });

    expect(hallado?.clase).toBe('parecido');
    // Floja a propósito: una cédula de diez dígitos puede parecerse a un NIT de
    // nueve más su verificación sin tener nada que ver.
    expect(hallado?.fuerte).toBe(false);
  });

  it('el documento idéntico gana al parecido', async () => {
    await clientesLocales.crear(cliente({ empresa: 'Ávila', nit: '900437215' }));
    await clientesLocales.crear(cliente({ empresa: 'Otra', nit: '9004372158' }));

    const hallado = await clientesLocales.coincidencia({ nit: '9004372158' });

    expect(hallado?.clase).toBe('nit');
    expect(hallado?.cliente.empresa).toBe('Otra');
  });

  it('deja crear las dos fichas: sólo avisa, no bloquea', async () => {
    await clientesLocales.crear(cliente({ empresa: 'Ávila', nit: '900.437.215-8' }));

    // El almacén no impide el alta; quien decide es la persona en pantalla,
    // avisada por la coincidencia. Bloquear aquí impediría dar de alta a una
    // persona natural cuya cédula se parezca a un NIT ajeno.
    const otra = await clientesLocales.crear(cliente({ empresa: 'Otra', nit: '900437215' }));

    expect(otra.codigo).toBe('CLI-DEMO-0002');
  });
});
