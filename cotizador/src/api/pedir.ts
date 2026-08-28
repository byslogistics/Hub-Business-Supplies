/**
 * La única forma en que esta aplicación habla con su servidor.
 *
 * Vivía dentro del historial y salió de ahí cuando el panel de clientes
 * necesitó lo mismo: distinguir «no hay red» de «el servidor dijo que no», y
 * convertir lo segundo en un `FalloApi` con el mensaje ya redactado.
 */

import type { ErrorApi } from '../../../compartido/api';
import { FalloApi } from './fallo';

export const BASE = '/api';

/**
 * La vista previa no tiene servidor detrás.
 *
 * Se decide al construir y no en marcha: el despliegue de producción nunca
 * define `VITE_DEMO`, así que los almacenes de mentira ni siquiera llegan al
 * paquete. Es lo que impide que una cotización de verdad acabe guardada en el
 * navegador de alguien creyendo que quedó registrada.
 */
export const ES_DEMOSTRACION = import.meta.env.VITE_DEMO === '1';

export async function pedir<T>(url: string, opciones: RequestInit = {}): Promise<T> {
  let respuesta: Response;

  try {
    respuesta = await fetch(url, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...opciones.headers },
    });
  } catch {
    // `fetch` sólo lanza cuando la petición no llegó a salir: sin red, DNS
    // caído, servidor inalcanzable. Un 500 no pasa por aquí.
    throw new FalloApi(
      'sin-conexion',
      'Sin conexión con el servidor. Revise la red y vuelva a intentarlo.',
    );
  }

  if (!respuesta.ok) {
    const problema = (await respuesta.json().catch(() => null)) as ErrorApi | null;
    throw new FalloApi(
      problema?.codigo ?? 'fallo',
      problema?.mensaje ?? `El servidor respondió ${respuesta.status}.`,
      problema?.detalle,
    );
  }

  return (await respuesta.json()) as T;
}
