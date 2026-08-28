/**
 * El panel de clientes: quiénes son, cómo se les escribe y quién los atiende.
 *
 * Es la pieza que faltaba para que el hub deje de ser dos herramientas sueltas.
 * Hasta ahora los datos de un cliente vivían dentro de cada cotización, sin
 * ficha propia: borrar la última cotización se llevaba por delante lo único que
 * quedaba de él.
 *
 * Se parece mucho a la pantalla del historial —buscador, filtros, casillas,
 * papelera, páginas— y es a propósito: es la misma forma de trabajar sobre otra
 * cosa, y quien ya sabe usar una sabe usar la otra sin que nadie se lo explique.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  ESTADOS_CLIENTE,
  NOMBRE_ESTADO_CLIENTE,
  type Cliente,
  type EstadoCliente,
  type FiltroClientes,
  type PaginaClientes,
  type SeleccionClientes,
} from '../../../compartido/clientes';
import { FalloApi } from '../api/fallo';
import { ASESORES } from '../datos/empresa';
import { CampoSelect, CampoTexto, Insignia } from '../ui/componentes';
import { clientes } from './almacen';
import { csvDeClientes, descargarCsv, nombreArchivo, todosLosQueCumplen } from './exportar';
import { FichaCliente } from './FichaCliente';

interface Props {
  alVolver: () => void;
  /** Qué ficha está abierta, según la dirección. Vacío es el listado. */
  codigoAbierto?: string;
  /** Cambia la dirección: `undefined` vuelve al listado, `'nuevo'` da de alta. */
  alAbrir: (codigo: string | undefined) => void;
}

const FILTRO_VACIO: FiltroClientes = { pagina: 1 };

export function PantallaClientes({ alVolver, codigoAbierto, alAbrir }: Props) {
  const [filtro, setFiltro] = useState<FiltroClientes>(FILTRO_VACIO);
  const [pagina, setPagina] = useState<PaginaClientes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [todosFiltrados, setTodosFiltrados] = useState(false);

  /** La ficha abierta, ya cargada. `null` mientras se pide. */
  const [abierto, setAbierto] = useState<Cliente | null>(null);

  const enPapelera = Boolean(filtro.papelera);
  const esFichaNueva = codigoAbierto === 'nuevo';

  const limpiarSeleccion = useCallback(() => {
    setMarcados(new Set());
    setTodosFiltrados(false);
  }, []);

  const cargar = useCallback(async (cual: FiltroClientes) => {
    setCargando(true);
    setFallo('');
    try {
      setPagina(await clientes.listar(cual));
    } catch (error) {
      setFallo(
        error instanceof FalloApi ? error.mensaje : 'No se pudo cargar la lista de clientes.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (codigoAbierto) return;
    void cargar(filtro);
  }, [cargar, filtro, codigoAbierto]);

  // La ficha se pide por su código y no se saca de la página cargada: se puede
  // llegar aquí por un enlace pegado, con el listado todavía sin cargar.
  useEffect(() => {
    if (!codigoAbierto || esFichaNueva) {
      setAbierto(null);
      return;
    }

    let vigente = true;
    setFallo('');
    clientes
      .abrir(codigoAbierto)
      .then((cliente) => {
        if (vigente) setAbierto(cliente);
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        setFallo(error instanceof FalloApi ? error.mensaje : 'No se pudo abrir la ficha.');
        alAbrir(undefined);
      });

    return () => {
      vigente = false;
    };
  }, [codigoAbierto, esFichaNueva, alAbrir]);

  const anunciar = (mensaje: string) => {
    setAviso(mensaje);
    setTimeout(() => setAviso(''), 4000);
  };

  const cambiar = (cambios: Partial<FiltroClientes>) => {
    limpiarSeleccion();
    setFiltro((actual) => ({ ...actual, ...cambios, pagina: 1 }));
  };

  const seleccion = (): SeleccionClientes =>
    todosFiltrados ? { todos: true, filtro } : { codigos: [...marcados] };

  const enBloque = async (
    accion: 'eliminar' | 'restaurar' | 'purgar',
    confirmacion: string,
    hecho: (cuantos: number) => string,
  ) => {
    if (trabajando || !confirm(confirmacion)) return;
    setTrabajando(true);
    try {
      const { cuantos } = await clientes[accion](seleccion());
      limpiarSeleccion();
      anunciar(hecho(cuantos));
      await cargar(filtro);
    } catch (error) {
      setFallo(error instanceof FalloApi ? error.mensaje : 'La operación falló. Vuelva a intentarlo.');
    } finally {
      setTrabajando(false);
    }
  };

  const exportar = async () => {
    if (trabajando) return;
    setTrabajando(true);
    try {
      const todos = await todosLosQueCumplen(clientes, filtro);
      if (todos.length === 0) {
        anunciar('No hay nada que exportar con ese filtro.');
        return;
      }
      descargarCsv(csvDeClientes(todos), nombreArchivo(enPapelera));
      anunciar(`${contar(todos.length)} en el archivo.`);
    } catch (error) {
      setFallo(error instanceof FalloApi ? error.mensaje : 'No se pudo exportar la lista.');
    } finally {
      setTrabajando(false);
    }
  };

  if (codigoAbierto && (esFichaNueva || abierto)) {
    return (
      <FichaCliente
        cliente={esFichaNueva ? null : abierto}
        alVolver={() => alAbrir(undefined)}
        alAbrirOtro={(codigo) => alAbrir(codigo)}
        alGuardar={(cliente) => {
          anunciar(
            esFichaNueva
              ? `${cliente.empresa} quedó registrado como ${cliente.codigo}.`
              : 'Ficha actualizada.',
          );
          alAbrir(undefined);
        }}
      />
    );
  }

  const filas = pagina?.clientes ?? [];
  const hayFiltro = Boolean(filtro.texto || filtro.estado || filtro.asesor);
  const cuantosMarcados = todosFiltrados ? (pagina?.cuantos ?? 0) : marcados.size;

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-neutral-800">
            {enPapelera ? 'Clientes · papelera' : 'Clientes'}
          </h1>
          <p className="text-sm text-neutral-500">
            {enPapelera
              ? 'Fichas retiradas. Sus cotizaciones siguen intactas en el historial.'
              : 'La libreta de la empresa: a quién le vendemos y quién lo atiende.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton-secundario" onClick={alVolver}>
            Volver al cotizador
          </button>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => void exportar()}
            disabled={trabajando}
          >
            Exportar
          </button>
          {!enPapelera ? (
            <button type="button" className="boton-primario" onClick={() => alAbrir('nuevo')}>
              Cliente nuevo
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2" role="group" aria-label="Qué parte de los clientes se ve">
        {[
          { papelera: false, texto: 'Clientes' },
          { papelera: true, texto: 'Papelera' },
        ].map(({ papelera, texto }) => (
          <button
            key={texto}
            type="button"
            aria-pressed={enPapelera === papelera}
            onClick={() => {
              limpiarSeleccion();
              setFiltro((actual) => ({ ...actual, papelera, pagina: 1 }));
            }}
            className={`boton ${
              enPapelera === papelera
                ? 'bg-marca-600 text-white'
                : 'border border-neutral-300 bg-white text-neutral-600'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      <section className="tarjeta p-4" aria-label="Filtros">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <CampoTexto
              etiqueta="Buscar"
              placeholder="Nombre, NIT, correo, ciudad o código"
              type="search"
              value={filtro.texto ?? ''}
              onChange={(e) => cambiar({ texto: e.currentTarget.value })}
            />
          </div>
          <CampoSelect
            etiqueta="Estado"
            value={filtro.estado ?? ''}
            onChange={(e) =>
              cambiar({ estado: (e.currentTarget.value || undefined) as EstadoCliente | undefined })
            }
          >
            <option value="">Todos</option>
            {ESTADOS_CLIENTE.map((estado) => (
              <option key={estado} value={estado}>
                {NOMBRE_ESTADO_CLIENTE[estado]}
              </option>
            ))}
          </CampoSelect>
          <CampoSelect
            etiqueta="Asesora"
            value={filtro.asesor ?? ''}
            onChange={(e) => cambiar({ asesor: e.currentTarget.value || undefined })}
          >
            <option value="">Todas</option>
            {ASESORES.map((asesor) => (
              <option key={asesor} value={asesor}>
                {asesor}
              </option>
            ))}
          </CampoSelect>
        </div>

        {hayFiltro ? (
          <button
            type="button"
            className="mt-3 py-2 text-sm font-bold text-marca-700 underline"
            onClick={() => cambiar({ texto: undefined, estado: undefined, asesor: undefined })}
          >
            Quitar los filtros
          </button>
        ) : null}
      </section>

      {fallo ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          {fallo}
        </p>
      ) : null}

      {aviso ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {aviso}
        </p>
      ) : null}

      {pagina ? (
        <p className="text-sm text-neutral-600">
          <strong className="font-bold text-neutral-800">{pagina.cuantos}</strong>{' '}
          {pagina.cuantos === 1 ? 'cliente' : 'clientes'}
          {enPapelera ? ' en la papelera' : ''}.
        </p>
      ) : null}

      {cuantosMarcados > 0 ? (
        <section
          aria-label="Clientes seleccionados"
          className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-marca-200 bg-marca-50 p-3 shadow-sm"
        >
          <p className="mr-auto text-sm font-bold text-marca-800">
            {contar(cuantosMarcados)} {cuantosMarcados === 1 ? 'seleccionado' : 'seleccionados'}
          </p>
          {enPapelera ? (
            <>
              <button
                type="button"
                className="boton-secundario"
                disabled={trabajando}
                onClick={() =>
                  void enBloque(
                    'restaurar',
                    `¿Devolver ${contar(cuantosMarcados)} a la lista?`,
                    (cuantos) => `${contar(cuantos)} de vuelta en la lista.`,
                  )
                }
              >
                Restaurar
              </button>
              <button
                type="button"
                className="boton-peligro"
                disabled={trabajando}
                onClick={() =>
                  void enBloque(
                    'purgar',
                    `Se van a borrar ${contar(cuantosMarcados)} para siempre. Sus cotizaciones no se tocan. ¿Seguro?`,
                    (cuantos) => `${contar(cuantos)} borrados definitivamente.`,
                  )
                }
              >
                Eliminar definitivamente
              </button>
            </>
          ) : (
            <button
              type="button"
              className="boton-peligro"
              disabled={trabajando}
              onClick={() =>
                void enBloque(
                  'eliminar',
                  `¿Mandar ${contar(cuantosMarcados)} a la papelera? Sus cotizaciones se quedan en el historial.`,
                  (cuantos) => `${contar(cuantos)} en la papelera. Se pueden restaurar.`,
                )
              }
            >
              Eliminar
            </button>
          )}
          <button type="button" className="py-2 text-sm font-bold text-marca-700 underline" onClick={limpiarSeleccion}>
            Quitar la selección
          </button>
        </section>
      ) : null}

      <section className="tarjeta overflow-hidden" aria-busy={cargando}>
        {cargando && !pagina ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando los clientes…</p>
        ) : filas.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">
            {enPapelera
              ? 'La papelera está vacía.'
              : hayFiltro
                ? 'Ningún cliente cumple ese filtro.'
                : 'Todavía no hay clientes. Créelos aquí o déjelos entrar solos al cotizar.'}
          </p>
        ) : (
          <>
            {todosFiltrados || (pagina && marcados.size === filas.length && pagina.cuantos > filas.length) ? (
              <p className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-marca-50 px-4 py-2 text-sm text-marca-800">
                {todosFiltrados ? (
                  <>
                    Seleccionados los <strong>{pagina?.cuantos}</strong> que cumplen el filtro.
                    <button type="button" className="font-bold underline" onClick={limpiarSeleccion}>
                      Quitar la selección
                    </button>
                  </>
                ) : (
                  <>
                    Seleccionados los {filas.length} de esta página.
                    <button
                      type="button"
                      className="font-bold underline"
                      onClick={() => setTodosFiltrados(true)}
                    >
                      Seleccionar los {pagina?.cuantos} que cumplen el filtro
                    </button>
                  </>
                )}
              </p>
            ) : null}

            <Tabla
              clientes={filas}
              enPapelera={enPapelera}
              marcados={marcados}
              todosFiltrados={todosFiltrados}
              alAbrir={(codigo) => alAbrir(codigo)}
              alMarcarUno={(codigo, marcado) => {
                if (!marcado) setTodosFiltrados(false);
                setMarcados((actuales) => {
                  const siguiente = new Set(actuales);
                  if (marcado) siguiente.add(codigo);
                  else siguiente.delete(codigo);
                  return siguiente;
                });
              }}
              alMarcarPagina={(marcar) => {
                setTodosFiltrados(false);
                setMarcados((actuales) => {
                  const siguiente = new Set(actuales);
                  for (const fila of filas) {
                    if (marcar) siguiente.add(fila.codigo);
                    else siguiente.delete(fila.codigo);
                  }
                  return siguiente;
                });
              }}
            />
          </>
        )}
      </section>

      {pagina && pagina.cuantos > pagina.porPagina ? (
        <Paginacion
          pagina={pagina}
          alIr={(numero) => {
            limpiarSeleccion();
            setFiltro((actual) => ({ ...actual, pagina: numero }));
          }}
        />
      ) : null}
    </div>
  );
}

/** «un cliente» / «342 clientes», para no armar frases rotas. */
function contar(cuantos: number): string {
  return cuantos === 1 ? '1 cliente' : `${cuantos} clientes`;
}

function Tabla({
  clientes: filas,
  enPapelera,
  marcados,
  todosFiltrados,
  alAbrir,
  alMarcarUno,
  alMarcarPagina,
}: {
  clientes: readonly Cliente[];
  enPapelera: boolean;
  marcados: ReadonlySet<string>;
  todosFiltrados: boolean;
  alAbrir: (codigo: string) => void;
  alMarcarUno: (codigo: string, marcado: boolean) => void;
  alMarcarPagina: (marcar: boolean) => void;
}) {
  const todasMarcadas = filas.length > 0 && filas.every((f) => todosFiltrados || marcados.has(f.codigo));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[54rem] text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500 uppercase">
          <tr>
            <th scope="col" className="w-10 px-3 py-2">
              <input
                type="checkbox"
                className="casilla"
                checked={todasMarcadas}
                aria-label="Seleccionar los de esta página"
                onChange={(e) => alMarcarPagina(e.currentTarget.checked)}
              />
            </th>
            <th scope="col" className="px-3 py-2 text-left font-bold">Cliente</th>
            <th scope="col" className="px-3 py-2 text-left font-bold">NIT / cédula</th>
            <th scope="col" className="px-3 py-2 text-left font-bold">Contacto</th>
            <th scope="col" className="px-3 py-2 text-left font-bold">Ciudad</th>
            <th scope="col" className="px-3 py-2 text-left font-bold">Asesora</th>
            <th scope="col" className="px-3 py-2 text-left font-bold">
              {enPapelera ? 'Retirado' : 'Estado'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {filas.map((cliente) => {
            const marcado = todosFiltrados || marcados.has(cliente.codigo);
            return (
              <tr key={cliente.codigo} className={marcado ? 'bg-marca-50/60' : 'hover:bg-neutral-50'}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="casilla"
                    checked={marcado}
                    aria-label={`Seleccionar ${cliente.empresa}`}
                    onChange={(e) => alMarcarUno(cliente.codigo, e.currentTarget.checked)}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-left font-bold text-marca-700 underline-offset-2 hover:underline"
                    onClick={() => alAbrir(cliente.codigo)}
                  >
                    {cliente.empresa || '(sin nombre)'}
                  </button>
                  <span className="block font-mono text-xs text-neutral-400">{cliente.codigo}</span>
                </td>
                <td className="px-3 py-2 text-neutral-600">{cliente.nit || '—'}</td>
                <td className="px-3 py-2 text-neutral-600">
                  {cliente.contacto || '—'}
                  {cliente.correo ? (
                    <span className="block text-xs text-neutral-400">{cliente.correo}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-neutral-600">{cliente.ciudad || '—'}</td>
                <td className="px-3 py-2 text-neutral-600">{cliente.asesor || 'Sin asignar'}</td>
                <td className="px-3 py-2">
                  {enPapelera ? (
                    <span className="text-xs text-neutral-500">
                      {cliente.eliminadoEn
                        ? new Date(cliente.eliminadoEn).toLocaleDateString('es-CO')
                        : '—'}
                      {cliente.eliminadoPor ? (
                        <span className="block text-neutral-400">{cliente.eliminadoPor}</span>
                      ) : null}
                    </span>
                  ) : (
                    <Insignia tono={cliente.estado === 'activo' ? 'exito' : 'neutro'}>
                      {NOMBRE_ESTADO_CLIENTE[cliente.estado]}
                    </Insignia>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Paginacion({ pagina, alIr }: { pagina: PaginaClientes; alIr: (numero: number) => void }) {
  const ultima = Math.max(1, Math.ceil(pagina.cuantos / pagina.porPagina));

  return (
    <nav className="flex items-center justify-center gap-3" aria-label="Páginas">
      <button
        type="button"
        className="boton-secundario"
        disabled={pagina.pagina <= 1}
        onClick={() => alIr(pagina.pagina - 1)}
      >
        Anterior
      </button>
      <p className="text-sm text-neutral-600">
        Página {pagina.pagina} de {ultima}
      </p>
      <button
        type="button"
        className="boton-secundario"
        disabled={pagina.pagina >= ultima}
        onClick={() => alIr(pagina.pagina + 1)}
      >
        Siguiente
      </button>
    </nav>
  );
}
