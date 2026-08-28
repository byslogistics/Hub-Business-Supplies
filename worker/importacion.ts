/**
 * La carga de clientes por lote, contra la base.
 *
 * Este archivo ya casi no decide nada: **qué pasa con cada fila lo dice
 * `compartido/importacion.ts`**, que es el mismo código que usa la vista previa.
 * Aquí sólo se le da a esa cabeza cómo buscar en D1 y cómo escribir el
 * resultado.
 *
 * Que `revisar` y `confirmar` compartan esa cabeza no es economía de líneas: si
 * cada una decidiera por su cuenta, un día la pantalla de confirmación diría
 * «12 nuevos» y se crearían 11, y nadie sabría cuál de las dos mentía.
 */

import type { Cliente } from '../compartido/clientes';
import {
  contarAcciones,
  examinarFila,
  fichaRellenada,
  filasSeguras,
  FilasVistas,
  MAXIMO_FILAS_IMPORTACION,
  type BuscadorClientes,
  type FilaImportacion,
  type FilaRevisada,
  type ResultadoImportacion,
  type RevisionImportacion,
} from '../compartido/importacion';
import * as clientes from './clientes';
import { cuerpoJson, ErrorPeticion } from './http';

/** Cómo busca la cabeza compartida cuando detrás hay una base D1. */
function buscadorDe(base: D1Database): BuscadorClientes {
  return {
    porCodigo: (codigo) => clientes.abrir(base, codigo).catch(() => null),
    coincidencia: async (clave) => (await clientes.coincidencia(base, clave)).coincidencia,
  };
}

export async function revisar(base: D1Database, peticion: Request): Promise<RevisionImportacion> {
  const filas = await leerFilas(peticion);
  const buscador = buscadorDe(base);
  const vistas = new FilasVistas();
  const revisadas: FilaRevisada[] = [];

  for (const fila of filas) {
    revisadas.push(await examinarFila(fila, buscador, vistas));
  }

  return { filas: revisadas, resumen: contarAcciones(revisadas) };
}

/**
 * Aplica lo que la revisión dijo que iba a pasar.
 *
 * Vuelve a examinar cada fila en vez de fiarse de lo que la pantalla enseñó, y
 * no por desconfianza: entre que alguien mira la revisión y le da al botón
 * pueden pasar minutos, y en esos minutos la otra socia pudo dar de alta a
 * medio archivo. Lo que se aplica es lo que corresponde **ahora**.
 */
export async function confirmar(
  base: D1Database,
  peticion: Request,
): Promise<ResultadoImportacion> {
  const filas = await leerFilas(peticion);
  const buscador = buscadorDe(base);
  const vistas = new FilasVistas();
  const resultado: ResultadoImportacion = { creados: 0, completados: 0, omitidos: 0, errores: 0 };

  for (const fila of filas) {
    const revisada = await examinarFila(fila, buscador, vistas);

    switch (revisada.accion) {
      case 'error':
        resultado.errores += 1;
        break;

      // Una fila que sigue en «revisar» es una que nadie decidió: se queda
      // fuera. Importar por defecto lo dudoso sería justo lo contrario de lo
      // que esta pantalla existe para evitar.
      case 'revisar':
      case 'omitir':
        resultado.omitidos += 1;
        break;

      case 'crear':
        await clientes.crearConDatos(base, fila.datos);
        resultado.creados += 1;
        break;

      case 'completar': {
        const ficha: Cliente = await clientes.abrir(base, revisada.codigo!);
        await clientes.actualizarConDatos(base, ficha.codigo, fichaRellenada(ficha, fila.datos));
        resultado.completados += 1;
        break;
      }
    }
  }

  return resultado;
}

async function leerFilas(peticion: Request): Promise<FilaImportacion[]> {
  const cuerpo = await cuerpoJson<{ filas?: unknown }>(peticion);
  const filas = filasSeguras(cuerpo.filas);

  if (filas.length === 0) {
    throw new ErrorPeticion(400, 'invalida', 'El archivo no trae ninguna fila con datos.');
  }
  if (filas.length > MAXIMO_FILAS_IMPORTACION) {
    throw new ErrorPeticion(
      400,
      'invalida',
      `El archivo trae ${filas.length} filas y el máximo son ${MAXIMO_FILAS_IMPORTACION}. ` +
        'Pártalo en dos y súbalos por separado.',
    );
  }

  return filas;
}
