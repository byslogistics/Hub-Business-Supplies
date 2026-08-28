/**
 * Lo que el Worker responde cuando algo se rechaza, valga para lo que valga.
 *
 * Está aparte del contrato del historial porque ya no es sólo suyo: el panel
 * de clientes usa la misma forma y necesita códigos propios. Tener una sola
 * forma de error en toda la API es lo que permite que la pantalla decida qué
 * ofrecer —«restaurar», «ver el que ya existe»— mirando un solo campo.
 */

export interface ErrorApi {
  /**
   * Para la pantalla: decide qué botón ofrecer.
   *
   * - `sin-acceso`      la sesión de Access caducó; recargar vuelve a entrar.
   * - `numero-ocupado`  ese número de cotización ya es de otro cliente.
   * - `cliente-duplicado` ese NIT o ese correo ya son de otra ficha.
   * - `no-encontrada`   no existe.
   * - `invalida`        lo que llegó no se puede guardar, y `mensaje` dice por qué.
   * - `fallo`           algo se rompió por dentro; no es culpa de quien llama.
   */
  codigo:
    | 'sin-acceso'
    | 'numero-ocupado'
    | 'cliente-duplicado'
    | 'no-encontrada'
    | 'invalida'
    | 'fallo';
  /** Para la persona, ya redactado en español y listo para pintar tal cual. */
  mensaje: string;
  /**
   * Dato suelto que la pantalla necesita para ofrecer la salida.
   *
   * Hoy sólo lo usa `cliente-duplicado`, que manda el código del cliente con
   * el que se chocó para poder ofrecer «abrir el que ya existe» en vez de
   * dejar a quien escribe adivinando cuál era.
   */
  detalle?: string;
}
