/**
 * Un fallo del servidor, ya traducido a algo que se le puede enseñar a una
 * persona.
 *
 * Es de toda la API y no sólo del historial: el panel de clientes rechaza con
 * la misma forma —ver `compartido/api.ts`— y tener dos clases de error
 * obligaría a cada pantalla a preguntar dos veces de qué tipo es lo que acaba
 * de fallar.
 *
 * `mensaje` va en español y se pinta tal cual; `message` lo hereda de `Error`
 * con el mismo texto, para que la consola y las trazas no salgan vacías.
 */

import type { ErrorApi } from '../../../compartido/api';

/** Los códigos del servidor, más el único que nace en el navegador. */
export type CodigoFallo = ErrorApi['codigo'] | 'sin-conexion';

export class FalloApi extends Error {
  constructor(
    readonly codigo: CodigoFallo,
    readonly mensaje: string,
    /** Con quién se chocó, cuando el servidor lo dice. */
    readonly detalle?: string,
  ) {
    super(mensaje);
  }
}
