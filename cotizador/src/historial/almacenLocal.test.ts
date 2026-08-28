import { beforeEach, describe, expect, it } from 'vitest';

import type { Cotizacion } from '../dominio/tipos';
import { almacenLocal } from './almacenLocal';
import { FalloApi } from './contrato';

/**
 * Las pruebas corren en Node, donde no hay `localStorage`. Este remedo basta:
 * lo que se prueba es la lógica del almacén —numeración, filtros, qué
 * sobrevive a una reemisión—, no el almacenamiento del navegador.
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

function cotizacion(cambios: Partial<Cotizacion> = {}): Cotizacion {
  return {
    numero: '',
    fecha: '2026-08-14',
    asesor: 'Yeimy Mahecha',
    iva: 0.19,
    moneda: 'COP',
    tasa: 1,
    catalogoVersion: 'v1',
    cliente: {
      empresa: 'Coordinadora Mercantil S.A.',
      nit: '800.155.005-1',
      contacto: 'Ana Ruiz',
      telefono: '',
      email: '',
      ciudad: 'Bogotá',
    },
    lineas: [
      {
        id: 'l1',
        productoId: 'precinto-ancla-1',
        descripcion: 'PRECINTO ANCLA 1',
        cantidad: 100,
        conLogo: false,
        unitario: 1000,
        precioManual: false,
        descuento: 0,
      },
    ],
    condiciones: {
      validezDias: 15,
      tiempoEntrega: '8 días hábiles',
      formaPago: 'Anticipado',
      incluyeFlete: true,
      incluye: [],
      observaciones: '',
    },
    ...cambios,
  };
}

describe('almacenLocal', () => {
  it('numera con DEMO dentro, para que no se confunda con una de verdad', async () => {
    const primera = await almacenLocal.registrar(cotizacion());
    const segunda = await almacenLocal.registrar(cotizacion());

    expect(primera.numero).toBe('COT-DEMO-0001');
    expect(segunda.numero).toBe('COT-DEMO-0002');
  });

  it('calcula el total con IVA, no lo copia de quien lo manda', async () => {
    const { numero } = await almacenLocal.registrar(cotizacion());
    const guardada = await almacenLocal.abrir(numero);

    expect(guardada.total).toBe(119_000); // 100 × 1.000 + 19 %
    expect(guardada.unidades).toBe(100);
  });

  it('no emite una cotización sin líneas', async () => {
    await expect(almacenLocal.registrar(cotizacion({ lineas: [] }))).rejects.toBeInstanceOf(
      FalloApi,
    );
  });

  it('reemitir actualiza el documento sin perder el seguimiento comercial', async () => {
    // El caso real: se emite, se marca como aceptada, y después se corrige una
    // cantidad y se vuelve a mandar. Si la reemisión borrara el estado, el
    // historial dejaría de servir justo para lo que se hizo.
    const { numero } = await almacenLocal.registrar(cotizacion());
    await almacenLocal.marcar(numero, 'aceptada', 'Orden de compra 4512');

    const corregida = cotizacion({ numero });
    corregida.lineas[0]!.cantidad = 200;
    await almacenLocal.registrar(corregida);

    const guardada = await almacenLocal.abrir(numero);
    expect(guardada.estado).toBe('aceptada');
    expect(guardada.estadoNota).toBe('Orden de compra 4512');
    expect(guardada.total).toBe(238_000);
    expect(guardada.documento.lineas[0]!.cantidad).toBe(200);
  });

  it('reemitir no cambia cuándo salió por primera vez', async () => {
    const { numero, emitidaEn } = await almacenLocal.registrar(cotizacion());
    await almacenLocal.registrar(cotizacion({ numero }));

    expect((await almacenLocal.abrir(numero)).emitidaEn).toBe(emitidaEn);
  });

  it('busca por número, empresa, NIT y contacto, sin distinguir mayúsculas', async () => {
    await almacenLocal.registrar(cotizacion());
    await almacenLocal.registrar(
      cotizacion({
        cliente: {
          empresa: 'Transportes del Norte',
          nit: '900.111.222-3',
          contacto: 'Luis Gómez',
          telefono: '',
          email: '',
          ciudad: 'Medellín',
        },
      }),
    );

    expect((await almacenLocal.listar({ texto: 'coordinadora' })).cuantas).toBe(1);
    expect((await almacenLocal.listar({ texto: '900.111' })).cuantas).toBe(1);
    expect((await almacenLocal.listar({ texto: 'GÓMEZ' })).cuantas).toBe(1);
    expect((await almacenLocal.listar({ texto: 'COT-DEMO' })).cuantas).toBe(2);
    expect((await almacenLocal.listar({ texto: 'nadie' })).cuantas).toBe(0);
  });

  it('filtra por estado y suma sólo lo que cumple el filtro', async () => {
    const primera = await almacenLocal.registrar(cotizacion());
    await almacenLocal.registrar(cotizacion());
    await almacenLocal.marcar(primera.numero, 'aceptada', '');

    const aceptadas = await almacenLocal.listar({ estado: 'aceptada' });
    expect(aceptadas.cuantas).toBe(1);
    expect(aceptadas.sumaTotales).toBe(119_000);

    const todas = await almacenLocal.listar({});
    expect(todas.cuantas).toBe(2);
    expect(todas.sumaTotales).toBe(238_000);
  });

  it('deja fuera lo emitido antes de la fecha desde la que se busca', async () => {
    await almacenLocal.registrar(cotizacion());

    expect((await almacenLocal.listar({ desde: '2020-01-01' })).cuantas).toBe(1);
    expect((await almacenLocal.listar({ desde: '2100-01-01' })).cuantas).toBe(0);
    expect((await almacenLocal.listar({ hasta: '2020-01-01' })).cuantas).toBe(0);
  });

  it('lista lo último emitido primero', async () => {
    const primera = await almacenLocal.registrar(cotizacion());
    // Sin esperar, dos emisiones seguidas comparten milisegundo y el orden
    // queda a suerte del navegador.
    await new Promise((seguir) => setTimeout(seguir, 5));
    const segunda = await almacenLocal.registrar(cotizacion());

    const { cotizaciones } = await almacenLocal.listar({});
    expect(cotizaciones.map((c) => c.numero)).toEqual([segunda.numero, primera.numero]);
  });

  it('el listado no arrastra el documento entero', async () => {
    await almacenLocal.registrar(cotizacion());
    const [fila] = (await almacenLocal.listar({})).cotizaciones;

    // Cien cotizaciones con su JSON completo son varios megas para pintar
    // cinco columnas.
    expect(fila).not.toHaveProperty('documento');
  });

  it('un número escrito a mano no pisa la cotización de otro cliente', async () => {
    // El caso: alguien pasa al historial una cotización vieja del Excel y
    // teclea un número que ya está gastado. Antes el documento del primer
    // cliente quedaba reemplazado por el del segundo, sin aviso.
    const { numero } = await almacenLocal.registrar(cotizacion());

    const deOtro = cotizacion({
      numero,
      cliente: {
        empresa: 'Transportes del Norte',
        nit: '900.111.222-3',
        contacto: 'Luis Gómez',
        telefono: '',
        email: '',
        ciudad: 'Medellín',
      },
    });

    await expect(almacenLocal.registrar(deOtro)).rejects.toMatchObject({
      codigo: 'numero-ocupado',
    });

    // Y la primera sigue entera.
    expect((await almacenLocal.abrir(numero)).cliente).toBe('Coordinadora Mercantil S.A.');
  });

  it('reemitir la propia sigue pasando aunque le corrijan el nombre al cliente', async () => {
    // Mismo NIT, nombre retocado. Es la misma cotización, no un choque: si
    // esto se rechazara, corregir una errata costaría no poder reemitir.
    const { numero } = await almacenLocal.registrar(cotizacion());

    const corregida = cotizacion({
      numero,
      cliente: {
        empresa: 'COORDINADORA MERCANTIL S.A.S.',
        nit: '800.155.005-1',
        contacto: 'Ana Ruiz',
        telefono: '',
        email: '',
        ciudad: 'Bogotá',
      },
    });

    await expect(almacenLocal.registrar(corregida)).resolves.toMatchObject({ numero });
    expect((await almacenLocal.abrir(numero)).cliente).toBe('COORDINADORA MERCANTIL S.A.S.');
  });

  it('deja escribir a mano un número que todavía no existe', async () => {
    // El caso legítimo que el campo editable existe para cubrir: rescatar del
    // Excel una cotización de 2025 con el número que tuvo entonces.
    const vieja = await almacenLocal.registrar(cotizacion({ numero: 'COT-2025-0413' }));
    expect(vieja.numero).toBe('COT-2025-0413');
  });

  it('avisa cuando se pide una cotización que no existe', async () => {
    await expect(almacenLocal.abrir('COT-DEMO-9999')).rejects.toBeInstanceOf(FalloApi);
    await expect(almacenLocal.marcar('COT-DEMO-9999', 'perdida', '')).rejects.toBeInstanceOf(
      FalloApi,
    );
  });
});

/**
 * La papelera.
 *
 * Se prueba contra el almacén de la vista previa porque es el único de los dos
 * que corre sin servidor, pero las reglas que se comprueban aquí son las del
 * contrato —qué alcanza cada operación, qué se puede deshacer y qué no— y el
 * Worker tiene que cumplirlas igual. Si un día divergen, el preview estaría
 * enseñando algo que no va a pasar.
 */
describe('almacenLocal · dólares', () => {
  const enDolares = { moneda: 'USD', tasa: 4000, iva: 0 } as const;

  it('guarda el total en su moneda y el equivalente en pesos', async () => {
    // Las dos cifras: la que el cliente tiene delante y la que el historial
    // suma. Una sola columna con pesos y dólares mezclados daría una suma que
    // no es dinero de ninguna clase.
    const enDolaresConPrecio = cotizacion({ ...enDolares });
    enDolaresConPrecio.lineas[0]!.unitario = 0.25;

    const { numero } = await almacenLocal.registrar(enDolaresConPrecio);
    const guardada = await almacenLocal.abrir(numero);

    expect(guardada.moneda).toBe('USD');
    expect(guardada.tasa).toBe(4000);
    expect(guardada.totalMoneda).toBe(25); // 100 uds × 0,25, sin IVA
    expect(guardada.total).toBe(100_000); // los mismos 25 dólares, a 4.000
  });

  it('la suma del listado va en pesos aunque haya dólares de por medio', async () => {
    const enPesos = cotizacion();
    const dolares = cotizacion({ ...enDolares });
    dolares.lineas[0]!.unitario = 0.25;

    await almacenLocal.registrar(enPesos);
    await almacenLocal.registrar(dolares);

    // 119.000 de la de pesos (100 × 1.000 + IVA) + 100.000 de la de dólares.
    expect((await almacenLocal.listar({})).sumaTotales).toBe(219_000);
  });
});

describe('almacenLocal · papelera', () => {
  const deOtroCliente = {
    empresa: 'Transportes del Norte',
    nit: '900.111.222-3',
    contacto: 'Luis Gómez',
    telefono: '',
    email: '',
    ciudad: 'Medellín',
  };

  it('lo eliminado sale del historial y aparece en la papelera', async () => {
    const { numero } = await almacenLocal.registrar(cotizacion());

    expect(await almacenLocal.eliminar({ numeros: [numero] })).toEqual({ cuantas: 1 });

    expect((await almacenLocal.listar({})).cuantas).toBe(0);
    const papelera = await almacenLocal.listar({ papelera: true });
    expect(papelera.cuantas).toBe(1);
    expect(papelera.cotizaciones[0]!.eliminadaEn).toBeTruthy();
    expect(papelera.cotizaciones[0]!.eliminadaPor).toBeTruthy();
  });

  it('eliminar no borra el documento: la cotización se puede restaurar entera', async () => {
    // Es lo que separa la papelera de un borrado: mientras está ahí, el PDF
    // que recibió el cliente se sigue pudiendo regenerar.
    const { numero } = await almacenLocal.registrar(cotizacion());
    await almacenLocal.eliminar({ numeros: [numero] });

    expect((await almacenLocal.abrir(numero)).documento.lineas).toHaveLength(1);

    expect(await almacenLocal.restaurar({ numeros: [numero] })).toEqual({ cuantas: 1 });
    expect((await almacenLocal.listar({})).cuantas).toBe(1);
    expect((await almacenLocal.listar({ papelera: true })).cuantas).toBe(0);
  });

  it('el estado comercial sobrevive a un viaje a la papelera y vuelta', async () => {
    const { numero } = await almacenLocal.registrar(cotizacion());
    await almacenLocal.marcar(numero, 'aceptada', 'Orden de compra 4512');

    await almacenLocal.eliminar({ numeros: [numero] });
    await almacenLocal.restaurar({ numeros: [numero] });

    const guardada = await almacenLocal.abrir(numero);
    expect(guardada.estado).toBe('aceptada');
    expect(guardada.estadoNota).toBe('Orden de compra 4512');
    expect(guardada.eliminadaEn).toBeNull();
  });

  it('purgar sólo alcanza lo que ya está en la papelera', async () => {
    // La red de seguridad entera: sin el paso previo, una selección
    // equivocada se lleva por delante cotizaciones que están a la vista.
    const { numero } = await almacenLocal.registrar(cotizacion());

    expect(await almacenLocal.purgar({ numeros: [numero] })).toEqual({ cuantas: 0 });
    expect((await almacenLocal.listar({})).cuantas).toBe(1);

    await almacenLocal.eliminar({ numeros: [numero] });
    expect(await almacenLocal.purgar({ numeros: [numero] })).toEqual({ cuantas: 1 });

    expect((await almacenLocal.listar({ papelera: true })).cuantas).toBe(0);
    await expect(almacenLocal.abrir(numero)).rejects.toBeInstanceOf(FalloApi);
  });

  it('eliminar no alcanza lo que ya está en la papelera', async () => {
    const { numero } = await almacenLocal.registrar(cotizacion());
    await almacenLocal.eliminar({ numeros: [numero] });

    // Ni la vuelve a retirar ni le pisa la fecha de retirada: quién la quitó
    // y cuándo son el dato que hace falta para preguntar qué pasó.
    const antes = (await almacenLocal.listar({ papelera: true })).cotizaciones[0]!.eliminadaEn;
    expect(await almacenLocal.eliminar({ numeros: [numero] })).toEqual({ cuantas: 0 });
    expect((await almacenLocal.listar({ papelera: true })).cotizaciones[0]!.eliminadaEn).toBe(antes);
  });

  it('«todas las que cumplen el filtro» alcanza justo a ésas', async () => {
    // El caso que hace falta con mil cotizaciones guardadas: filtrar y
    // borrarlas de una vez, sin que la de al lado se vaya de paso.
    const suya = await almacenLocal.registrar(cotizacion());
    const ajena = await almacenLocal.registrar(cotizacion({ cliente: deOtroCliente }));

    expect(await almacenLocal.eliminar({ todas: true, filtro: { texto: 'Coordinadora' } })).toEqual({
      cuantas: 1,
    });

    expect((await almacenLocal.listar({})).cotizaciones.map((c) => c.numero)).toEqual([
      ajena.numero,
    ]);
    expect((await almacenLocal.listar({ papelera: true })).cotizaciones.map((c) => c.numero)).toEqual(
      [suya.numero],
    );
  });

  it('vaciar la papelera no toca lo que está a la vista', async () => {
    const retirada = await almacenLocal.registrar(cotizacion());
    const viva = await almacenLocal.registrar(cotizacion({ cliente: deOtroCliente }));
    await almacenLocal.eliminar({ numeros: [retirada.numero] });

    // Sin filtro y sobre la papelera: es «vaciar la papelera», y no puede
    // significar «borrar el historial».
    expect(await almacenLocal.purgar({ todas: true, filtro: {} })).toEqual({ cuantas: 1 });
    expect((await almacenLocal.listar({})).cotizaciones.map((c) => c.numero)).toEqual([viva.numero]);
  });

  it('volver a emitir una cotización retirada la saca de la papelera', async () => {
    // Lo que acaba de salir hacia un cliente no puede quedarse escondido.
    const { numero } = await almacenLocal.registrar(cotizacion());
    await almacenLocal.eliminar({ numeros: [numero] });

    await almacenLocal.registrar(cotizacion({ numero }));

    expect((await almacenLocal.listar({})).cuantas).toBe(1);
    expect((await almacenLocal.listar({ papelera: true })).cuantas).toBe(0);
  });

  it('el número sigue ocupado aunque la cotización esté en la papelera', async () => {
    // El consecutivo no retrocede: reutilizar un número gastado es lo que
    // produce dos cotizaciones distintas con el mismo «COT-2026-0007».
    const { numero } = await almacenLocal.registrar(cotizacion());
    await almacenLocal.eliminar({ numeros: [numero] });

    await expect(
      almacenLocal.registrar(cotizacion({ numero, cliente: deOtroCliente })),
    ).rejects.toMatchObject({ codigo: 'numero-ocupado' });
  });
});
