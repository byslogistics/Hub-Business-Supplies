/**
 * El panel de clientes contra el navegador, para la vista previa pública.
 *
 * La vista previa de GitHub Pages no tiene servidor, y sin él la pantalla de
 * clientes no podría ni abrirse. Aquí las fichas viven en `localStorage`: cada
 * quien ve las suyas y los códigos salen marcados como `CLI-DEMO-0001`, para
 * que ninguna captura de esto se confunda con la base de verdad.
 *
 * Cumple el mismo contrato y **aplica las mismas reglas**: la escalera para
 * reconocer a un cliente y el rechazo por NIT repetido son los de
 * `compartido/clientes.ts`, no una imitación. Si la vista previa dejara pasar
 * lo que el servidor rechaza, estaría enseñando algo que no va a ocurrir.
 */

import {
  CLIENTES_POR_PAGINA,
  claveDe,
  clienteVacio,
  claveUtil,
  coincidenciaFuerte,
  documentosParecidos,
  type ClaseCoincidencia,
  type Cliente,
  type Coincidencia,
  type CuantosClientes,
  type DatosCliente,
  type FiltroClientes,
  type PaginaClientes,
  type SeleccionClientes,
} from '../../../compartido/clientes';
import {
  contarAcciones,
  examinarFila,
  fichaRellenada,
  FilasVistas,
  type BuscadorClientes,
  type FilaImportacion,
  type FilaRevisada,
} from '../../../compartido/importacion';
import { correoNormal, sinTildes, soloDigitos } from '../../../compartido/texto';
import { ACTIVIDAD_POR_FICHA, type TotalesCliente } from '../../../compartido/actividad';
import { FalloApi } from '../api/fallo';
import { almacenLocal as historialLocal } from '../historial/almacenLocal';
import type { AlmacenClientes } from './contrato';

const LLAVE = 'bys.clientes.demo';
const LLAVE_CONTADOR = 'bys.clientes.demo.contador';

function leerTodos(): Cliente[] {
  try {
    const crudo = localStorage.getItem(LLAVE);
    const leido: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(leido) ? (leido as Cliente[]) : [];
  } catch {
    // Un `localStorage` estropeado deja la vista previa vacía, que es molesto,
    // en vez de en blanco con un error en consola, que parece rota.
    return [];
  }
}

function guardarTodos(fichas: Cliente[]): void {
  localStorage.setItem(LLAVE, JSON.stringify(fichas));
}

function siguienteCodigo(): string {
  const valor = Number(localStorage.getItem(LLAVE_CONTADOR) ?? '0') + 1;
  localStorage.setItem(LLAVE_CONTADOR, String(valor));
  return `CLI-DEMO-${String(valor).padStart(4, '0')}`;
}

/** El mismo `WHERE` del servidor, escrito como filtro de arreglo. */
function cumple(cliente: Cliente, filtro: FiltroClientes): boolean {
  if (filtro.papelera ? !cliente.eliminadoEn : cliente.eliminadoEn) return false;
  if (filtro.estado && cliente.estado !== filtro.estado) return false;
  if (filtro.asesor && cliente.asesor !== filtro.asesor) return false;

  const texto = filtro.texto?.trim();
  if (!texto) return true;

  const aguja = sinTildes(texto);
  const digitos = soloDigitos(texto);
  const pajar = sinTildes(
    [cliente.codigo, cliente.empresa, cliente.nit, cliente.contacto, cliente.correo, cliente.ciudad].join(' '),
  );

  return pajar.includes(aguja) || (digitos !== '' && soloDigitos(cliente.nit).includes(digitos));
}

/** Busca por la escalera de coincidencia: NIT, luego correo, luego nombre. */
function buscarCoincidencia(
  fichas: Cliente[],
  datos: { nit?: string; correo?: string; empresa?: string },
): Coincidencia | null {
  const clave = claveDe(datos);
  if (!claveUtil(clave)) return null;

  const peldanos: { clase: ClaseCoincidencia; hallar: (c: Cliente) => boolean }[] = [];
  if (clave.nit) {
    peldanos.push({ clase: 'nit', hallar: (c) => soloDigitos(c.nit) === clave.nit });
    peldanos.push({ clase: 'parecido', hallar: (c) => documentosParecidos(c.nit, clave.nit) });
  }
  if (clave.correo) {
    peldanos.push({
      clase: 'correo',
      hallar: (c) =>
        correoNormal(c.correo) === clave.correo ||
        c.correosExtra.some((extra) => correoNormal(extra) === clave.correo),
    });
  }
  if (clave.empresa) {
    peldanos.push({ clase: 'empresa', hallar: (c) => sinTildes(c.empresa) === clave.empresa });
  }

  for (const peldano of peldanos) {
    const cliente = fichas.find(peldano.hallar);
    if (cliente) {
      return { cliente, clase: peldano.clase, fuerte: coincidenciaFuerte(peldano.clase) };
    }
  }

  return null;
}

/** El mismo rechazo del servidor: un NIT no puede ser de dos fichas. */
function comprobarLibre(fichas: Cliente[], datos: DatosCliente, codigoPropio: string | null): void {
  const nit = soloDigitos(datos.nit);
  if (!nit) return;

  const choque = fichas.find((c) => soloDigitos(c.nit) === nit && c.codigo !== codigoPropio);
  if (!choque) return;

  throw new FalloApi(
    'cliente-duplicado',
    `Ese ${datos.tipo === 'persona' ? 'documento' : 'NIT'} ya es de ${choque.empresa || 'otra ficha'} ` +
      `(${choque.codigo}).${choque.eliminadoEn ? ' Está en la papelera: se puede restaurar.' : ''}`,
    choque.codigo,
  );
}

function alcanza(cliente: Cliente, seleccion: SeleccionClientes, papelera: boolean): boolean {
  if (papelera ? !cliente.eliminadoEn : cliente.eliminadoEn) return false;
  return 'todos' in seleccion
    ? cumple(cliente, { ...seleccion.filtro, papelera })
    : seleccion.codigos.includes(cliente.codigo);
}

export const clientesLocales: AlmacenClientes = {
  async listar(filtro) {
    const todos = leerTodos()
      .filter((c) => cumple(c, filtro))
      .sort((a, b) => sinTildes(a.empresa).localeCompare(sinTildes(b.empresa)));

    const pagina = Math.max(1, filtro.pagina ?? 1);
    const desde = (pagina - 1) * CLIENTES_POR_PAGINA;

    return {
      clientes: todos.slice(desde, desde + CLIENTES_POR_PAGINA),
      cuantos: todos.length,
      pagina,
      porPagina: CLIENTES_POR_PAGINA,
    } satisfies PaginaClientes;
  },

  async abrir(codigo) {
    const cliente = leerTodos().find((c) => c.codigo === codigo);
    if (!cliente) throw new FalloApi('no-encontrada', `No hay ningún cliente ${codigo}.`);
    return cliente;
  },

  async crear(datos) {
    if (!datos.empresa.trim()) {
      throw new FalloApi('invalida', 'La ficha necesita al menos el nombre.');
    }

    const fichas = leerTodos();
    comprobarLibre(fichas, datos, null);

    const ahora = new Date().toISOString();
    const cliente: Cliente = {
      ...datos,
      codigo: siguienteCodigo(),
      creadoEn: ahora,
      actualizadoEn: ahora,
      eliminadoEn: null,
      eliminadoPor: null,
    };

    guardarTodos([...fichas, cliente]);
    return cliente;
  },

  async actualizar(codigo, datos) {
    if (!datos.empresa.trim()) {
      throw new FalloApi('invalida', 'La ficha necesita al menos el nombre.');
    }

    const fichas = leerTodos();
    const antes = fichas.find((c) => c.codigo === codigo);
    if (!antes) throw new FalloApi('no-encontrada', `No hay ningún cliente ${codigo}.`);

    comprobarLibre(fichas, datos, codigo);

    const despues: Cliente = { ...antes, ...datos, actualizadoEn: new Date().toISOString() };
    guardarTodos(fichas.map((c) => (c.codigo === codigo ? despues : c)));
    return despues;
  },

  async coincidencia(clave) {
    return buscarCoincidencia(leerTodos(), clave);
  },

  async eliminar(seleccion) {
    const ahora = new Date().toISOString();
    return conTodos(seleccion, false, (cliente) => ({
      ...cliente,
      eliminadoEn: ahora,
      eliminadoPor: 'vista.previa@local',
    }));
  },

  async restaurar(seleccion) {
    return conTodos(seleccion, true, (cliente) => ({
      ...cliente,
      eliminadoEn: null,
      eliminadoPor: null,
    }));
  },

  async purgar(seleccion) {
    const fichas = leerTodos();
    const quedan = fichas.filter((c) => !alcanza(c, seleccion, true));
    guardarTodos(quedan);
    return { cuantos: fichas.length - quedan.length } satisfies CuantosClientes;
  },

  // Las dos mitades de la carga por lote deciden con la misma cabeza que el
  // servidor —`examinarFila`, en el contrato— así que la vista previa no puede
  // enseñar un resultado que en producción sería otro.
  async revisarImportacion(filas) {
    const revisadas = await examinarTodas(filas);
    return { filas: revisadas, resumen: contarAcciones(revisadas) };
  },

  actividad: (codigo) => actividadLocal(codigo),

  async confirmarImportacion(filas) {
    const buscador = buscadorLocal();
    const vistas = new FilasVistas();
    const resultado = { creados: 0, completados: 0, omitidos: 0, errores: 0 };

    for (const fila of filas) {
      const revisada = await examinarFila(fila, buscador, vistas);

      if (revisada.accion === 'error') {
        resultado.errores += 1;
      } else if (revisada.accion === 'omitir' || revisada.accion === 'revisar') {
        resultado.omitidos += 1;
      } else if (revisada.accion === 'crear') {
        await clientesLocales.crear({ ...clienteVacio(), ...fila.datos });
        resultado.creados += 1;
      } else {
        const ficha = await clientesLocales.abrir(revisada.codigo!);
        await clientesLocales.actualizar(ficha.codigo, fichaRellenada(ficha, fila.datos));
        resultado.completados += 1;
      }
    }

    return resultado;
  },
};

/**
 * La actividad de un cliente en la vista previa.
 *
 * Las cotizaciones salen del historial de mentira del mismo navegador; los
 * correos, de ningún sitio: aquí no se manda ninguno, y enseñar una lista
 * inventada haría creer que sí.
 */
async function actividadLocal(codigo: string) {
  const { cotizaciones } = await historialLocal.listar({});
  const suyas = cotizaciones
    .filter((c) => c.clienteCodigo === codigo)
    .slice(0, ACTIVIDAD_POR_FICHA);

  const totales: TotalesCliente = { cotizado: 0, ganado: 0, pendiente: 0, perdido: 0, cuantas: 0 };
  for (const cotizacion of suyas) {
    totales.cotizado += cotizacion.total;
    totales.cuantas += 1;
    if (cotizacion.estado === 'aceptada') totales.ganado += cotizacion.total;
    else if (cotizacion.estado === 'perdida') totales.perdido += cotizacion.total;
    else totales.pendiente += cotizacion.total;
  }

  return { totales, cotizaciones: suyas, envios: [] };
}

/** Cómo busca la cabeza compartida cuando detrás sólo hay `localStorage`. */
function buscadorLocal(): BuscadorClientes {
  return {
    async porCodigo(codigo) {
      return leerTodos().find((c) => c.codigo === codigo) ?? null;
    },
    async coincidencia(clave) {
      return buscarCoincidencia(leerTodos(), clave);
    },
  };
}

async function examinarTodas(filas: readonly FilaImportacion[]): Promise<FilaRevisada[]> {
  const buscador = buscadorLocal();
  const vistas = new FilasVistas();
  const revisadas: FilaRevisada[] = [];

  for (const fila of filas) {
    revisadas.push(await examinarFila(fila, buscador, vistas));
  }

  return revisadas;
}

/** Aplica un cambio a las fichas que alcance la selección, y cuenta cuántas. */
function conTodos(
  seleccion: SeleccionClientes,
  papelera: boolean,
  cambiar: (cliente: Cliente) => Cliente,
): CuantosClientes {
  let cuantos = 0;
  const fichas = leerTodos().map((cliente) => {
    if (!alcanza(cliente, seleccion, papelera)) return cliente;
    cuantos += 1;
    return cambiar(cliente);
  });

  guardarTodos(fichas);
  return { cuantos };
}
