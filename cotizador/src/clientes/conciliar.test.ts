import { beforeEach, describe, expect, it } from 'vitest';

import { clienteVacio } from '../../../compartido/clientes';
import type { Cotizacion } from '../dominio/tipos';
import { clientesLocales } from './almacenLocal';
import { aplicar, compararCon, hayQuePreguntar, planDe } from './conciliar';

/**
 * La regla de oro, probada: **la ficha manda y la cotización toma prestado**.
 *
 * Lo que se comprueba aquí no es que funcione, sino que **no destruya**: que un
 * dato escrito no se pise sin permiso, que ni siquiera reemplazándolo se
 * pierda, y que un documento distinto no se pueda cambiar desde una cotización.
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

function cotizacion(cliente: Partial<Cotizacion['cliente']>, resto: Partial<Cotizacion> = {}): Cotizacion {
  return {
    numero: '',
    fecha: '2026-08-28',
    asesor: 'Paola Vargas',
    iva: 0.19,
    moneda: 'COP',
    tasa: 1,
    catalogoVersion: 'v1',
    cliente: { empresa: '', nit: '', contacto: '', telefono: '', email: '', ciudad: '', ...cliente },
    lineas: [],
    condiciones: {
      validezDias: 15,
      tiempoEntrega: '8 días',
      formaPago: 'Anticipado',
      incluyeFlete: true,
      incluye: [],
      observaciones: '',
    },
    ...resto,
  };
}

describe('cuándo no hay nada que hacer', () => {
  it('una cotización sin nombre de cliente no tiene ficha posible', async () => {
    // No es un error: se cotiza así mientras se arma.
    expect(await planDe(cotizacion({ nit: '900.111.111-1' }), clientesLocales)).toBeNull();
  });
});

describe('encontrar la ficha', () => {
  it('sin nada parecido, el plan es crear una', async () => {
    const plan = await planDe(cotizacion({ empresa: 'Nueva S.A.S.' }), clientesLocales);

    expect(plan?.ficha).toBeNull();
    expect(plan?.parecido).toBeNull();
    expect(hayQuePreguntar(plan!)).toBe(false);

    const codigo = await aplicar(plan!, {}, cotizacion({ empresa: 'Nueva S.A.S.' }), clientesLocales);
    expect((await clientesLocales.abrir(codigo)).empresa).toBe('Nueva S.A.S.');
  });

  it('el documento idéntico enlaza solo, sin preguntar nada', async () => {
    await clientesLocales.crear({ ...clienteVacio(), empresa: 'Uno S.A.S.', nit: '900.111.111-1' });

    const plan = await planDe(
      // Nombre escrito de otra forma: da igual, manda el documento.
      cotizacion({ empresa: 'UNO SAS', nit: '9001111111' }),
      clientesLocales,
    );

    expect(plan?.ficha?.codigo).toBe('CLI-DEMO-0001');
    expect(plan?.parecido).toBeNull();
  });

  it('lo que sólo se parece, se pregunta', async () => {
    await clientesLocales.crear({ ...clienteVacio(), empresa: 'Uno S.A.S.', nit: '900.111.111-1' });

    // Mismo número sin dígito de verificación: parecido, no idéntico.
    const plan = await planDe(cotizacion({ empresa: 'Uno', nit: '900111111' }), clientesLocales);

    expect(plan?.ficha).toBeNull();
    expect(plan?.parecido?.clase).toBe('parecido');
    expect(hayQuePreguntar(plan!)).toBe(true);
  });

  it('un enlace a una ficha que ya no existe no impide emitir', async () => {
    const plan = await planDe(
      cotizacion({ empresa: 'Uno S.A.S.' }, { clienteCodigo: 'CLI-DEMO-9999' }),
      clientesLocales,
    );

    // Se busca de nuevo en vez de reventar: la ficha pudo borrarse después.
    expect(plan?.ficha).toBeNull();
  });
});

describe('lo vacío se llena y lo escrito se pregunta', () => {
  beforeEach(async () => {
    await clientesLocales.crear({
      ...clienteVacio(),
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
      telefono: '601 111 1111',
    });
  });

  it('separa lo que se llena solo de lo que hay que preguntar', async () => {
    const plan = await planDe(
      cotizacion({
        empresa: 'Uno S.A.S.',
        nit: '900.111.111-1',
        telefono: '601 999 9999', // escrito: se pregunta
        ciudad: 'Bogotá', // vacío: se llena solo
        email: 'compras@uno.com', // vacío: se llena solo
      }),
      clientesLocales,
    );

    expect(plan?.rellenar.map((r) => r.nombre).sort()).toEqual(['Ciudad', 'Correo']);
    expect(plan?.preguntas).toHaveLength(1);
    expect(plan?.preguntas[0]).toMatchObject({ nombre: 'Teléfono', admiteAmbos: true });
  });

  it('sin contestar nada, lo escrito se queda como está', async () => {
    const documento = cotizacion({
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
      telefono: '601 999 9999',
      ciudad: 'Bogotá',
    });
    const plan = await planDe(documento, clientesLocales);

    // `{}` es lo que manda la ventana si alguien le da a continuar sin tocar
    // nada: el lado seguro de las dos formas de equivocarse.
    await aplicar(plan!, {}, documento, clientesLocales);

    const ficha = await clientesLocales.abrir('CLI-DEMO-0001');
    expect(ficha.telefono).toBe('601 111 1111');
    expect(ficha.ciudad).toBe('Bogotá');
  });

  it('«guardar los dos» suma sin tocar el principal', async () => {
    const documento = cotizacion({ empresa: 'Uno S.A.S.', nit: '900.111.111-1', telefono: '601 999 9999' });
    const plan = await planDe(documento, clientesLocales);

    await aplicar(plan!, { telefono: 'ambos' }, documento, clientesLocales);

    const ficha = await clientesLocales.abrir('CLI-DEMO-0001');
    expect(ficha.telefono).toBe('601 111 1111');
    expect(ficha.telefonosExtra).toEqual(['601 999 9999']);
  });

  it('«reemplazar» tampoco pierde el anterior: baja a los adicionales', async () => {
    const documento = cotizacion({ empresa: 'Uno S.A.S.', nit: '900.111.111-1', telefono: '601 999 9999' });
    const plan = await planDe(documento, clientesLocales);

    await aplicar(plan!, { telefono: 'reemplazar' }, documento, clientesLocales);

    const ficha = await clientesLocales.abrir('CLI-DEMO-0001');
    expect(ficha.telefono).toBe('601 999 9999');
    // Nada se borra nunca desde una cotización.
    expect(ficha.telefonosExtra).toEqual(['601 111 1111']);
  });

  it('el correo se compara sin mayúsculas: no pregunta por una tontería', async () => {
    await clientesLocales.actualizar('CLI-DEMO-0001', {
      ...clienteVacio(),
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
      correo: 'compras@uno.com',
    });

    const plan = await planDe(
      cotizacion({ empresa: 'Uno S.A.S.', nit: '900.111.111-1', email: 'Compras@Uno.COM' }),
      clientesLocales,
    );

    expect(plan?.preguntas).toHaveLength(0);
  });
});

describe('el documento no se cambia desde una cotización', () => {
  it('avisa del choque y deja el NIT de la ficha intacto', async () => {
    const alta = await clientesLocales.crear({
      ...clienteVacio(),
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
    });

    const documento = cotizacion(
      { empresa: 'Uno S.A.S.', nit: '830.011.234-5' },
      { clienteCodigo: alta.codigo },
    );
    const plan = await planDe(documento, clientesLocales);

    expect(plan?.choqueNit).toEqual({ actual: '900.111.111-1', nuevo: '830.011.234-5' });
    expect(hayQuePreguntar(plan!)).toBe(true);
    // Y no hay ninguna pregunta que ofrezca cambiarlo: no es una corrección.
    expect(plan?.preguntas.some((p) => p.campo === 'nit')).toBe(false);

    await aplicar(plan!, {}, documento, clientesLocales);
    expect((await clientesLocales.abrir(alta.codigo)).nit).toBe('900.111.111-1');
  });
});

describe('comparar contra una ficha concreta', () => {
  it('es lo que se usa al contestar «es el mismo cliente»', async () => {
    const alta = await clientesLocales.crear({
      ...clienteVacio(),
      empresa: 'Uno S.A.S.',
      nit: '900.111.111-1',
    });

    // La ventana pregunta primero si son el mismo; al decir que sí, se compara
    // contra esa ficha y salen las diferencias.
    const { rellenar } = compararCon(
      await clientesLocales.abrir(alta.codigo),
      cotizacion({ empresa: 'Uno S.A.S.', ciudad: 'Cali' }),
    );

    expect(rellenar.map((r) => r.nombre)).toEqual(['Ciudad']);
  });
});
