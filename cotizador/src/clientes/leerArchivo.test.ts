import { describe, expect, it } from 'vitest';

import { ArchivoIlegible, leerArchivo } from './leerArchivo';

/**
 * Lo que se prueba aquí es el CSV, que es donde está la dificultad de verdad:
 * el archivo llega de Excel en español —con punto y coma y en la codificación
 * vieja de Windows—, de otra herramienta con comas, o de nuestra propia
 * exportación. Equivocarse leyendo no da un error: da clientes con los datos
 * corridos de columna.
 */
function csv(texto: string, nombre = 'clientes.csv'): File {
  return new File([texto], nombre, { type: 'text/csv' });
}

const CABECERA = 'Código;Empresa;Tipo;NIT o cédula;Contacto;Cargo;Teléfono;WhatsApp;Correo;Otros correos;Otros teléfonos;Ciudad;Dirección;Asesora;Estado;Notas';

describe('separadores y comillas', () => {
  it('lee el punto y coma, que es lo que escribe Excel en español', async () => {
    const { filas } = await leerArchivo(csv(`${CABECERA}\r\n;Uno S.A.S.;Empresa;900.111.111-1;;;;;;;;Bogotá;;;;`));

    expect(filas).toHaveLength(1);
    expect(filas[0]?.datos.empresa).toBe('Uno S.A.S.');
    expect(filas[0]?.datos.nit).toBe('900.111.111-1');
    expect(filas[0]?.datos.ciudad).toBe('Bogotá');
  });

  it('lee también la coma, para el archivo que viene de otra herramienta', async () => {
    const { filas } = await leerArchivo(csv('Empresa,NIT,Ciudad\nUno S.A.S.,900111,Cali'));

    expect(filas[0]?.datos.empresa).toBe('Uno S.A.S.');
    expect(filas[0]?.datos.ciudad).toBe('Cali');
  });

  it('no parte una celda por el separador que lleva dentro', async () => {
    // Sin respetar las comillas, esta nota correría todas las columnas
    // siguientes una posición y el cliente acabaría con la ciudad en el campo
    // equivocado.
    const { filas } = await leerArchivo(
      csv('Empresa;Notas;Ciudad\nUno S.A.S.;"Paga a 30 días; pide factura aparte";Bogotá'),
    );

    expect(filas[0]?.datos.notas).toBe('Paga a 30 días; pide factura aparte');
    expect(filas[0]?.datos.ciudad).toBe('Bogotá');
  });

  it('entiende las comillas dobladas de dentro de una celda', async () => {
    const { filas } = await leerArchivo(csv('Empresa;Notas\nUno;"Pide ""factura aparte"""'));

    expect(filas[0]?.datos.notas).toBe('Pide "factura aparte"');
  });
});

describe('la codificación', () => {
  it('lee las tildes de un archivo guardado por Excel en Windows', async () => {
    // `Bogotá` en la codificación vieja: la á es un solo byte (0xE1). Leído
    // como UTF-8 saldría ilegible.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('Empresa;Ciudad\nUno;Bogot'),
      0xe1,
    ]);
    const archivo = new File([bytes], 'clientes.csv', { type: 'text/csv' });

    const { filas } = await leerArchivo(archivo);

    expect(filas[0]?.datos.ciudad).toBe('Bogotá');
  });

  it('quita la marca del principio en vez de pegarla al primer título', async () => {
    const { filas } = await leerArchivo(csv('﻿Empresa;Ciudad\nUno;Cali'));

    // Sin quitarla, el primer encabezado sería «﻿Empresa» y la columna del
    // nombre no se reconocería.
    expect(filas[0]?.datos.empresa).toBe('Uno');
  });
});

describe('los encabezados', () => {
  it('reconoce los títulos que usa la gente, no sólo los de la plantilla', async () => {
    const { filas } = await leerArchivo(
      csv('Razón social;NIT;Vendedora;E-mail\nUno S.A.S.;900111;Paola Vargas;a@uno.com'),
    );

    expect(filas[0]?.datos).toMatchObject({
      empresa: 'Uno S.A.S.',
      nit: '900111',
      asesor: 'Paola Vargas',
      correo: 'a@uno.com',
    });
  });

  it('no le importan las tildes ni las mayúsculas del título', async () => {
    const { filas } = await leerArchivo(csv('EMPRESA;CIUDAD\nUno;Cali'));

    expect(filas[0]?.datos.empresa).toBe('Uno');
  });

  it('avisa de las columnas que no supo interpretar', async () => {
    const { ignoradas } = await leerArchivo(csv('Empresa;Cupo de crédito\nUno;5000000'));

    expect(ignoradas).toEqual(['Cupo de crédito']);
  });

  it('se planta si ninguna columna coincide, en vez de importar filas vacías', async () => {
    await expect(leerArchivo(csv('Columna A;Columna B\nUno;Dos'))).rejects.toThrow(ArchivoIlegible);
  });
});

describe('las filas', () => {
  it('numera las líneas como las ve la persona en la hoja', async () => {
    const { filas } = await leerArchivo(csv('Empresa\nUno\nDos'));

    // La primera fila de datos es la 2: la 1 es el encabezado.
    expect(filas.map((f) => f.linea)).toEqual([2, 3]);
  });

  it('descarta las vacías sin contarlas como clientes', async () => {
    const { filas, vacias } = await leerArchivo(csv('Empresa\nUno\n\n\nDos'));

    expect(filas).toHaveLength(2);
    expect(vacias).toBe(2);
  });

  it('parte los correos adicionales de una misma celda', async () => {
    const { filas } = await leerArchivo(csv('Empresa;Otros correos\nUno;"a@x.com | b@x.com"'));

    expect(filas[0]?.datos.correosExtra).toEqual(['a@x.com', 'b@x.com']);
  });

  it('lee el código aparte de los datos: es identidad, no un campo', async () => {
    const { filas } = await leerArchivo(csv('Código;Empresa\nCLI-0007;Uno'));

    expect(filas[0]?.codigo).toBe('CLI-0007');
    expect(filas[0]?.datos).not.toHaveProperty('codigo');
  });

  it('traduce el tipo y el estado escritos como los escribe una persona', async () => {
    const { filas } = await leerArchivo(
      csv('Empresa;Tipo;Estado\nCarolina;Persona natural;Cliente activo'),
    );

    expect(filas[0]?.datos.tipo).toBe('persona');
    expect(filas[0]?.datos.estado).toBe('activo');
  });

  it('una celda vacía no borra nada: simplemente no dice nada', async () => {
    const { filas } = await leerArchivo(csv('Empresa;Teléfono\nUno;'));

    // Si devolviera `telefono: ''`, una importación podría vaciar el teléfono
    // que alguien tenía escrito. Lo vacío no viaja.
    expect(filas[0]?.datos).not.toHaveProperty('telefono');
  });

  it('se planta con un archivo que sólo tiene encabezados', async () => {
    await expect(leerArchivo(csv('Empresa;Ciudad'))).rejects.toThrow(ArchivoIlegible);
  });
});
