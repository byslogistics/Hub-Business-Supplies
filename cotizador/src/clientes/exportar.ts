/**
 * La lista de clientes, bajada a un archivo que se abre en Excel.
 *
 * Se exporta **todo lo que cumple el filtro**, no la página que se está
 * viendo: quien pulsa «Exportar» con el filtro en «activos» quiere los activos,
 * los ciento veinte, no los veinticinco de la primera página.
 *
 * Va como CSV separado por punto y coma y con marca de orden de bytes al
 * principio. Las dos cosas son por Excel: en la configuración regional de
 * Colombia el separador de listas es el punto y coma —con comas, el archivo se
 * abre entero en una sola columna— y sin esa marca, «Bogotá» aparece como
 * «BogotÃ¡».
 */

import type { AlmacenClientes } from './contrato';
import { NOMBRE_ESTADO_CLIENTE, type Cliente, type FiltroClientes } from '../../../compartido/clientes';

/** Tope de cortesía: exportar cien mil fichas no es exportar, es colgarse. */
const MAXIMO_EXPORTADO = 5000;

const COLUMNAS: { titulo: string; valor: (c: Cliente) => string }[] = [
  { titulo: 'Código', valor: (c) => c.codigo },
  { titulo: 'Empresa', valor: (c) => c.empresa },
  { titulo: 'Tipo', valor: (c) => (c.tipo === 'persona' ? 'Persona' : 'Empresa') },
  { titulo: 'NIT o cédula', valor: (c) => c.nit },
  { titulo: 'Contacto', valor: (c) => c.contacto },
  { titulo: 'Cargo', valor: (c) => c.cargo },
  { titulo: 'Teléfono', valor: (c) => c.telefono },
  { titulo: 'WhatsApp', valor: (c) => c.whatsapp },
  { titulo: 'Correo', valor: (c) => c.correo },
  { titulo: 'Otros correos', valor: (c) => c.correosExtra.join(' | ') },
  { titulo: 'Otros teléfonos', valor: (c) => c.telefonosExtra.join(' | ') },
  { titulo: 'Ciudad', valor: (c) => c.ciudad },
  { titulo: 'Dirección', valor: (c) => c.direccion },
  { titulo: 'Asesora', valor: (c) => c.asesor },
  { titulo: 'Estado', valor: (c) => NOMBRE_ESTADO_CLIENTE[c.estado] },
  { titulo: 'Notas', valor: (c) => c.notas },
];

/** Una fila de CSV, con lo que haya que entrecomillar entrecomillado. */
function celda(valor: string): string {
  const limpio = valor ?? '';
  return /[;"\n\r]/.test(limpio) ? `"${limpio.replace(/"/g, '""')}"` : limpio;
}

export function csvDeClientes(clientes: readonly Cliente[]): string {
  const filas = [
    COLUMNAS.map((c) => celda(c.titulo)).join(';'),
    ...clientes.map((cliente) => COLUMNAS.map((c) => celda(c.valor(cliente))).join(';')),
  ];

  // Salto de línea de Windows: es el que Excel espera y el que no deja una
  // última fila fantasma al abrir.
  return filas.join('\r\n');
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
