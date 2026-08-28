/**
 * Cómo se normaliza un dato antes de compararlo.
 *
 * Vive fuera del historial y de los clientes porque los dos tienen que
 * responder igual: si el historial decide que `900.437.215-8` y `9004372158`
 * son el mismo cliente y el panel de clientes decide que no, se acaban
 * creando fichas duplicadas que nadie sabe de dónde salieron.
 *
 * Ninguna de estas funciones toca lo que se guarda. Lo que se guarda es lo que
 * escribió la persona, con sus puntos y sus tildes; esto es sólo para
 * comparar y para ordenar.
 */

/** `900.437.215-8` → `9004372158`. Vacío si no hay ningún dígito. */
export function soloDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** `  Ávila S.A.S. ` → `avila s.a.s.`. Para comparar y para ordenar. */
export function sinTildes(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * `  Ventas@Cliente.COM ` → `ventas@cliente.com`.
 *
 * Sólo minúsculas y espacios: la parte de antes de la arroba sí distingue
 * mayúsculas según la norma, pero ningún proveedor de correo del mundo real
 * las trata como distintas, y suponer que sí crearía dos fichas para el mismo
 * cliente por haber tecleado la inicial en mayúscula.
 */
export function correoNormal(valor: string | null | undefined): string {
  return (valor ?? '').trim().toLowerCase();
}

/** Si eso parece una dirección de correo. La misma comprobación que el Worker. */
export function pareceCorreo(valor: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((valor ?? '').trim());
}
