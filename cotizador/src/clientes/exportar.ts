/**
 * Los clientes como hoja de cálculo: la plantilla que se descarga y la lista
 * que se exporta.
 *
 * Las dos salen de las mismas columnas (`compartido/columnasCliente.ts`), que
 * son también las que lee la importación. De ahí una propiedad que vale la pena
 * tener: **se puede exportar la lista, corregirla en Excel y volver a subirla**.
 *
 * Va como CSV separado por punto y coma y con marca de orden de bytes al
 * principio. Las dos cosas son por Excel: en la configuración regional de
 * Colombia el separador de listas es el punto y coma —con comas, el archivo se
 * abre entero en una sola columna— y sin esa marca, «Bogotá» aparece como
 * «BogotÃ¡». Y va como CSV y no como `.xlsx` para que no pueda desincronizarse
 * de las columnas de verdad: se genera aquí, no es un archivo guardado que
 * alguien tenga que acordarse de actualizar.
 */

import { COLUMNAS_CLIENTE, encabezados } from '../../../compartido/columnasCliente';
import type { Cliente, FiltroClientes } from '../../../compartido/clientes';
import type { AlmacenClientes } from './contrato';

/** Tope de cortesía: exportar cien mil fichas no es exportar, es colgarse. */
const MAXIMO_EXPORTADO = 5000;

/** Una celda de CSV, con lo que haya que entrecomillar entrecomillado. */
function celda(valor: string): string {
  const limpio = valor ?? '';
  return /[;"\n\r]/.test(limpio) ? `"${limpio.replace(/"/g, '""')}"` : limpio;
}

function comoCsv(filas: readonly string[][]): string {
  // Salto de línea de Windows: es el que Excel espera y el que no deja una
  // última fila fantasma al abrir.
  return filas.map((fila) => fila.map(celda).join(';')).join('\r\n');
}

export function csvDeClientes(clientes: readonly Cliente[]): string {
  return comoCsv([
    encabezados(),
    ...clientes.map((cliente) => [cliente.codigo, ...COLUMNAS_CLIENTE.map((c) => c.escribir(cliente))]),
  ]);
}

/**
 * Tres clientes de mentira, para que la plantilla no llegue en blanco.
 *
 * Una plantilla vacía deja a quien la abre adivinando qué va en cada columna:
 * si el NIT lleva puntos, cómo se escribe el estado, qué separa dos correos.
 * Con ejemplos delante no hay nada que adivinar.
 *
 * Están escritos para poder importarse tal cual —así el hub deja de estar vacío
 * el primer día— y llevan la nota que dice que son de mentira, para que se
 * puedan encontrar y borrar cuando lleguen los de verdad.
 */
const EJEMPLOS: readonly string[][] = [
  [
    '', // Sin código: es un cliente nuevo. El código lo pone el servidor.
    'Distribuidora La Sabana S.A.S.',
    'Empresa',
    '830.011.234-5',
    'Marcela Ríos',
    'Jefe de compras',
    '601 745 8890',
    '310 442 7719',
    'compras@lasabana.example.com',
    'contabilidad@lasabana.example.com',
    '',
    'Bogotá',
    'Calle 100 # 19-54, oficina 402',
    'Paola Vargas',
    'Cliente activo',
    'Cliente de ejemplo de la plantilla: se puede borrar.',
  ],
  [
    '',
    'Agroindustrias del Valle Ltda.',
    'Empresa',
    '890.303.212-1',
    'Hernán Ocampo',
    'Gerente de operaciones',
    '602 668 1120',
    '315 908 3341',
    'operaciones@agrovalle.example.com',
    '',
    '318 220 4455',
    'Cali',
    'Carrera 4 # 12-41, bodega 7',
    'Yeimy Mahecha',
    'Prospecto',
    'Cliente de ejemplo de la plantilla: se puede borrar.',
  ],
  [
    '',
    'Carolina Restrepo Mejía',
    'Persona',
    '43.128.907',
    'Carolina Restrepo',
    '',
    '',
    '312 774 1028',
    'carolina.restrepo@example.com',
    '',
    '',
    'Medellín',
    'Calle 33 # 74-18',
    'Neyla Mahecha',
    'Prospecto',
    'Cliente de ejemplo de la plantilla: se puede borrar.',
  ],
];

/** La plantilla en blanco, con sus encabezados y tres ejemplos llenos. */
export function csvDePlantilla(): string {
  return comoCsv([encabezados(), ...EJEMPLOS]);
}

/** Pide página tras página hasta tener todo lo que cumple el filtro. */
export async function todosLosQueCumplen(
  almacen: AlmacenClientes,
  filtro: FiltroClientes,
): Promise<Cliente[]> {
  const reunidos: Cliente[] = [];

  for (let pagina = 1; ; pagina += 1) {
    const trozo = await almacen.listar({ ...filtro, pagina });
    reunidos.push(...trozo.clientes);

    const completo = reunidos.length >= trozo.cuantos;
    if (completo || trozo.clientes.length === 0 || reunidos.length >= MAXIMO_EXPORTADO) break;
  }

  return reunidos;
}

export function nombreArchivo(papelera: boolean): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return `clientes${papelera ? '-papelera' : ''}-${hoy}.csv`;
}

/** Baja el archivo. El `\uFEFF` del principio es la marca que Excel busca. */
export function descargarCsv(contenido: string, nombre: string): void {
  const blob = new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // Como en el PDF: revocarlo de inmediato deja la descarga a medias en
  // algunos navegadores, que aún no han terminado de leer el blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
