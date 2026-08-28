/**
 * Convertir la hoja de cálculo que sube una persona en filas que el servidor
 * entienda.
 *
 * Se aceptan **Excel y CSV**, y no por lujo: la plantilla que damos es un CSV
 * —así nunca puede desincronizarse de las columnas de verdad— pero el archivo
 * que ya tenía la empresa es un `.xlsx`, y obligar a convertirlo a mano sería
 * poner la primera piedra en el camino.
 *
 * El lector de Excel se carga sólo al usarlo (`import()` dentro de la función),
 * igual que jsPDF: pesa, y quien entra a la lista de clientes no tiene por qué
 * descargarlo.
 *
 * Aquí no se decide nada sobre los clientes. Esto sólo lee: qué se hace con
 * cada fila lo dice el servidor.
 */

import {
  columnaDe,
  esColumnaCodigo,
  type ColumnaCliente,
} from '../../../compartido/columnasCliente';
import type { DatosCliente } from '../../../compartido/clientes';
import type { FilaImportacion } from '../../../compartido/importacion';

export interface ArchivoLeido {
  filas: FilaImportacion[];
  /** Encabezados del archivo que no corresponden a ninguna columna conocida. */
  ignoradas: string[];
  /** Cuántas filas venían en blanco y se descartaron sin decir nada. */
  vacias: number;
  /** Qué hoja se leyó, y cuáles se dejaron fuera. Sólo en los Excel. */
  hoja?: string;
  hojasIgnoradas?: string[];
}

export class ArchivoIlegible extends Error {}

/** Extensiones que el selector de archivos deja elegir. */
export const EXTENSIONES = '.xlsx,.xls,.csv,.txt';

export async function leerArchivo(archivo: File): Promise<ArchivoLeido> {
  const nombre = archivo.name.toLowerCase();

  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
    return interpretar(await tablaDesdeCsv(archivo));
  }

  const { tabla, hoja, hojasIgnoradas } = await tablaDesdeExcel(archivo);
  return { ...interpretar(tabla), hoja, hojasIgnoradas };
}

// --- De archivo a tabla de texto --------------------------------------------

/** Una hoja como matriz de celdas de texto. La primera fila es el encabezado. */
type Tabla = string[][];

/**
 * Lee un Excel y se queda con **la primera hoja**.
 *
 * Un libro puede traer varias y adivinar cuál es la buena sería adivinar. La
 * regla es simple y se dice en pantalla —«se leyó la hoja X, las demás se
 * dejaron fuera»— para que nadie suba un archivo de tres hojas y se pregunte
 * por qué entraron sólo veinte clientes.
 */
async function tablaDesdeExcel(
  archivo: File,
): Promise<{ tabla: Tabla; hoja?: string; hojasIgnoradas: string[] }> {
  // La entrada `/browser` y no la raíz: el paquete no tiene una, y cada
  // entrada trae el lector que corresponde a su entorno.
  const { default: leerExcel } = await import('read-excel-file/browser');

  let hojas: { sheet: string; data: unknown[][] }[];
  try {
    hojas = (await leerExcel(archivo)) as unknown as { sheet: string; data: unknown[][] }[];
  } catch {
    throw new ArchivoIlegible(
      'No se pudo leer el archivo. Compruebe que sea un Excel (.xlsx) o un CSV.',
    );
  }

  const primera = hojas[0];
  if (!primera) throw new ArchivoIlegible('El archivo no tiene ninguna hoja.');

  return {
    // Todo se trata como texto: un NIT con ceros delante y un teléfono son
    // números para Excel, y convertidos a número pierden justo lo que importa.
    tabla: primera.data.map((fila) => fila.map(comoTexto)),
    hoja: primera.sheet,
    hojasIgnoradas: hojas.slice(1).map((h) => h.sheet),
  };
}

function comoTexto(celda: unknown): string {
  if (celda === null || celda === undefined) return '';
  if (celda instanceof Date) return celda.toISOString().slice(0, 10);
  return String(celda).trim();
}

async function tablaDesdeCsv(archivo: File): Promise<Tabla> {
  const texto = await textoDe(archivo);
  const separador = separadorDe(texto);
  return partirCsv(texto, separador);
}

/**
 * El texto del archivo, adivinando en qué está escrito.
 *
 * Excel en español guarda los CSV en la codificación vieja de Windows, no en
 * UTF-8, y leerlos como UTF-8 convierte «Bogotá» en algo ilegible. Se intenta
 * primero UTF-8 en modo estricto —que falla si no lo es— y sólo entonces se
 * prueba la otra.
 */
async function textoDe(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  try {
    return quitarMarca(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return quitarMarca(new TextDecoder('windows-1252').decode(bytes));
  }
}

/** La marca de orden de bytes del principio, que no es texto. */
function quitarMarca(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/**
 * Con qué está separado el CSV.
 *
 * Se mira la primera línea y gana el que más veces aparezca. Punto y coma
 * primero porque es el que escribe Excel en español —y el que escribe nuestra
 * propia exportación—, pero un archivo bajado de otra herramienta vendrá con
 * comas y también tiene que entrar.
 */
function separadorDe(texto: string): string {
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  const cuantos = (caracter: string) => primera.split(caracter).length - 1;

  if (cuantos('\t') > cuantos(';') && cuantos('\t') > cuantos(',')) return '\t';
  return cuantos(';') >= cuantos(',') ? ';' : ',';
}

/**
 * Parte un CSV respetando las comillas.
 *
 * No sirve `split(',')`: una nota como `"Paga a 30 días; pide factura"` lleva el
 * separador dentro, y partir a lo bruto correría todas las columnas siguientes
 * una posición. Dentro de comillas, `""` es una comilla de verdad.
 */
function partirCsv(texto: string, separador: string): Tabla {
  const tabla: Tabla = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i]!;

    if (entreComillas) {
      if (caracter === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        celda += caracter;
      }
      continue;
    }

    if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === separador) {
      fila.push(celda.trim());
      celda = '';
    } else if (caracter === '\n' || caracter === '\r') {
      // `\r\n` es un solo salto, no dos.
      if (caracter === '\r' && texto[i + 1] === '\n') i += 1;
      fila.push(celda.trim());
      tabla.push(fila);
      fila = [];
      celda = '';
    } else {
      celda += caracter;
    }
  }

  if (celda !== '' || fila.length > 0) {
    fila.push(celda.trim());
    tabla.push(fila);
  }

  return tabla;
}

// --- De tabla a filas de cliente --------------------------------------------

function interpretar(tabla: Tabla): ArchivoLeido {
  const encabezado = tabla[0];
  if (!encabezado || encabezado.length === 0) {
    throw new ArchivoIlegible('El archivo está vacío.');
  }

  const mapa: (ColumnaCliente | 'codigo' | null)[] = encabezado.map((titulo) =>
    esColumnaCodigo(titulo) ? 'codigo' : columnaDe(titulo),
  );

  const ignoradas = encabezado.filter((titulo, i) => titulo.trim() !== '' && mapa[i] === null);

  if (!mapa.some((columna) => columna !== null && columna !== 'codigo')) {
    throw new ArchivoIlegible(
      'Ninguna columna del archivo coincide con las de la plantilla. ' +
        'Descargue la plantilla y compare los títulos de la primera fila.',
    );
  }

  const filas: FilaImportacion[] = [];
  let vacias = 0;

  for (let indice = 1; indice < tabla.length; indice += 1) {
    const celdas = tabla[indice]!;
    // La línea que se enseña es la de la hoja: la primera de datos es la 2.
    const linea = indice + 1;

    if (celdas.every((celda) => celda.trim() === '')) {
      vacias += 1;
      continue;
    }

    let codigo: string | undefined;
    let datos: Partial<DatosCliente> = {};

    celdas.forEach((celda, columnaIndice) => {
      const columna = mapa[columnaIndice];
      if (!columna) return;
      if (columna === 'codigo') {
        codigo = celda.trim() || undefined;
        return;
      }
      datos = { ...datos, ...columna.leer(celda) };
    });

    filas.push({ linea, codigo, datos });
  }

  if (filas.length === 0) {
    throw new ArchivoIlegible('El archivo tiene encabezados pero ninguna fila con datos.');
  }

  return { filas, ignoradas, vacias };
}
