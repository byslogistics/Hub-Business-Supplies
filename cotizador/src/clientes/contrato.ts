/**
 * Qué le pide el panel de clientes al servidor, sin decir quién lo cumple.
 *
 * El gemelo de `historial/contrato.ts`, y por la misma razón: las dos
 * implementaciones —la de verdad y la de la vista previa, que guarda en el
 * navegador— dependen de esto y no la una de la otra.
 */

import type {
  Cliente,
  Coincidencia,
  CuantosClientes,
  DatosCliente,
  FiltroClientes,
  PaginaClientes,
  SeleccionClientes,
} from '../../../compartido/clientes';

export interface AlmacenClientes {
  listar(filtro: FiltroClientes): Promise<PaginaClientes>;
  abrir(codigo: string): Promise<Cliente>;

  /** Da de alta una ficha y devuelve la que quedó, ya con su código. */
  crear(datos: DatosCliente): Promise<Cliente>;
  actualizar(codigo: string, datos: DatosCliente): Promise<Cliente>;

  /**
   * «¿A éste ya lo tengo?».
   *
   * Devuelve la primera ficha que responda por NIT, por correo o por nombre —en
   * ese orden— diciendo por cuál fue. **No decide nada**: quien llama mira
   * `fuerte` para saber si puede darlo por hecho (sólo el NIT) o tiene que
   * preguntarle a la persona.
   */
  coincidencia(clave: { nit?: string; correo?: string; empresa?: string }): Promise<Coincidencia | null>;

  /**
   * Manda fichas a la papelera.
   *
   * No borra ninguna cotización: el historial de lo que se le vendió a alguien
   * no puede depender de que su ficha siga en la lista.
   */
  eliminar(seleccion: SeleccionClientes): Promise<CuantosClientes>;
  restaurar(seleccion: SeleccionClientes): Promise<CuantosClientes>;
  /** Borra de verdad, y sólo lo que ya está en la papelera. */
  purgar(seleccion: SeleccionClientes): Promise<CuantosClientes>;
}
