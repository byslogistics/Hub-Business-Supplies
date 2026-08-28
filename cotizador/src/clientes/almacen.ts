/**
 * El panel de clientes, visto desde la pantalla.
 *
 * Todo lo que la aplicación sabe del servidor de clientes está aquí. Las
 * pantallas llaman a `clientes.crear(...)` y no saben si detrás hay Cloudflare
 * o el `localStorage` de la vista previa.
 */

import type {
  Cliente,
  Coincidencia,
  CuantosClientes,
  FiltroClientes,
  PaginaClientes,
  SeleccionClientes,
} from '../../../compartido/clientes';
import type { ActividadCliente } from '../../../compartido/actividad';
import type { ResultadoImportacion, RevisionImportacion } from '../../../compartido/importacion';
import { BASE, ES_DEMOSTRACION, pedir } from '../api/pedir';
import { clientesLocales } from './almacenLocal';
import type { AlmacenClientes } from './contrato';

/**
 * Arma la dirección del listado a partir del filtro.
 *
 * Aparte para poder probarla: es la única parte de este archivo que decide
 * algo, y equivocarse aquí significa un panel que ignora en silencio el filtro
 * que la persona acaba de escribir.
 */
export function urlDelListado(filtro: FiltroClientes, base = BASE): string {
  const parametros = new URLSearchParams();

  const texto = filtro.texto?.trim();
  if (texto) parametros.set('texto', texto);
  if (filtro.estado) parametros.set('estado', filtro.estado);
  if (filtro.asesor) parametros.set('asesor', filtro.asesor);
  if (filtro.pagina && filtro.pagina > 1) parametros.set('pagina', String(filtro.pagina));
  if (filtro.papelera) parametros.set('papelera', '1');

  const cadena = parametros.toString();
  return cadena ? `${base}/clientes?${cadena}` : `${base}/clientes`;
}

/** La dirección de «¿a éste ya lo tengo?», con lo poco que se sepa de él. */
export function urlDeCoincidencia(
  clave: { nit?: string; correo?: string; empresa?: string },
  base = BASE,
): string {
  const parametros = new URLSearchParams();
  if (clave.nit?.trim()) parametros.set('nit', clave.nit.trim());
  if (clave.correo?.trim()) parametros.set('correo', clave.correo.trim());
  if (clave.empresa?.trim()) parametros.set('empresa', clave.empresa.trim());

  return `${base}/clientes/coincidencia?${parametros.toString()}`;
}

const clientesHttp: AlmacenClientes = {
  listar: (filtro) => pedir<PaginaClientes>(urlDelListado(filtro)),

  abrir: (codigo) => pedir<Cliente>(`${BASE}/clientes/${encodeURIComponent(codigo)}`),

  crear: (datos) => pedir<Cliente>(`${BASE}/clientes`, { method: 'POST', body: JSON.stringify(datos) }),

  actualizar: (codigo, datos) =>
    pedir<Cliente>(`${BASE}/clientes/${encodeURIComponent(codigo)}`, {
      method: 'PUT',
      body: JSON.stringify(datos),
    }),

  coincidencia: async (clave) =>
    (await pedir<{ coincidencia: Coincidencia | null }>(urlDeCoincidencia(clave))).coincidencia,

  // Las tres van por POST con la selección en el cuerpo, y no por DELETE con
  // los códigos en la dirección, por lo mismo que en el historial: la
  // selección puede ser «todos los que cumplen este filtro», que no cabe en
  // una URL ni conviene que quede escrita en el registro de accesos de nadie.
  eliminar: (seleccion) => enBloque('eliminar', seleccion),
  restaurar: (seleccion) => enBloque('restaurar', seleccion),
  purgar: (seleccion) => enBloque('purgar', seleccion),

  revisarImportacion: (filas) =>
    pedir<RevisionImportacion>(`${BASE}/clientes/importar/revisar`, {
      method: 'POST',
      body: JSON.stringify({ filas }),
    }),

  confirmarImportacion: (filas) =>
    pedir<ResultadoImportacion>(`${BASE}/clientes/importar/confirmar`, {
      method: 'POST',
      body: JSON.stringify({ filas }),
    }),

  actividad: (codigo) =>
    pedir<ActividadCliente>(`${BASE}/clientes/${encodeURIComponent(codigo)}/actividad`),
};

function enBloque(
  accion: 'eliminar' | 'restaurar' | 'purgar',
  seleccion: SeleccionClientes,
): Promise<CuantosClientes> {
  return pedir<CuantosClientes>(`${BASE}/clientes/${accion}`, {
    method: 'POST',
    body: JSON.stringify(seleccion),
  });
}

export const clientes: AlmacenClientes = ES_DEMOSTRACION ? clientesLocales : clientesHttp;

export type { AlmacenClientes } from './contrato';
export type { Cliente, DatosCliente } from '../../../compartido/clientes';
