/**
 * Todo lo que ha pasado con un cliente, en una sola pregunta.
 *
 * Es la pantalla que justifica las cuatro fases anteriores: abrir una ficha y
 * ver qué se le cotizó, qué compró y qué se le escribió, sin ir a buscarlo a
 * tres sitios distintos.
 */

import type { ResumenCotizacion } from './historial';

/** Un correo que salió del hub, visto desde la ficha de quien lo recibió. */
export interface ResumenEnvio {
  /** El identificador que devolvió Resend. */
  id: string;
  enviadoEn: string;
  /** Quién le dio a enviar, del token de Access. */
  autor: string;
  /** Quién firma: un identificador del equipo. */
  remitenteId: string;
  plantillaId: string;
  asunto: string;
  destinatarios: string[];
  /** La cotización que iba dentro, si iba alguna. */
  cotizacionNumero: string | null;
  adjuntos: number;
}

/**
 * Las cuatro cifras de un cliente.
 *
 * Todas **en pesos**, por lo mismo que en el historial: sumar pesos y dólares
 * en la misma cifra daría un número que no es dinero de ninguna clase. Lo
 * cotizado en dólares entra convertido a la tasa que cada cotización guardó.
 */
export interface TotalesCliente {
  /** Todo lo que se le ha cotizado, esté en el estado que esté. */
  cotizado: number;
  /** Lo aceptado. Es lo que en este hub significa «lo que ha comprado». */
  ganado: number;
  /** Lo emitido que todavía no se sabe en qué acabó. */
  pendiente: number;
  perdido: number;
  cuantas: number;
}

export interface ActividadCliente {
  totales: TotalesCliente;
  /** Las últimas, de la más reciente hacia atrás. */
  cotizaciones: ResumenCotizacion[];
  envios: ResumenEnvio[];
}

/** Cuántas filas de cada cosa trae la ficha. Es una ficha, no un listado. */
export const ACTIVIDAD_POR_FICHA = 20;
