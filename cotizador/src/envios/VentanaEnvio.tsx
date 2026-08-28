/**
 * La ventana que se abre al pulsar «Enviar cotización».
 *
 * Existe por una razón que cabe en una frase: **nada sale sin que alguien lo
 * vea**. El correo llega armado —asunto, cuerpo, destinatario, PDF adjunto— y
 * quien envía puede corregir lo que quiera antes de que salga; también puede
 * mirar exactamente cómo se va a ver, con la misma función que usa el servidor
 * para generarlo.
 *
 * Lo que esta ventana **no** deja tocar son las cifras. El número, la fecha y
 * el total los pone el servidor leyendo la cotización guardada, y por eso salen
 * aquí como texto y no como campos: es la misma regla del historial —el
 * documento manda— aplicada al correo.
 */

import { useEffect, useMemo, useState } from 'react';

import { EQUIPO, ORDEN_EQUIPO, porNombre } from '../../../compartido/equipo.js';
import { FalloApi } from '../api/fallo';
import { clientes } from '../clientes/almacen';
import type { Cotizacion } from '../dominio/tipos';
import { datosDeLaCotizacion, mensajeSugerido } from './correoCotizacion';

/** Lo que la ventana devuelve al pulsar enviar. */
export interface DatosEnvio {
  destinatario: string;
  asunto: string;
  mensaje: string;
  remitenteId: string;
  copiaAlRemitente: boolean;
  copiaArchivo: boolean;
}

interface Props {
  cotizacion: Cotizacion;
  /** `true` mientras la cotización todavía no tiene número asignado. */
  sinNumero: boolean;
  enviando: boolean;
  fallo: string;
  alEnviar: (datos: DatosEnvio) => void;
  alCerrar: () => void;
}

export function VentanaEnvio({ cotizacion, sinNumero, enviando, fallo, alEnviar, alCerrar }: Props) {
  const [destinatario, setDestinatario] = useState(cotizacion.cliente.email ?? '');
  const [mensaje, setMensaje] = useState(() => mensajeSugerido(cotizacion));
  const [remitenteId, setRemitenteId] = useState(
    () => porNombre(cotizacion.asesor)?.id ?? ORDEN_EQUIPO[0]!,
  );
  const [copiaAlRemitente, setCopiaAlRemitente] = useState(false);
  const [copiaArchivo, setCopiaArchivo] = useState(false);
  const [asunto, setAsunto] = useState('');
  const [viendo, setViendo] = useState(false);
  const [otrosCorreos, setOtrosCorreos] = useState<string[]>([]);

  // El número todavía no existe mientras no se emita: se enseña así en vez de
  // inventar uno, igual que hace la cabecera del cotizador.
  const numeroVisible = cotizacion.numero || 'se asigna al enviar';

  const datos = useMemo(
    () => datosDeLaCotizacion(cotizacion, numeroVisible, mensaje),
    [cotizacion, numeroVisible, mensaje],
  );

  // Los demás correos de la ficha, para poder añadirlos de un clic en vez de
  // ir a buscarlos a otra pantalla.
  useEffect(() => {
    const codigo = cotizacion.clienteCodigo;
    if (!codigo) return;

    let vigente = true;
    clientes
      .abrir(codigo)
      .then((ficha) => {
        if (!vigente) return;
        setOtrosCorreos([ficha.correo, ...ficha.correosExtra].filter(Boolean));
      })
      .catch(() => undefined);

    return () => {
      vigente = false;
    };
  }, [cotizacion.clienteCodigo]);

  const sinDestinatario = destinatario.trim() === '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-envio"
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="titulo-envio" className="text-lg font-bold text-neutral-900">
              Enviar la cotización
            </h2>
            <p className="text-sm text-neutral-500">
              Sale desde ventas@byslogistics.com.co con el PDF adjunto. Las respuestas llegan al
              buzón de la empresa.
            </p>
          </div>
          <button
            type="button"
            className="ml-auto shrink-0 py-1 text-sm font-bold text-neutral-500 underline"
            onClick={alCerrar}
            disabled={enviando}
          >
            Cerrar
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {fallo ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
              {fallo}
            </p>
          ) : null}

          {/* Las cifras, como texto: las pone el servidor, no esta ventana. */}
          <dl className="grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm sm:grid-cols-4">
            {[
              ['Cotización', numeroVisible],
              ['Fecha', datos.fecha],
              ['Total', datos.total],
              ['Validez', datos.validez || '—'],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-xs text-neutral-500">{etiqueta}</dt>
                <dd className="font-bold text-neutral-800">{valor}</dd>
              </div>
            ))}
          </dl>

          <label className="block">
            <span className="etiqueta">Para</span>
            <input
              type="text"
              className="campo"
              value={destinatario}
              placeholder="cliente@empresa.com, otro@empresa.com"
              onChange={(e) => setDestinatario(e.currentTarget.value)}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Varias direcciones separadas por coma, hasta cinco.
            </span>
          </label>

          {otrosCorreos.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">De su ficha:</span>
              {otrosCorreos.map((correo) => (
                <button
                  key={correo}
                  type="button"
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  onClick={() =>
                    setDestinatario((actual) =>
                      actual
                        .split(',')
                        .map((d) => d.trim())
                        .filter(Boolean)
                        .includes(correo)
                        ? actual
                        : [actual.trim(), correo].filter(Boolean).join(', '),
                    )
                  }
                >
                  + {correo}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="etiqueta">Firma</span>
              <select
                className="campo"
                value={remitenteId}
                onChange={(e) => setRemitenteId(e.currentTarget.value)}
              >
                {ORDEN_EQUIPO.map((id) => (
                  <option key={id} value={id}>
                    {EQUIPO[id]!.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="etiqueta">Asunto</span>
              <input
                type="text"
                className="campo"
                value={asunto}
                placeholder={`Cotización ${numeroVisible} — B&S Logistics`}
                onChange={(e) => setAsunto(e.currentTarget.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className="etiqueta">Mensaje</span>
            <textarea
              className="campo min-h-28"
              value={mensaje}
              onChange={(e) => setMensaje(e.currentTarget.value)}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              El saludo, el recuadro con las cifras y la firma los pone la plantilla. Esto es lo que
              va en medio.
            </span>
          </label>

          <fieldset className="grid gap-2">
            <legend className="etiqueta">Copias</legend>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="casilla"
                checked={copiaArchivo}
                onChange={(e) => setCopiaArchivo(e.currentTarget.checked)}
              />
              Guardar copia en el archivo de la empresa
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="casilla"
                checked={copiaAlRemitente}
                onChange={(e) => setCopiaAlRemitente(e.currentTarget.checked)}
              />
              Enviarme una copia a mí
            </label>
            <p className="text-xs text-neutral-500">
              Las dos van ocultas: el cliente no ve los buzones internos.
            </p>
          </fieldset>

          <VistaPrevia
            abierta={viendo}
            alAlternar={() => setViendo((v) => !v)}
            remitenteId={remitenteId}
            datos={datos}
          />
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-3">
          <p className="mr-auto text-xs text-neutral-500">
            {sinNumero
              ? 'Al enviar se guarda la cotización y se le asigna su número.'
              : `Se reenvía la ${cotizacion.numero}, sin gastar un número nuevo.`}
          </p>
          <button type="button" className="boton-secundario" onClick={alCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            className="boton-primario"
            disabled={enviando || sinDestinatario}
            onClick={() =>
              alEnviar({ destinatario, asunto, mensaje, remitenteId, copiaAlRemitente, copiaArchivo })
            }
          >
            {enviando ? 'Enviando…' : 'Enviar cotización'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * El correo tal como va a llegar.
 *
 * Se arma con `previsualizarCorreo`, la misma función que usa el servidor para
 * generarlo de verdad, así que no hay dos versiones del correo que se puedan
 * desincronizar. La plantilla se carga sólo al abrir la vista previa: pesa, y
 * quien no la mira no tiene por qué descargarla.
 */
function VistaPrevia({
  abierta,
  alAlternar,
  remitenteId,
  datos,
}: {
  abierta: boolean;
  alAlternar: () => void;
  remitenteId: string;
  datos: Record<string, string>;
}) {
  const [html, setHtml] = useState('');
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    if (!abierta) return;

    let vigente = true;
    import('../../../correo/plantillas.js')
      .then(({ previsualizarCorreo }) => {
        if (!vigente) return;
        setHtml(previsualizarCorreo(remitenteId, 'cotizacion', datos).html);
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        setFallo(error instanceof FalloApi ? error.mensaje : 'No se pudo armar la vista previa.');
      });

    return () => {
      vigente = false;
    };
  }, [abierta, remitenteId, datos]);

  return (
    <div>
      <button
        type="button"
        className="boton-secundario"
        aria-expanded={abierta}
        onClick={alAlternar}
      >
        {abierta ? 'Ocultar la vista previa' : 'Ver cómo llega'}
      </button>

      {abierta ? (
        fallo ? (
          <p className="mt-2 text-sm font-semibold text-red-700">{fallo}</p>
        ) : (
          <iframe
            title="Vista previa del correo"
            className="mt-2 h-96 w-full rounded-xl border border-neutral-300"
            srcDoc={html}
          />
        )
      ) : null}
    </div>
  );
}
