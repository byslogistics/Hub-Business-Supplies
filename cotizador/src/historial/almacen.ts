/**
 * El historial, visto desde la pantalla.
 *
 * Todo lo que el cotizador sabe del servidor está en este archivo. El resto de
 * la aplicación llama a `almacen.registrar(...)` y no sabe si detrás hay
 * Cloudflare, Supabase o una carpeta: cambiar de proveedor es reescribir este
 * archivo y nada más.
 *
 * La otra mitad del contrato está en `compartido/historial.ts`, fuera del
 * cotizador, que es donde se declara qué viaja por el cable.
 */

import type {
  CotizacionGuardada,
  Cuantas,
  FiltroHistorial,
  Identidad,
  PaginaHistorial,
  Seleccion,
} from '../../../compartido/historial';
import { BASE, ES_DEMOSTRACION, pedir } from '../api/pedir';
import type { Cotizacion } from '../dominio/tipos';
import { almacenLocal } from './almacenLocal';
import type { Almacen } from './contrato';

// El resto de la aplicación pide el historial por aquí y no tiene por qué
// saber que el contrato vive en otro archivo.
export { FalloApi } from './contrato';
export type { Almacen, CodigoFallo } from './contrato';

// Se sigue exportando desde aquí porque media aplicación lo pide por este
// nombre; vive en `api/pedir.ts` porque ahora lo miran dos almacenes.
export { ES_DEMOSTRACION } from '../api/pedir';

/**
 * Arma la dirección del listado a partir del filtro.
 *
 * Aparte para poder probarla: es la única parte de este archivo que decide
 * algo, y equivocarse aquí significa un historial que ignora en silencio el
 * filtro que la persona acaba de escribir.
 */
export function urlDelListado(filtro: FiltroHistorial, base = BASE): string {
  const parametros = new URLSearchParams();

  const texto = filtro.texto?.trim();
  if (texto) parametros.set('texto', texto);
  if (filtro.estado) parametros.set('estado', filtro.estado);
  if (filtro.desde) parametros.set('desde', filtro.desde);
  if (filtro.hasta) parametros.set('hasta', filtro.hasta);
  if (filtro.pagina && filtro.pagina > 1) parametros.set('pagina', String(filtro.pagina));
  if (filtro.papelera) parametros.set('papelera', '1');

  const cadena = parametros.toString();
  return cadena ? `${base}/cotizaciones?${cadena}` : `${base}/cotizaciones`;
}

const almacenHttp: Almacen = {
  yo: () => pedir<Identidad>(`${BASE}/yo`),

  registrar: (cotizacion) =>
    cotizacion.numero
      ? pedir(`${BASE}/cotizaciones/${encodeURIComponent(cotizacion.numero)}`, {
          method: 'PUT',
          body: JSON.stringify(cotizacion),
        })
      : pedir(`${BASE}/cotizaciones`, { method: 'POST', body: JSON.stringify(cotizacion) }),

  listar: (filtro) => pedir<PaginaHistorial>(urlDelListado(filtro)),

  abrir: (numero) =>
    pedir<CotizacionGuardada<Cotizacion>>(`${BASE}/cotizaciones/${encodeURIComponent(numero)}`),

  marcar: async (numero, estado, nota) => {
    await pedir(`${BASE}/cotizaciones/${encodeURIComponent(numero)}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado, nota }),
    });
  },

  // Las tres van por POST con la selección en el cuerpo, y no por DELETE con
  // los números en la dirección, por lo mismo: la selección puede ser «todas
  // las que cumplen este filtro», que no cabe en una URL ni conviene que
  // quede escrita en el registro de accesos de nadie.
  eliminar: (seleccion) => enBloque('eliminar', seleccion),
  restaurar: (seleccion) => enBloque('restaurar', seleccion),
  purgar: (seleccion) => enBloque('purgar', seleccion),
};

function enBloque(accion: 'eliminar' | 'restaurar' | 'purgar', seleccion: Seleccion): Promise<Cuantas> {
  return pedir<Cuantas>(`${BASE}/cotizaciones/${accion}`, {
    method: 'POST',
    body: JSON.stringify(seleccion),
  });
}

export const almacen: Almacen = ES_DEMOSTRACION ? almacenLocal : almacenHttp;
