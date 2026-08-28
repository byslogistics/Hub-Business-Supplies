/**
 * Las tres pantallas: armar una cotización, consultar las emitidas y la libreta
 * de clientes.
 *
 * En la de armar, en escritorio son dos columnas a la vez: catálogo a la
 * izquierda, cotización a la derecha. En móvil no caben, y apilarlas obligaba
 * a bajar una pantalla entera de catálogo antes de ver el formulario, así que
 * ahí se alternan con un conmutador y las acciones bajan a una barra fija.
 *
 * Armar la cotización sigue ocurriendo entero en el navegador —el catálogo, los
 * precios, el PDF— y el borrador se guarda solo, así que cerrar la pestaña por
 * accidente no cuesta el trabajo hecho. Lo único que necesita servidor es
 * **emitir**: ahí se pide el número al consecutivo central y el documento queda
 * en el historial que ven las dos socias.
 */

import { useState } from 'react';

import { catalogo } from './dominio/catalogo';
import { dinero } from './dominio/formato';
import type { Moneda } from './dominio/moneda';
import { EMPRESA } from './datos/empresa';
import type { Cotizacion, Producto } from './dominio/tipos';
import { almacen, ES_DEMOSTRACION, FalloApi } from './historial/almacen';
import { PantallaClientes } from './clientes/PantallaClientes';
import { PantallaHistorial } from './historial/PantallaHistorial';
import { abrirWhatsapp, copiarMensaje, descargarPdf, verPdf } from './ui/acciones';
import { PanelCatalogo } from './ui/PanelCatalogo';
import {
  DatosCliente,
  DatosOferta,
  PanelCondiciones,
  ResumenTotales,
} from './ui/PanelCotizacion';
import { TablaLineas } from './ui/TablaLineas';
import { Seccion } from './ui/componentes';
import { useCotizacion } from './ui/useCotizacion';
import { useRuta } from './ui/useRuta';

/** Qué panel se ve en móvil. En escritorio se ven los dos y esto se ignora. */
type Panel = 'catalogo' | 'cotizacion';

/**
 * El estado de la cotización vive aquí, por encima de las dos pantallas: pasar
 * al historial y volver no puede costar el trabajo a medio hacer, y reabrir una
 * cotización guardada tiene que poder dejarla en el formulario.
 */
export default function App() {
  const estado = useCotizacion();
  const [ruta, ir] = useRuta();

  return (
    <>
      {ES_DEMOSTRACION ? <AvisoDemostracion /> : null}

      {ruta.vista === 'historial' ? (
        <PantallaHistorial
          alVolver={() => ir('cotizador')}
          alReabrir={(guardada) => {
            estado.despachar({ tipo: 'cargar', cotizacion: guardada });
            ir('cotizador');
          }}
        />
      ) : ruta.vista === 'clientes' ? (
        <PantallaClientes
          alVolver={() => ir('cotizador')}
          codigoAbierto={ruta.codigo}
          alAbrir={(codigo) => ir('clientes', codigo)}
        />
      ) : (
        <Cotizador
          estado={estado}
          alHistorial={() => ir('historial')}
          alClientes={() => ir('clientes')}
        />
      )}
    </>
  );
}

/**
 * La franja de la vista previa.
 *
 * Va arriba del todo, en ámbar y sin poderse cerrar, porque el riesgo que
 * cubre es que alguien mande a un cliente un PDF salido de aquí. Los números
 * de la demostración llevan «DEMO» dentro por la misma razón.
 */
function AvisoDemostracion() {
  return (
    <p className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
      Vista previa. Las cotizaciones no se guardan en ningún servidor: quedan en este navegador,
      con números de mentira, y sólo las ve quien las hizo.
    </p>
  );
}

function Cotizador({
  estado,
  alHistorial,
  alClientes,
}: {
  estado: ReturnType<typeof useCotizacion>;
  alHistorial: () => void;
  alClientes: () => void;
}) {
  const { cotizacion, despachar, totales, cambio, productosEnUso, revision, alertasPorLinea } =
    estado;
  const [verMargen, setVerMargen] = useState(false);
  const [aviso, setAviso] = useState('');
  const [panel, setPanel] = useState<Panel>('catalogo');
  const [emitiendo, setEmitiendo] = useState(false);

  const vacia = cotizacion.lineas.length === 0;

  const anunciar = (mensaje: string, milisegundos = 3000) => {
    setAviso(mensaje);
    setTimeout(() => setAviso(''), milisegundos);
  };

  /**
   * En móvil el producto añadido cae en el otro panel, fuera de la vista: sin
   * este aviso el botón parece no hacer nada.
   */
  const agregar = (producto: Producto) => {
    despachar({ tipo: 'agregar', producto });
    anunciar(`${producto.nombre} añadido a la cotización.`);
  };

  /**
   * Ejecuta una salida (PDF, WhatsApp, portapapeles) dejando constancia.
   *
   * Emitir son dos cosas a la vez: el documento que sale hacia el cliente y el
   * registro de que salió. Primero se guarda —de ahí vuelve el número— y sólo
   * después se genera el PDF o el mensaje, para que lo que el cliente recibe y
   * lo que queda en el historial sean el mismo documento con el mismo número.
   *
   * La vista previa no pasa por aquí: es para revisar, no para enviar, y no
   * gasta número ni deja registro.
   *
   * **Sin conexión no se emite.** Es la contrapartida honesta del consecutivo
   * central: el número depende de quién haya emitido antes, así que este
   * navegador no puede inventárselo. El borrador sigue guardado y la vista
   * previa sigue funcionando; lo que espera es el envío.
   */
  const emitir = async (accion: (c: Cotizacion) => Promise<void> | void) => {
    if (emitiendo) return;
    setEmitiendo(true);

    try {
      const { numero } = await almacen.registrar(cotizacion);
      if (numero !== cotizacion.numero) despachar({ tipo: 'numeroAsignado', numero });
      await accion({ ...cotizacion, numero });
    } catch (error) {
      console.error(error);
      anunciar(
        error instanceof FalloApi
          ? error.mensaje
          : 'No se pudo generar el documento. Revise la consola.',
        6000,
      );
    } finally {
      setEmitiendo(false);
    }
  };

  /** Salidas que no emiten: no piden número ni tocan el historial. */
  const soloVer = async (accion: (c: Cotizacion) => Promise<void> | void) => {
    try {
      await accion(cotizacion);
    } catch (error) {
      console.error(error);
      anunciar('No se pudo generar el documento. Revise la consola.');
    }
  };

  const acciones = {
    descargar: () => emitir((c) => descargarPdf(c)),
    ver: () => soloVer((c) => verPdf(c, true)),
    whatsapp: () => emitir(abrirWhatsapp),
    copiar: () =>
      emitir(async (c) =>
        anunciar(
          (await copiarMensaje(c))
            ? 'Mensaje copiado al portapapeles.'
            : 'No se pudo copiar; seleccione el texto a mano.',
        ),
      ),
    reiniciar: () => {
      if (vacia || confirm('¿Descartar la cotización actual y empezar una nueva?')) {
        despachar({ tipo: 'reiniciar' });
        setPanel('catalogo');
      }
    },
  };

  return (
    // El relleno inferior deja sitio a la barra fija de móvil.
    <div className="flex min-h-screen flex-col pb-28 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[110rem] items-center gap-x-4 gap-y-3 px-4 py-3 lg:px-6">
          <a
            href="../"
            className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-700 sm:flex"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Hub
          </a>
          <img src="./marca/logo.png" alt={EMPRESA.nombreComercial} className="h-9 w-auto" />
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-sm font-bold text-neutral-800">
              Cotizador · {EMPRESA.nombreComercial}
            </h1>
            {/* Sin número hasta emitir. Enseñar uno «previsto» sería mentir:
                lo asigna el servidor y depende de quién emita primero. */}
            <p className="text-xs text-neutral-500">
              {cotizacion.numero || 'El número se asigna al emitir'}
            </p>
          </div>

          {/* El historial y los clientes se alcanzan desde las dos anchuras:
              son la otra mitad de lo que la herramienta hace ahora, no
              opciones escondidas. */}
          <button type="button" className="boton-secundario" onClick={alClientes}>
            Clientes
          </button>
          <button type="button" className="boton-secundario" onClick={alHistorial}>
            Historial
          </button>

          {/* En móvil estas acciones viven en la barra inferior. */}
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            <button type="button" className="boton-secundario" onClick={acciones.reiniciar}>
              Nueva
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={acciones.copiar}
              disabled={vacia || emitiendo}
            >
              Copiar mensaje
            </button>
            <button
              type="button"
              className="boton-whatsapp"
              onClick={acciones.whatsapp}
              disabled={vacia || emitiendo}
            >
              WhatsApp
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={acciones.ver}
              disabled={vacia}
            >
              Vista previa
            </button>
            <button
              type="button"
              className="boton-primario"
              onClick={acciones.descargar}
              disabled={vacia || emitiendo}
            >
              {emitiendo ? 'Emitiendo…' : 'Descargar PDF'}
            </button>
          </div>
        </div>

        <Conmutador panel={panel} alCambiar={setPanel} lineas={cotizacion.lineas.length} />
      </header>

      <main className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-6 p-4 lg:flex-row lg:p-6">
        {/* `lg:flex` y `lg:block` ganan siempre, así que en escritorio los dos
            paneles se ven pase lo que pase con el conmutador. */}
        <aside
          className={`tarjeta h-[calc(100vh-16rem)] overflow-hidden lg:sticky lg:top-24 lg:flex lg:h-[calc(100vh-8rem)] lg:w-[26rem] lg:shrink-0 ${
            panel === 'catalogo' ? 'flex' : 'hidden'
          }`}
        >
          <PanelCatalogo
            productosEnUso={productosEnUso}
            alAgregar={agregar}
            enDivisa={cambio.moneda !== 'COP'}
          />
        </aside>

        <div
          className={`min-w-0 flex-1 space-y-6 lg:block ${
            panel === 'cotizacion' ? 'block' : 'hidden'
          }`}
        >
          {revision.graves > 0 ? (
            <AvisoPreciosDesactualizados
              lineas={revision.graves}
              alActualizar={() => {
                despachar({ tipo: 'actualizarPrecios' });
                anunciar('Precios actualizados con el listado vigente.');
              }}
            />
          ) : null}

          <DatosCliente cotizacion={cotizacion} despachar={despachar} />
          <DatosOferta cotizacion={cotizacion} despachar={despachar} />

          <Seccion
            titulo={`Referencias cotizadas (${cotizacion.lineas.length})`}
            accion={
              <label className="flex cursor-pointer items-center gap-2 py-1 text-xs text-neutral-500">
                <input
                  type="checkbox"
                  className="casilla"
                  checked={verMargen}
                  onChange={(e) => setVerMargen(e.currentTarget.checked)}
                />
                Ver margen
              </label>
            }
          >
            <TablaLineas
              lineas={cotizacion.lineas}
              despachar={despachar}
              iva={cotizacion.iva}
              cambio={cambio}
              alertasPorLinea={alertasPorLinea}
              verMargen={verMargen}
            />
          </Seccion>

          <ResumenTotales totales={totales} iva={cotizacion.iva} cambio={cambio} />
          <PanelCondiciones cotizacion={cotizacion} despachar={despachar} />

          {/* Las acciones secundarias, que en móvil no caben en la barra. */}
          <div className="flex flex-wrap gap-2 lg:hidden">
            <button type="button" className="boton-secundario" onClick={acciones.reiniciar}>
              Nueva
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={acciones.copiar}
              disabled={vacia || emitiendo}
            >
              Copiar mensaje
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={acciones.ver}
              disabled={vacia}
            >
              Vista previa
            </button>
          </div>

          <PieCatalogo />
        </div>
      </main>

      <BarraMovil
        total={totales.total}
        moneda={cambio.moneda}
        vacia={vacia || emitiendo}
        alWhatsapp={acciones.whatsapp}
        alDescargar={acciones.descargar}
      />

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4 lg:bottom-6"
      >
        {aviso ? (
          <p className="rounded-full bg-neutral-900 px-5 py-2 text-center text-sm font-semibold text-white shadow-lg">
            {aviso}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Conmutador entre catálogo y cotización, sólo en móvil.
 *
 * Son dos botones con `aria-pressed` y no un `tablist`: en escritorio los dos
 * paneles se ven a la vez y el conmutador desaparece, así que anunciarlos como
 * pestañas sería mentir sobre la mitad de los casos. El panel que no toca se
 * oculta con `hidden`, que también lo saca del árbol de accesibilidad.
 */
function Conmutador({
  panel,
  alCambiar,
  lineas,
}: {
  panel: Panel;
  alCambiar: (panel: Panel) => void;
  lineas: number;
}) {
  const opciones: { clave: Panel; texto: string; contador?: number }[] = [
    { clave: 'catalogo', texto: 'Catálogo' },
    { clave: 'cotizacion', texto: 'Cotización', contador: lineas },
  ];

  return (
    <div className="flex gap-2 border-t border-neutral-200 px-4 py-2 lg:hidden">
      {opciones.map(({ clave, texto, contador }) => {
        const activo = panel === clave;
        return (
          <button
            key={clave}
            type="button"
            aria-pressed={activo}
            onClick={() => alCambiar(clave)}
            className={`boton flex-1 ${
              activo
                ? 'bg-marca-600 text-white'
                : 'border border-neutral-300 bg-white text-neutral-600'
            }`}
          >
            {texto}
            {contador ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  activo ? 'bg-white/25' : 'bg-neutral-100'
                }`}
              >
                {contador}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Total siempre a la vista y las dos acciones de envío, sólo en móvil. */
function BarraMovil({
  total,
  moneda,
  vacia,
  alWhatsapp,
  alDescargar,
}: {
  total: number;
  moneda: Moneda;
  vacia: boolean;
  alWhatsapp: () => void;
  alDescargar: () => void;
}) {
  return (
    // Es una `section` con nombre —y no un `div`— para que sea un landmark:
    // si no, su contenido queda fuera de `header` y de `main`, y un lector de
    // pantalla que navegue por regiones se lo salta.
    <section
      aria-label="Total y envío de la cotización"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="mr-auto min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-neutral-500 uppercase">Total</p>
          <p className="truncate text-lg font-bold text-neutral-900">{dinero(total, moneda)}</p>
        </div>
        <button type="button" className="boton-whatsapp" onClick={alWhatsapp} disabled={vacia}>
          WhatsApp
        </button>
        <button type="button" className="boton-primario" onClick={alDescargar} disabled={vacia}>
          PDF
        </button>
      </div>
    </section>
  );
}

/**
 * Aviso de que la cotización quedó desalineada del listado.
 *
 * Va arriba y en rojo porque el caso que cubre es silencioso: se reabre un
 * borrador de la semana pasada, el catálogo se regeneró entre medias, y sin
 * esto la oferta sale al precio viejo sin que nada lo advierta.
 */
function AvisoPreciosDesactualizados({
  lineas,
  alActualizar,
}: {
  lineas: number;
  alActualizar: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <p className="text-sm font-bold text-red-800">
        {lineas === 1
          ? 'Una referencia no coincide con el listado de precios vigente.'
          : `${lineas} referencias no coinciden con el listado de precios vigente.`}
      </p>
      <p className="mt-1 text-sm text-red-700">
        Puede que el listado se haya actualizado después de armar esta cotización. Revise las
        líneas marcadas antes de enviarla.
      </p>
      <button type="button" className="boton-primario mt-3" onClick={alActualizar}>
        Actualizar precios con el listado vigente
      </button>
    </div>
  );
}

/** Procedencia de los precios y rarezas detectadas al leer el Excel. */
function PieCatalogo() {
  const [abierto, setAbierto] = useState(false);
  const { incidencias, productos, generadoEl, origen } = catalogo;

  return (
    <section className="tarjeta p-5 text-xs text-neutral-500">
      <p>
        {productos.length} referencias tomadas de <strong>{origen}</strong>, generadas el{' '}
        {generadoEl}. Los precios se actualizan volviendo a correr{' '}
        <code className="rounded bg-neutral-100 px-1">npm run catalogo</code> sobre el Excel.
      </p>

      {incidencias.length > 0 ? (
        <>
          <button
            type="button"
            className="mt-2 py-2 font-bold text-amber-700 underline"
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? 'Ocultar' : 'Ver'} {incidencias.length} observaciones sobre el listado
          </button>
          {abierto ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {incidencias.map((incidencia, indice) => (
                <li key={indice}>
                  <span className="font-semibold">{incidencia.tipo}</span>: {incidencia.detalle}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
