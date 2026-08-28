/**
 * El historial de cotizaciones emitidas.
 *
 * La pantalla que pidieron las dos socias: qué se ha cotizado, a quién, por
 * cuánto y en qué quedó. Lista lo que hay en el servidor —no lo que tenga
 * este navegador—, así que las dos ven lo mismo desde donde sea.
 *
 * Cuatro cosas se pueden hacer con una cotización guardada: volver a sacar su
 * PDF (idéntico al que recibió el cliente, porque sale del mismo documento),
 * reabrirla para hacer una nueva versión, marcar en qué acabó, y quitarla de
 * en medio.
 *
 * Quitarla de en medio son dos pasos y no uno —papelera primero, borrado de
 * verdad después— y se pueden hacer en bloque. Con mil cotizaciones guardadas,
 * un botón de borrar por fila obligaría a mil confirmaciones para limpiar las
 * pruebas del primer año, y eso no es una forma de borrar: por eso hay
 * casillas, «seleccionar las que cumplen el filtro» y una sola confirmación
 * que dice cuántas se lleva.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ESTADOS,
  NOMBRE_ESTADO,
  type Estado,
  type FiltroHistorial,
  type PaginaHistorial,
  type ResumenCotizacion,
  type Seleccion,
} from '../../../compartido/historial';
import { dinero, fechaCorta, pesos, unidades as formatoUnidades } from '../dominio/formato';
import type { Cotizacion } from '../dominio/tipos';
import { almacen, FalloApi } from './almacen';
import { CampoSelect, CampoTexto } from '../ui/componentes';
import { enviarCotizacion } from '../envios/almacen';
import { VentanaEnvio, type DatosEnvio } from '../envios/VentanaEnvio';
import { descargarPdf, pdfEnBase64 } from '../ui/acciones';

interface Props {
  /** Lleva una cotización guardada a la pantalla del cotizador. */
  alReabrir: (cotizacion: Cotizacion) => void;
  alVolver: () => void;
}

const FILTRO_VACIO: FiltroHistorial = { pagina: 1 };

export function PantallaHistorial({ alReabrir, alVolver }: Props) {
  const [filtro, setFiltro] = useState<FiltroHistorial>(FILTRO_VACIO);
  const [pagina, setPagina] = useState<PaginaHistorial | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupada, setOcupada] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  /**
   * Los números marcados a mano, y aparte si la marca es «todas las que
   * cumplen el filtro».
   *
   * Son dos cosas distintas y por eso se guardan por separado: lo primero es
   * una lista de números que viaja tal cual; lo segundo es una condición que
   * resuelve el servidor y que puede alcanzar cotizaciones que esta pantalla
   * ni siquiera ha cargado.
   */
  /**
   * La cotización que se está reenviando por correo.
   *
   * Se guarda el documento entero y no sólo el número porque la ventana enseña
   * sus cifras: es la misma cotización que recibió el cliente, regenerada del
   * documento guardado, no una reconstrucción.
   */
  const [reenviando, setReenviando] = useState<Cotizacion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falloEnvio, setFalloEnvio] = useState('');

  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [todasFiltradas, setTodasFiltradas] = useState(false);

  const enPapelera = Boolean(filtro.papelera);

  const limpiarSeleccion = useCallback(() => {
    setMarcadas(new Set());
    setTodasFiltradas(false);
  }, []);

  const cargar = useCallback(async (cual: FiltroHistorial) => {
    setCargando(true);
    setFallo('');
    try {
      setPagina(await almacen.listar(cual));
    } catch (error) {
      setFallo(
        error instanceof FalloApi
          ? error.mensaje
          : 'No se pudo leer el historial. Vuelva a intentarlo.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  // El texto se consulta con retraso: escribir «Coordinadora» son doce letras,
  // y sin esto son doce consultas de las que sólo importa la última.
  useEffect(() => {
    const espera = setTimeout(() => void cargar(filtro), filtro.texto ? 300 : 0);
    return () => clearTimeout(espera);
  }, [filtro, cargar]);

  /**
   * Vuelve a mandar una cotización ya emitida.
   *
   * No pasa por el registro ni por la conciliación de la ficha: la cotización
   * ya existe, ya tiene número y ya está enlazada. Reenviar es sólo generar su
   * PDF —el mismo, del mismo documento— y mandarlo.
   */
  const reenviar = async (documento: Cotizacion, datos: DatosEnvio) => {
    if (enviando) return;
    setEnviando(true);
    setFalloEnvio('');

    try {
      const { base64, nombre } = await pdfEnBase64(documento);
      await enviarCotizacion(documento.numero, { ...datos, pdfBase64: base64, nombrePdf: nombre });
      setReenviando(null);
      setAviso(`Cotización ${documento.numero} enviada.`);
    } catch (error) {
      console.error(error);
      setFalloEnvio(
        error instanceof FalloApi ? error.mensaje : 'No se pudo enviar. Vuelva a intentarlo.',
      );
    } finally {
      setEnviando(false);
    }
  };

  const cambiar = (cambios: Partial<FiltroHistorial>) => {
    // La selección no sobrevive a un cambio de filtro. Si sobreviviera,
    // «eliminar las 342 que cumplen el filtro» se aplicaría a un filtro
    // distinto del que la persona tenía delante al marcarlas.
    limpiarSeleccion();
    // Y cualquier cambio vuelve a la primera página: quedarse en la siete de
    // un listado que ahora tiene dos muestra una tabla vacía que parece un
    // error.
    setFiltro((actual) => ({ ...actual, ...cambios, pagina: 1 }));
  };

  const irAPagina = (numero: number) => {
    // Cambiar de página conserva lo marcado a mano —seleccionar en dos
    // páginas y borrar de una vez es legítimo— pero no la marca de «todas»,
    // que se decide contra un filtro concreto y no contra un recorrido.
    setFiltro((actual) => ({ ...actual, pagina: numero }));
  };

  const conPdf = async (resumen: ResumenCotizacion, hacer: (c: Cotizacion) => Promise<void>) => {
    setOcupada(resumen.numero);
    setFallo('');
    try {
      const guardada = await almacen.abrir(resumen.numero);
      await hacer(guardada.documento);
    } catch (error) {
      setFallo(
        error instanceof FalloApi
          ? error.mensaje
          : `No se pudo abrir la cotización ${resumen.numero}.`,
      );
    } finally {
      setOcupada('');
    }
  };

  const marcarEstado = async (resumen: ResumenCotizacion, estado: Estado) => {
    setOcupada(resumen.numero);
    setFallo('');
    try {
      await almacen.marcar(resumen.numero, estado, resumen.estadoNota);
      await cargar(filtro);
    } catch (error) {
      setFallo(
        error instanceof FalloApi ? error.mensaje : 'No se pudo cambiar el estado.',
      );
    } finally {
      setOcupada('');
    }
  };

  const filas = pagina?.cotizaciones ?? [];
  const cuantasSeleccionadas = todasFiltradas ? (pagina?.cuantas ?? 0) : marcadas.size;

  /** Qué manda la operación en bloque: la lista de números o la condición. */
  const seleccionActual = (): Seleccion =>
    todasFiltradas ? { todas: true, filtro } : { numeros: [...marcadas] };

  const enBloque = async (
    accion: 'eliminar' | 'restaurar' | 'purgar',
    confirmacion: string,
    hecho: (cuantas: number) => string,
  ) => {
    if (trabajando || cuantasSeleccionadas === 0) return;
    if (!confirm(confirmacion)) return;

    setTrabajando(true);
    setFallo('');
    setAviso('');
    try {
      const { cuantas } = await almacen[accion](seleccionActual());
      limpiarSeleccion();
      setAviso(hecho(cuantas));
      await cargar(filtro);
    } catch (error) {
      setFallo(
        error instanceof FalloApi ? error.mensaje : 'La operación falló. Vuelva a intentarlo.',
      );
    } finally {
      setTrabajando(false);
    }
  };

  const acciones = {
    eliminar: () =>
      enBloque(
        'eliminar',
        `Se van a mandar a la papelera ${contar(cuantasSeleccionadas)}.\n\n` +
          'No se borran: dejan de salir en el historial y se pueden restaurar desde la papelera. ' +
          'Su número sigue ocupado.',
        (cuantas) => `${contar(cuantas)} en la papelera.`,
      ),
    restaurar: () =>
      enBloque(
        'restaurar',
        `Se van a restaurar ${contar(cuantasSeleccionadas)} al historial.`,
        (cuantas) => `${contar(cuantas)} de vuelta en el historial.`,
      ),
    purgar: () =>
      enBloque(
        'purgar',
        `Se van a BORRAR PARA SIEMPRE ${contar(cuantasSeleccionadas)}.\n\n` +
          'Con ellas se va su documento, y con el documento la posibilidad de volver a sacar el ' +
          'PDF que recibió el cliente. Esto no se puede deshacer.',
        (cuantas) => `${contar(cuantas)} borradas para siempre.`,
      ),
  };

  const hayFiltro = useMemo(
    () => Boolean(filtro.texto || filtro.estado || filtro.desde || filtro.hasta),
    [filtro],
  );

  return (
    <div className="mx-auto w-full max-w-[90rem] space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold text-neutral-800">
            {enPapelera ? 'Papelera del historial' : 'Historial de cotizaciones'}
          </h1>
          <p className="text-sm text-neutral-500">
            {enPapelera
              ? 'Lo retirado del historial. Sigue aquí hasta que alguien lo borre para siempre.'
              : 'Todo lo emitido, por cualquiera del equipo.'}
          </p>
        </div>
        <button type="button" className="boton-secundario" onClick={alVolver}>
          Volver al cotizador
        </button>
      </div>

      <Pestanas
        enPapelera={enPapelera}
        alCambiar={(papelera) => {
          limpiarSeleccion();
          setFiltro((actual) => ({ ...actual, papelera, pagina: 1 }));
        }}
      />

      <section className="tarjeta p-4" aria-label="Filtros">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <CampoTexto
              etiqueta="Buscar"
              placeholder="Número, empresa, NIT o contacto"
              type="search"
              value={filtro.texto ?? ''}
              onChange={(e) => cambiar({ texto: e.currentTarget.value })}
            />
          </div>
          <CampoSelect
            etiqueta="Estado"
            value={filtro.estado ?? ''}
            onChange={(e) =>
              cambiar({ estado: (e.currentTarget.value || undefined) as Estado | undefined })
            }
          >
            <option value="">Todos</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {NOMBRE_ESTADO[estado]}
              </option>
            ))}
          </CampoSelect>
          <CampoTexto
            etiqueta="Desde"
            type="date"
            value={filtro.desde ?? ''}
            onChange={(e) => cambiar({ desde: e.currentTarget.value || undefined })}
          />
          <CampoTexto
            etiqueta="Hasta"
            type="date"
            value={filtro.hasta ?? ''}
            onChange={(e) => cambiar({ hasta: e.currentTarget.value || undefined })}
          />
        </div>

        {hayFiltro ? (
          <button
            type="button"
            className="mt-3 py-2 text-sm font-bold text-marca-700 underline"
            onClick={() => cambiar({ texto: undefined, estado: undefined, desde: undefined, hasta: undefined })}
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

      {pagina ? <Resumen pagina={pagina} enPapelera={enPapelera} /> : null}

      {cuantasSeleccionadas > 0 ? (
        <BarraSeleccion
          cuantas={cuantasSeleccionadas}
          enPapelera={enPapelera}
          trabajando={trabajando}
          acciones={acciones}
          alQuitar={limpiarSeleccion}
        />
      ) : null}

      <section className="tarjeta overflow-hidden" aria-busy={cargando}>
        {cargando && !pagina ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando el historial…</p>
        ) : filas.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">
            {enPapelera
              ? hayFiltro
                ? 'Nada en la papelera cumple ese filtro.'
                : 'La papelera está vacía.'
              : hayFiltro
                ? 'Ninguna cotización cumple ese filtro.'
                : 'Todavía no se ha emitido ninguna cotización.'}
          </p>
        ) : (
          <>
            {pagina ? (
              <AvisoAlcance
                pagina={pagina}
                filas={filas}
                marcadas={marcadas}
                todasFiltradas={todasFiltradas}
                alSeleccionarTodas={() => setTodasFiltradas(true)}
                alQuitar={limpiarSeleccion}
              />
            ) : null}
            <Tabla
              cotizaciones={filas}
              ocupada={ocupada}
              enPapelera={enPapelera}
              marcadas={marcadas}
              todasFiltradas={todasFiltradas}
              alMarcarUna={(numero, marcada) => {
                // Quitar una casilla deshace «todas las que cumplen el
                // filtro»: dejarla puesta significaría llevarse justo la que
                // se acaba de desmarcar.
                if (!marcada) setTodasFiltradas(false);
                setMarcadas((actuales) => {
                  const siguiente = new Set(actuales);
                  if (marcada) siguiente.add(numero);
                  else siguiente.delete(numero);
                  return siguiente;
                });
              }}
              alMarcarPagina={(marcar) => {
                setTodasFiltradas(false);
                setMarcadas((actuales) => {
                  const siguiente = new Set(actuales);
                  for (const fila of filas) {
                    if (marcar) siguiente.add(fila.numero);
                    else siguiente.delete(fila.numero);
                  }
                  return siguiente;
                });
              }}
              alPdf={(r) => void conPdf(r, (c) => descargarPdf(c))}
              alEnviar={(r) =>
                void conPdf(r, async (c) => {
                  setFalloEnvio('');
                  setReenviando(c);
                })
              }
              alReabrir={(r) => void conPdf(r, async (c) => alReabrir(c))}
              alMarcarEstado={(r, estado) => void marcarEstado(r, estado)}
            />
          </>
        )}
      </section>

      {pagina && pagina.cuantas > pagina.porPagina ? (
        <Paginacion pagina={pagina} alIr={irAPagina} />
      ) : null}

      {reenviando ? (
        <VentanaEnvio
          cotizacion={reenviando}
          sinNumero={false}
          enviando={enviando}
          fallo={falloEnvio}
          alEnviar={(datos) => void reenviar(reenviando, datos)}
          alCerrar={() => setReenviando(null)}
        />
      ) : null}
    </div>
  );
}

/** «una cotización» / «342 cotizaciones», para no armar frases rotas. */
function contar(cuantas: number): string {
  return cuantas === 1 ? '1 cotización' : `${cuantas} cotizaciones`;
}

/**
 * Historial y papelera, como dos pestañas.
 *
 * Son dos vistas del mismo listado con el mismo filtro, no dos pantallas: lo
 * que cambia es si se enseña lo retirado o lo que está a la vista.
 */
function Pestanas({
  enPapelera,
  alCambiar,
}: {
  enPapelera: boolean;
  alCambiar: (papelera: boolean) => void;
}) {
  const opciones: { papelera: boolean; texto: string }[] = [
    { papelera: false, texto: 'Historial' },
    { papelera: true, texto: 'Papelera' },
  ];

  return (
    <div className="flex gap-2" role="group" aria-label="Qué parte del historial se ve">
      {opciones.map(({ papelera, texto }) => (
        <button
          key={texto}
          type="button"
          aria-pressed={enPapelera === papelera}
          onClick={() => alCambiar(papelera)}
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
  );
}

/** Cuántas y por cuánto: la cifra que las socias miran primero. */
function Resumen({ pagina, enPapelera }: { pagina: PaginaHistorial; enPapelera: boolean }) {
  // La suma va en pesos siempre. Sumar pesos y dólares en la misma cifra
  // daría un número que no es dinero de ninguna clase, así que lo cotizado en
  // dólares entra convertido a la tasa que cada cotización guardó — y se dice,
  // en cuanto se ve alguna, para que nadie tome la cifra por otra cosa.
  const hayDivisa = pagina.cotizaciones.some((c) => c.moneda !== 'COP');

  return (
    <p className="text-sm text-neutral-600">
      <strong className="font-bold text-neutral-800">{pagina.cuantas}</strong>{' '}
      {pagina.cuantas === 1 ? 'cotización' : 'cotizaciones'}
      {enPapelera ? ' en la papelera' : ''} por un total de{' '}
      <strong className="font-bold text-neutral-800">{pesos(pagina.sumaTotales)}</strong>.
      {hayDivisa ? (
        <span className="block text-xs text-neutral-500">
          Lo cotizado en dólares va convertido a la tasa que llevaba cada cotización.
        </span>
      ) : null}
    </p>
  );
}

/**
 * La franja que aparece al marcar algo: cuántas van y qué se puede hacer.
 *
 * Va pegada arriba (`sticky`) porque la selección puede pasar de una página a
 * otra, y el botón que la ejecuta no puede quedarse fuera de la vista mientras
 * se recorre la tabla.
 */
function BarraSeleccion({
  cuantas,
  enPapelera,
  trabajando,
  acciones,
  alQuitar,
}: {
  cuantas: number;
  enPapelera: boolean;
  trabajando: boolean;
  acciones: { eliminar: () => void; restaurar: () => void; purgar: () => void };
  alQuitar: () => void;
}) {
  return (
    <section
      aria-label="Cotizaciones seleccionadas"
      className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-marca-200 bg-marca-50 p-3 shadow-sm"
    >
      <p className="mr-auto text-sm font-bold text-marca-800">
        {contar(cuantas)} seleccionada{cuantas === 1 ? '' : 's'}
      </p>

      <button type="button" className="boton-secundario px-3 text-xs" onClick={alQuitar}>
        Quitar la selección
      </button>

      {enPapelera ? (
        <>
          <button
            type="button"
            className="boton-secundario px-3 text-xs"
            onClick={acciones.restaurar}
            disabled={trabajando}
          >
            Restaurar
          </button>
          <button
            type="button"
            className="boton-peligro px-3 text-xs"
            onClick={acciones.purgar}
            disabled={trabajando}
          >
            {trabajando ? 'Borrando…' : 'Eliminar definitivamente'}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="boton-peligro px-3 text-xs"
          onClick={acciones.eliminar}
          disabled={trabajando}
        >
          {trabajando ? 'Eliminando…' : 'Eliminar'}
        </button>
      )}
    </section>
  );
}

/**
 * El puente entre «esta página» y «todas las que cumplen el filtro».
 *
 * Sin esto, marcar la casilla de la cabecera con mil cotizaciones filtradas
 * seleccionaría veinticinco y parecería haberlas seleccionado todas — que es
 * exactamente la clase de malentendido que no se puede permitir delante de un
 * botón de borrar.
 */
function AvisoAlcance({
  pagina,
  filas,
  marcadas,
  todasFiltradas,
  alSeleccionarTodas,
  alQuitar,
}: {
  pagina: PaginaHistorial;
  filas: ResumenCotizacion[];
  marcadas: ReadonlySet<string>;
  todasFiltradas: boolean;
  alSeleccionarTodas: () => void;
  alQuitar: () => void;
}) {
  const paginaEntera = filas.length > 0 && filas.every((fila) => marcadas.has(fila.numero));
  const hayMas = pagina.cuantas > filas.length;

  if (!paginaEntera || !hayMas) return null;

  return (
    <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-900">
      {todasFiltradas ? (
        <>
          Están seleccionadas las <strong>{pagina.cuantas}</strong> cotizaciones que cumplen el
          filtro.{' '}
          <button type="button" className="font-bold underline" onClick={alQuitar}>
            Quitar la selección
          </button>
        </>
      ) : (
        <>
          Están seleccionadas las <strong>{filas.length}</strong> de esta página.{' '}
          <button type="button" className="font-bold underline" onClick={alSeleccionarTodas}>
            Seleccionar las {pagina.cuantas} que cumplen el filtro
          </button>
        </>
      )}
    </p>
  );
}

function Tabla({
  cotizaciones,
  ocupada,
  enPapelera,
  marcadas,
  todasFiltradas,
  alMarcarUna,
  alMarcarPagina,
  alPdf,
  alEnviar,
  alReabrir,
  alMarcarEstado,
}: {
  cotizaciones: ResumenCotizacion[];
  ocupada: string;
  enPapelera: boolean;
  marcadas: ReadonlySet<string>;
  todasFiltradas: boolean;
  alMarcarUna: (numero: string, marcada: boolean) => void;
  alMarcarPagina: (marcar: boolean) => void;
  alPdf: (resumen: ResumenCotizacion) => void;
  alEnviar: (resumen: ResumenCotizacion) => void;
  alReabrir: (resumen: ResumenCotizacion) => void;
  alMarcarEstado: (resumen: ResumenCotizacion, estado: Estado) => void;
}) {
  const paginaEntera =
    cotizaciones.length > 0 && cotizaciones.every((fila) => marcadas.has(fila.numero));

  return (
    // La tabla se desborda a lo ancho en móvil antes que encogerse hasta ser
    // ilegible: el scroll horizontal es del contenedor, no de la página.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[58rem] text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs tracking-wide text-neutral-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="casilla"
                  checked={paginaEntera}
                  onChange={(e) => alMarcarPagina(e.currentTarget.checked)}
                />
                <span className="sr-only">Seleccionar todas las de esta página</span>
              </label>
            </th>
            <th scope="col" className="px-4 py-3 font-bold">Número</th>
            <th scope="col" className="px-4 py-3 font-bold">Cliente</th>
            <th scope="col" className="px-4 py-3 font-bold">Emitida</th>
            <th scope="col" className="px-4 py-3 text-right font-bold">Total</th>
            <th scope="col" className="px-4 py-3 font-bold">Estado</th>
            <th scope="col" className="px-4 py-3 font-bold">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {cotizaciones.map((resumen) => (
            <Fila
              key={resumen.numero}
              resumen={resumen}
              ocupada={ocupada === resumen.numero}
              enPapelera={enPapelera}
              marcada={todasFiltradas || marcadas.has(resumen.numero)}
              alMarcar={(marcada) => alMarcarUna(resumen.numero, marcada)}
              alPdf={() => alPdf(resumen)}
              alEnviar={() => alEnviar(resumen)}
              alReabrir={() => alReabrir(resumen)}
              alMarcarEstado={(estado) => alMarcarEstado(resumen, estado)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fila({
  resumen,
  ocupada,
  enPapelera,
  marcada,
  alMarcar,
  alPdf,
  alEnviar,
  alReabrir,
  alMarcarEstado,
}: {
  resumen: ResumenCotizacion;
  ocupada: boolean;
  enPapelera: boolean;
  marcada: boolean;
  alMarcar: (marcada: boolean) => void;
  alPdf: () => void;
  alEnviar: () => void;
  alReabrir: () => void;
  alMarcarEstado: (estado: Estado) => void;
}) {
  return (
    <tr className={ocupada ? 'opacity-50' : marcada ? 'bg-marca-50/60' : undefined}>
      <td className="px-4 py-3">
        <label className="flex items-center">
          <input
            type="checkbox"
            className="casilla"
            checked={marcada}
            onChange={(e) => alMarcar(e.currentTarget.checked)}
          />
          <span className="sr-only">Seleccionar la cotización {resumen.numero}</span>
        </label>
      </td>

      <td className="px-4 py-3 font-bold whitespace-nowrap text-neutral-800">
        {resumen.numero}
        <span className="block text-xs font-normal text-neutral-400">
          {formatoUnidades(resumen.unidades)} unidades
        </span>
      </td>

      <td className="max-w-[18rem] px-4 py-3">
        <span className="block truncate text-neutral-800">{resumen.cliente || '—'}</span>
        {resumen.contacto ? (
          <span className="block truncate text-xs text-neutral-500">{resumen.contacto}</span>
        ) : null}
      </td>

      <td className="px-4 py-3 whitespace-nowrap text-neutral-600">
        {fechaCorta(resumen.emitidaEn.slice(0, 10))}
        {/* Quién la emitió importa cuando hay que preguntarle algo al que la
            hizo, y con dos socias y varios asesores deja de ser obvio. */}
        <span className="block truncate text-xs text-neutral-400">
          {resumen.asesor || resumen.autor}
        </span>
      </td>

      <td className="px-4 py-3 text-right whitespace-nowrap">
        {/* La cifra grande es la del documento, en su moneda: es la que el
            cliente tiene delante y por la que va a preguntar. El equivalente
            en pesos va debajo, para poder comparar con el resto del listado. */}
        <span className="block font-bold text-neutral-800">
          {dinero(resumen.totalMoneda, resumen.moneda)}
        </span>
        {resumen.moneda !== 'COP' ? (
          <span className="block text-xs font-normal text-neutral-400">
            ≈ {pesos(resumen.total)} · TRM {pesos(resumen.tasa)}
          </span>
        ) : null}
      </td>

      <td className="px-4 py-3">
        {enPapelera ? (
          // En la papelera el estado comercial no se toca: lo que interesa
          // ahí es quién la retiró y cuándo, para poder preguntárselo.
          <>
            <span className="block text-xs font-bold text-neutral-600">
              {NOMBRE_ESTADO[resumen.estado]}
            </span>
            {resumen.eliminadaEn ? (
              <span className="block text-xs text-neutral-400">
                Retirada el {fechaCorta(resumen.eliminadaEn.slice(0, 10))}
                {resumen.eliminadaPor ? ` por ${resumen.eliminadaPor}` : ''}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor={`estado-${resumen.numero}`}>
              Estado de la cotización {resumen.numero}
            </label>
            <select
              id={`estado-${resumen.numero}`}
              className="campo py-1 text-xs"
              value={resumen.estado}
              disabled={ocupada}
              onChange={(e) => alMarcarEstado(e.currentTarget.value as Estado)}
            >
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>
                  {NOMBRE_ESTADO[estado]}
                </option>
              ))}
            </select>
          </>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="boton-secundario px-3 text-xs"
            onClick={alPdf}
            disabled={ocupada}
          >
            PDF
          </button>
          <button
            type="button"
            className="boton-secundario px-3 text-xs"
            onClick={alEnviar}
            disabled={ocupada}
          >
            Enviar
          </button>
          <button
            type="button"
            className="boton-secundario px-3 text-xs"
            onClick={alReabrir}
            disabled={ocupada}
          >
            Reabrir
          </button>
        </div>
      </td>
    </tr>
  );
}

function Paginacion({
  pagina,
  alIr,
}: {
  pagina: PaginaHistorial;
  alIr: (numero: number) => void;
}) {
  const ultima = Math.max(1, Math.ceil(pagina.cuantas / pagina.porPagina));

  return (
    <nav className="flex items-center justify-center gap-4" aria-label="Páginas del historial">
      <button
        type="button"
        className="boton-secundario"
        onClick={() => alIr(pagina.pagina - 1)}
        disabled={pagina.pagina <= 1}
      >
        Anterior
      </button>
      <span className="text-sm text-neutral-600">
        Página {pagina.pagina} de {ultima}
      </span>
      <button
        type="button"
        className="boton-secundario"
        onClick={() => alIr(pagina.pagina + 1)}
        disabled={pagina.pagina >= ultima}
      >
        Siguiente
      </button>
    </nav>
  );
}
