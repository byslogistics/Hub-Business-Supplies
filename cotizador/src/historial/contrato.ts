/**
 * Qué le pide el cotizador al historial, sin decir quién lo cumple.
 *
 * Está separado de las implementaciones para que las dos —la de verdad, contra
 * el servidor, y la de la vista previa, contra el navegador— puedan depender de
 * esto sin depender la una de la otra.
 */

import type {
  CotizacionGuardada,
  Cuantas,
  Estado,
  FiltroHistorial,
  Identidad,
  PaginaHistorial,
  Seleccion,
} from '../../../compartido/historial';
import type { Cotizacion } from '../dominio/tipos';

export interface Almacen {
  /** Quién está usando el hub. */
  yo(): Promise<Identidad>;
  /**
   * Guarda una cotización emitida y devuelve su número.
   *
   * Sin número asignado, lo pide al consecutivo central. Con número, actualiza
   * la que ya existe: bajar el PDF y luego mandar el WhatsApp es una sola
   * cotización, no dos.
   */
  registrar(cotizacion: Cotizacion): Promise<{ numero: string; emitidaEn: string }>;
  listar(filtro: FiltroHistorial): Promise<PaginaHistorial>;
  abrir(numero: string): Promise<CotizacionGuardada<Cotizacion>>;
  marcar(numero: string, estado: Estado, nota: string): Promise<void>;

  /**
   * Manda cotizaciones a la papelera.
   *
   * No las borra: el número sigue ocupado y el documento sigue ahí. Lo que
   * cambia es que dejan de salir en el historial. Es lo que hace falta el
   * 99 % de las veces —quitar de en medio pruebas y duplicados— y deja
   * arreglar el descuido de haber quitado la que no era.
   */
  eliminar(seleccion: Seleccion): Promise<Cuantas>;
  /** Las saca de la papelera y vuelven al historial como estaban. */
  restaurar(seleccion: Seleccion): Promise<Cuantas>;
  /**
   * Borra de verdad, y sólo lo que ya está en la papelera.
   *
   * Que haya que pasar por la papelera primero no es una molestia inventada:
   * es lo que convierte «borré mil cotizaciones sin querer» en algo que se
   * deshace. El número gastado en el consecutivo no vuelve ni siquiera aquí.
   */
  purgar(seleccion: Seleccion): Promise<Cuantas>;
}

// El fallo y sus códigos son de toda la API, no sólo del historial: el panel
// de clientes rechaza con la misma forma. Se siguen exportando desde aquí para
// que quien pedía el contrato del historial no tenga que ir a dos sitios.
export { FalloApi } from '../api/fallo';
export type { CodigoFallo } from '../api/fallo';
