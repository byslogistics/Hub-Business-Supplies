/**
 * La ventana que aparece al emitir cuando hay algo que decidir sobre la ficha.
 *
 * Existe para que ningún dato de un cliente se pise sin que una persona lo
 * apruebe. Es lo más parecido que tiene este hub a una alarma, y por eso
 * interrumpe: lo que está en juego —el teléfono que alguien corrigió a mano, el
 * correo al que de verdad contesta el cliente— no se recupera después.
 *
 * Dos preguntas distintas, nunca a la vez:
 *
 * - **¿Es el mismo cliente?** cuando la cotización se parece a una ficha sin
 *   ser idéntica. Sólo el documento idéntico enlaza solo.
 * - **¿Qué hago con esto?** por cada dato que discrepa, con «dejar la ficha como
 *   está» ya marcado. Quien no lea nada y le dé a continuar no rompe nada.
 */

import { useState } from 'react';

import type { Coincidencia } from '../../../compartido/clientes';
import { MOTIVO_COINCIDENCIA } from '../../../compartido/clientes';
import type { CambioPropuesto, Plan, Resolucion } from './conciliar';

/** Qué contestó quien emite. `null` es cancelar: no se emite nada. */
export type Respuesta =
  | { tipo: 'esOtro' }
  | { tipo: 'esElMismo'; coincidencia: Coincidencia }
  | { tipo: 'resoluciones'; resoluciones: Record<string, Resolucion> }
  | null;

export function PanelConciliacion({
  plan,
  alResponder,
}: {
  plan: Plan;
  alResponder: (respuesta: Respuesta) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-conciliacion"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        {plan.parecido ? (
          <Parecido coincidencia={plan.parecido} alResponder={alResponder} />
        ) : (
          <Diferencias plan={plan} alResponder={alResponder} />
        )}
      </div>
    </div>
  );
}

/** «Puede que este cliente ya esté». */
function Parecido({
  coincidencia,
  alResponder,
}: {
  coincidencia: Coincidencia;
  alResponder: (respuesta: Respuesta) => void;
}) {
  const { cliente, clase } = coincidencia;

  return (
    <div className="p-5">
      <h2 id="titulo-conciliacion" className="text-lg font-bold text-neutral-900">
        Puede que este cliente ya esté
      </h2>
      <p className="mt-2 text-sm text-neutral-700">
        <strong>{cliente.empresa}</strong> ({cliente.codigo}) {MOTIVO_COINCIDENCIA[clase]}.
      </p>
      <dl className="mt-3 grid gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm sm:grid-cols-2">
        {[
          ['NIT o cédula', cliente.nit],
          ['Contacto', cliente.contacto],
          ['Correo', cliente.correo],
          ['Ciudad', cliente.ciudad],
        ]
          .filter(([, valor]) => Boolean(valor))
          .map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-xs text-neutral-500">{etiqueta}</dt>
              <dd className="font-medium text-neutral-800">{valor}</dd>
            </div>
          ))}
      </dl>

      <p className="mt-3 text-sm text-neutral-600">
        Todavía no se ha guardado ni enviado nada. Si es el mismo, la cotización queda en su ficha;
        si no, se crea una nueva.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="boton-primario"
          onClick={() => alResponder({ tipo: 'esElMismo', coincidencia })}
        >
          Es el mismo cliente
        </button>
        <button type="button" className="boton-secundario" onClick={() => alResponder({ tipo: 'esOtro' })}>
          Es otro · crear ficha nueva
        </button>
        <button
          type="button"
          className="ml-auto py-2 text-sm font-bold text-neutral-600 underline"
          onClick={() => alResponder(null)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** «Estos datos no coinciden con la ficha». */
function Diferencias({ plan, alResponder }: { plan: Plan; alResponder: (r: Respuesta) => void }) {
  // Todo arranca en «dejar la ficha como está»: es el lado seguro de las dos
  // formas de equivocarse, y quien no conteste nada no destruye nada.
  const [resoluciones, setResoluciones] = useState<Record<string, Resolucion>>({});

  const elegir = (campo: string, resolucion: Resolucion) =>
    setResoluciones((actuales) => ({ ...actuales, [campo]: resolucion }));

  return (
    <div className="p-5">
      <h2 id="titulo-conciliacion" className="text-lg font-bold text-neutral-900">
        {plan.preguntas.length > 0 ? 'Hay datos que no coinciden con la ficha' : 'Revise antes de emitir'}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">
        La cotización sale con lo que usted escribió. Lo que decida aquí es qué queda guardado en la
        ficha del cliente.
      </p>

      {plan.choqueNit ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-bold text-red-900">El documento no es el de esta ficha.</p>
          <p className="mt-1 text-red-800">
            La ficha dice <strong>{plan.choqueNit.actual}</strong> y la cotización{' '}
            <strong>{plan.choqueNit.nuevo}</strong>. Un NIT distinto no es una corrección: es otro
            cliente. <strong>No se va a cambiar.</strong> Si de verdad es otra empresa, cancele y
            busque o cree su ficha.
          </p>
        </div>
      ) : null}

      {plan.rellenar.length > 0 ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-bold text-emerald-900">Se llenan solos, porque la ficha los tiene vacíos:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-emerald-800">
            {plan.rellenar.map(({ campo, nombre, valor }) => (
              <li key={campo}>
                <strong>{nombre}</strong>: {valor}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.preguntas.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {plan.preguntas.map((pregunta) => (
            <Pregunta
              key={pregunta.campo}
              pregunta={pregunta}
              elegida={resoluciones[pregunta.campo] ?? 'dejar'}
              alElegir={(resolucion) => elegir(pregunta.campo, resolucion)}
            />
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="boton-primario"
          onClick={() => alResponder({ tipo: 'resoluciones', resoluciones })}
        >
          Continuar y emitir
        </button>
        <button
          type="button"
          className="ml-auto py-2 text-sm font-bold text-neutral-600 underline"
          onClick={() => alResponder(null)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Pregunta({
  pregunta,
  elegida,
  alElegir,
}: {
  pregunta: CambioPropuesto;
  elegida: Resolucion;
  alElegir: (resolucion: Resolucion) => void;
}) {
  const opciones: { valor: Resolucion; texto: string }[] = [
    { valor: 'dejar', texto: 'Dejar la ficha como está' },
    ...(pregunta.admiteAmbos
      ? ([{ valor: 'ambos', texto: 'Guardar los dos' }] as const)
      : []),
    { valor: 'reemplazar', texto: 'Reemplazar' },
  ];

  return (
    <li className="rounded-xl border border-neutral-200 p-3">
      <p className="text-sm font-bold text-neutral-800">{pregunta.nombre}</p>
      <p className="mt-1 text-sm text-neutral-600">
        La ficha dice «{pregunta.actual}» y la cotización «{pregunta.nuevo}».
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {opciones.map(({ valor, texto }) => (
          <button
            key={valor}
            type="button"
            aria-pressed={elegida === valor}
            className={`boton text-sm ${
              elegida === valor
                ? 'bg-marca-600 text-white'
                : 'border border-neutral-300 bg-white text-neutral-700'
            }`}
            onClick={() => alElegir(valor)}
          >
            {texto}
          </button>
        ))}
      </div>

      {elegida === 'reemplazar' && pregunta.admiteAmbos ? (
        <p className="mt-2 text-xs text-neutral-500">
          El anterior no se pierde: baja a la lista de adicionales de la ficha.
        </p>
      ) : null}
    </li>
  );
}
