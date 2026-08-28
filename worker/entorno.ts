/**
 * Lo que Cloudflare le pasa al Worker: la base, los archivos y los secretos.
 *
 * En un archivo propio porque lo miran los tres módulos —el enrutador, los
 * clientes y los envíos— y tenerlo dentro de uno de ellos obligaría a los otros
 * dos a importar de ahí sólo por un tipo.
 */

export interface Env {
  BASE: D1Database;
  ASSETS: Fetcher;
  ACCESO_DOMINIO: string;
  ACCESO_AUD: string;
  /** La llave de la cuenta de Resend de la empresa. Se pone con
   *  `wrangler secret put RESEND_API_KEY` — nunca en `wrangler.jsonc`. */
  RESEND_API_KEY: string;
  /** `desarrollo` salta la comprobación de Access. Nunca en producción. */
  MODO?: string;
  /**
   * A dónde se mandan los correos. Vacío significa Resend, que es lo que
   * corresponde siempre en producción.
   *
   * Existe para poder probar el camino entero del envío —las dos direcciones
   * de respuesta, las copias ocultas, el registro— sin mandarle un correo a
   * nadie ni gastar cuota. Se pone en `.dev.vars`, que no se versiona.
   */
  RESEND_ENDPOINT?: string;
  CORREO_DESARROLLO?: string;
}

