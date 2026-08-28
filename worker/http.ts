/**
 * Cómo responde la API, y cómo se rechaza una petición.
 *
 * Estaba al final de `index.ts` y salió de ahí cuando el panel de clientes se
 * llevó sus rutas a otro archivo: las dos mitades tienen que rechazar igual,
 * porque la pantalla decide qué ofrecer mirando el `codigo` y no le importa
 * cuál de los dos módulos lo emitió.
 */

import type { ErrorApi } from '../compartido/api';

/**
 * Un rechazo con su código y su mensaje ya en español.
 *
 * Se lanza desde cualquier profundidad y la única captura, la de `fetch`, lo
 * convierte en respuesta. Así ninguna función intermedia tiene que ir
 * devolviendo errores hacia arriba a mano.
 */
export class ErrorPeticion extends Error {
  constructor(
    readonly http: number,
    readonly codigo: ErrorApi['codigo'],
    mensaje: string,
    /** Dato suelto que la pantalla necesita: hoy, con quién se chocó. */
    readonly detalle?: string,
  ) {
    super(mensaje);
  }
}

export function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Lo que hay aquí dentro es de la empresa: que no lo guarde ninguna
      // caché intermedia ni quede en el disco del portátil del asesor.
      'Cache-Control': 'no-store',
    },
  });
}

export function fallo(
  http: number,
  codigo: ErrorApi['codigo'],
  mensaje: string,
  detalle?: string,
): Response {
  return json({ codigo, mensaje, ...(detalle ? { detalle } : {}) } satisfies ErrorApi, http);
}

/** El cuerpo de la petición como objeto, o un rechazo si no es JSON. */
export async function cuerpoJson<T>(peticion: Request): Promise<T> {
  const cuerpo = (await peticion.json().catch(() => null)) as T | null;
  if (!cuerpo || typeof cuerpo !== 'object') {
    throw new ErrorPeticion(400, 'invalida', 'El cuerpo no es JSON válido.');
  }
  return cuerpo;
}

/** Texto de un campo que llega de fuera: recortado y con tope de largo. */
export function texto(valor: unknown, maximo = 200): string {
  return typeof valor === 'string' ? valor.trim().slice(0, maximo) : '';
}
