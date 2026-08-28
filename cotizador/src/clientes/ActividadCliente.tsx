/**
 * Lo que ha pasado con un cliente: qué se le cotizó, qué compró y qué se le
 * escribió.
 *
 * Es la pantalla que justifica las cuatro fases anteriores. Hasta ahora, para
 * responder «¿cómo vamos con este cliente?» había que abrir el historial, buscar
 * por un nombre que a lo mejor se escribió distinto, y acordarse aparte de qué
 * correos se le habían mandado. Ahora se abre su ficha.
 *
 * Las cuatro cifras van **en pesos**, incluso lo cotizado en dólares, convertido
 * a la tasa que cada cotización guardó. Sumar pesos y dólares en la misma cifra
 * daría un número que no es dinero de ninguna clase.
 */

import { useEffect, useState } from 'react';

import type { ActividadCliente as Actividad } from '../../../compartido/actividad';
import { NOMBRE_ESTADO, type ResumenCotizacion } from '../../../compartido/historial';
import { EQUIPO } from '../../../compartido/equipo.js';
import { FalloApi } from '../api/fallo';
import { dinero, fechaCorta, pesos } from '../dominio/formato';
import { Insignia } from '../ui/componentes';
import { clientes } from './almacen';

export function ActividadDelCliente({ codigo }: { codigo: string }) {
  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    let vigente = true;
    setActividad(null);
    setFallo('');

    clientes
      .actividad(codigo)
      .then((datos) => vigente && setActividad(datos))
      .catch((error: unknown) => {
        if (!vigente) return;
        setFallo(error instanceof FalloApi ? error.mensaje : 'No se pudo cargar su actividad.');
      });

    return () => {
      vigente = false;
    };
  }, [codigo]);

  if (fallo) {
    return (
      <section className="tarjeta p-5">
        <p className="text-sm font-semibold text-red-800">{fallo}</p>
      </section>
    );
  }

  if (!actividad) {
    return (
      <section className="tarjeta p-5">
        <p className="text-sm text-neutral-500">Cargando su historia…</p>
      </section>
    );
  }

  const { totales, cotizaciones, envios } = actividad;

  return (
    <div className="space-y-4">
      <section className="tarjeta p-5">
        <h2 className="text-xs font-bold tracking-wide text-marca-700 uppercase">Cómo vamos</h2>

        {totales.cuantas === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Todavía no se le ha cotizado nada. En cuanto se emita la primera, aparece aquí.
          </p>
        ) : (
          <>
            <dl className="mt-3 grid gap-3 sm:grid-cols-4">
              {(
                [
                  ['Cotizado', totales.cotizado, 'text-neutral-900'],
                  ['Ganado', totales.ganado, 'text-emerald-700'],
                  ['Pendiente', totales.pendiente, 'text-marca-700'],
                  ['Perdido', totales.perdido, 'text-neutral-500'],
                ] as const
              ).map(([etiqueta, valor, color]) => (
                <div key={etiqueta} className="rounded-xl border border-neutral-200 p-3">
                  <dt className="text-xs text-neutral-500">{etiqueta}</dt>
                  <dd className={`text-lg font-bold tabular-nums ${color}`}>{pesos(valor)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-neutral-500">
              {totales.cuantas === 1 ? '1 cotización' : `${totales.cuantas} cotizaciones`}. «Ganado»
              es lo marcado como aceptado en el historial. Todo en pesos: lo cotizado en dólares va
              convertido a la tasa que llevaba cada cotización.
            </p>
          </>
        )}
      </section>

      {cotizaciones.length > 0 ? (
        <section className="tarjeta overflow-hidden">
          <h2 className="border-b border-neutral-200 px-5 py-3 text-xs font-bold tracking-wide text-marca-700 uppercase">
            Sus cotizaciones
          </h2>
          <ul className="divide-y divide-neutral-100">
            {cotizaciones.map((cotizacion) => (
              <FilaCotizacion key={cotizacion.numero} cotizacion={cotizacion} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="tarjeta overflow-hidden">
        <h2 className="border-b border-neutral-200 px-5 py-3 text-xs font-bold tracking-wide text-marca-700 uppercase">
          Lo que se le ha escrito
        </h2>

        {envios.length === 0 ? (
          <p className="px-5 py-4 text-sm text-neutral-500">
            Todavía no se le ha mandado ningún correo desde el hub.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {envios.map((envio) => (
              <li key={envio.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold text-neutral-800">{envio.asunto}</span>
                  {envio.cotizacionNumero ? (
                    <Insignia tono="marca">{envio.cotizacionNumero}</Insignia>
                  ) : null}
                  {envio.adjuntos > 0 ? (
                    <span className="text-xs text-neutral-500">
                      {envio.adjuntos === 1 ? '1 adjunto' : `${envio.adjuntos} adjuntos`}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-neutral-600">{envio.destinatarios.join(', ')}</p>
                <p className="text-xs text-neutral-400">
                  {fechaCorta(envio.enviadoEn)} · firmó{' '}
                  {EQUIPO[envio.remitenteId]?.nombre ?? envio.remitenteId}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilaCotizacion({ cotizacion }: { cotizacion: ResumenCotizacion }) {
  const tono =
    cotizacion.estado === 'aceptada' ? 'exito' : cotizacion.estado === 'perdida' ? 'neutro' : 'marca';

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
      <span className="font-mono text-sm font-bold text-neutral-800">{cotizacion.numero}</span>
      <span className="text-sm text-neutral-500">{fechaCorta(cotizacion.fecha)}</span>
      <Insignia tono={tono}>{NOMBRE_ESTADO[cotizacion.estado]}</Insignia>

      <span className="ml-auto text-sm font-bold tabular-nums text-neutral-900">
        {dinero(cotizacion.totalMoneda, cotizacion.moneda)}
      </span>
      {cotizacion.moneda !== 'COP' ? (
        <span className="text-xs text-neutral-500">({pesos(cotizacion.total)})</span>
      ) : null}

      {/* Las emitidas antes de que existieran las fichas no traen enlace: se
          reconocen por su documento, y se dice, para que nadie se pregunte por
          qué esta cotización sale aquí sin haberla enlazado nunca. */}
      {cotizacion.clienteCodigo === null ? (
        <span className="w-full text-xs text-neutral-400">
          Emitida antes de que existieran las fichas; se reconoce por el NIT.
        </span>
      ) : null}
    </li>
  );
}
