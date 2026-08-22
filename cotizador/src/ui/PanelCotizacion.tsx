/** Datos del cliente, condiciones comerciales y totales. */

import { CIUDADES_CON_FLETE, ASESORES } from '../datos/empresa';
import { NOTAS_FRECUENTES, PLANTILLAS } from '../datos/condiciones';
import { fechaLarga, pesos, sumarDias, unidades } from '../dominio/formato';
import type { Cotizacion, FormaPago, TotalesCotizacion } from '../dominio/tipos';
import { CampoNumero, CampoSelect, CampoTexto, Seccion } from './componentes';
import type { Despachar } from './useCotizacion';

const FORMAS_PAGO: readonly FormaPago[] = [
  'Anticipado',
  'Contra entrega',
  'Crédito 30 días',
  'Crédito 45 días',
];

export function DatosCliente({
  cotizacion,
  despachar,
}: {
  cotizacion: Cotizacion;
  despachar: Despachar;
}) {
  const { cliente } = cotizacion;
  const editar = (cambios: Partial<typeof cliente>) =>
    despachar({ tipo: 'editarCliente', cambios });

  return (
    <Seccion titulo="Cliente">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <CampoTexto
            etiqueta="Empresa"
            value={cliente.empresa}
            placeholder="Razón social del cliente"
            onChange={(e) => editar({ empresa: e.currentTarget.value })}
          />
        </div>
        <CampoTexto
          etiqueta="NIT / C.C."
          value={cliente.nit}
          onChange={(e) => editar({ nit: e.currentTarget.value })}
        />
        <CampoTexto
          etiqueta="Contacto"
          value={cliente.contacto}
          onChange={(e) => editar({ contacto: e.currentTarget.value })}
        />
        <CampoTexto
          etiqueta="Teléfono"
          value={cliente.telefono}
          placeholder="300 000 0000"
          onChange={(e) => editar({ telefono: e.currentTarget.value })}
        />
        <CampoTexto
          etiqueta="Ciudad"
          value={cliente.ciudad}
          list="ciudades-con-flete"
          onChange={(e) => editar({ ciudad: e.currentTarget.value })}
        />
        <div className="sm:col-span-2">
          <CampoTexto
            etiqueta="Correo"
            type="email"
            value={cliente.email}
            onChange={(e) => editar({ email: e.currentTarget.value })}
          />
        </div>
      </div>

      {/* El listado promete flete incluido sólo a estas ciudades. */}
      <datalist id="ciudades-con-flete">
        {CIUDADES_CON_FLETE.map((ciudad) => (
          <option key={ciudad} value={ciudad} />
        ))}
      </datalist>
    </Seccion>
  );
}

/**
 * Tratamientos de IVA de uso corriente. El valor es la fracción que se guarda
 * en la cotización; `null` significa «otra tarifa», que abre el campo libre
 * para un régimen distinto. Sólo cambia el impuesto: la cotización se emite
 * siempre en pesos colombianos.
 */
const TRATAMIENTOS: readonly { clave: string; texto: string; tarifa: number | null }[] = [
  { clave: 'nacional', texto: 'Venta nacional · IVA 19%', tarifa: 0.19 },
  { clave: 'sin-iva', texto: 'Exportación o venta no gravada · sin IVA', tarifa: 0 },
  { clave: 'otra', texto: 'Otra tarifa…', tarifa: null },
];

/** Deduce el tratamiento a partir de la tarifa guardada, sin estado extra. */
function tratamientoDe(iva: number): string {
  return TRATAMIENTOS.find((t) => t.tarifa === iva)?.clave ?? 'otra';
}

export function DatosOferta({
  cotizacion,
  despachar,
}: {
  cotizacion: Cotizacion;
  despachar: Despachar;
}) {
  const tratamiento = tratamientoDe(cotizacion.iva);

  return (
    <Seccion titulo="Datos de la oferta">
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoTexto
          etiqueta="Número"
          // Vacío hasta emitir: el consecutivo lo lleva el servidor. Se deja
          // editable porque hay un caso real que lo necesita —pasar al
          // historial una cotización vieja del Excel, con su número de
          // entonces— y en ese caso se respeta el que se escriba.
          placeholder="Se asigna al emitir"
          nota={cotizacion.numero ? undefined : 'El servidor lo asigna al emitir la cotización.'}
          value={cotizacion.numero}
          onChange={(e) => despachar({ tipo: 'editarCabecera', cambios: { numero: e.currentTarget.value } })}
        />
        <CampoTexto
          etiqueta="Fecha"
          type="date"
          value={cotizacion.fecha}
          onChange={(e) => despachar({ tipo: 'editarCabecera', cambios: { fecha: e.currentTarget.value } })}
        />
        <CampoSelect
          etiqueta="Asesor"
          value={cotizacion.asesor}
          onChange={(e) => despachar({ tipo: 'editarCabecera', cambios: { asesor: e.currentTarget.value } })}
        >
          {ASESORES.map((asesor) => (
            <option key={asesor} value={asesor}>
              {asesor}
            </option>
          ))}
        </CampoSelect>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <CampoSelect
            etiqueta="Tratamiento de IVA"
            value={tratamiento}
            onChange={(e) => {
              const elegido = TRATAMIENTOS.find((t) => t.clave === e.currentTarget.value);
              // «Otra tarifa» no cambia el número: sólo destapa el campo para
              // que el asesor escriba el que corresponda.
              if (elegido?.tarifa === null) return;
              despachar({ tipo: 'editarCabecera', cambios: { iva: elegido?.tarifa ?? 0 } });
            }}
          >
            {TRATAMIENTOS.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.texto}
              </option>
            ))}
          </CampoSelect>
        </div>

        {tratamiento === 'otra' ? (
          <CampoNumero
            etiqueta="IVA (%)"
            valor={Math.round(cotizacion.iva * 10000) / 100}
            minimo={0}
            max={100}
            alCambiar={(porciento) =>
              despachar({
                tipo: 'editarCabecera',
                cambios: { iva: Math.min(100, porciento) / 100 },
              })
            }
          />
        ) : null}
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        La tarifa queda guardada en esta cotización. Si el IVA cambia más adelante, lo ya emitido
        conserva sus totales.
      </p>
    </Seccion>
  );
}

export function PanelCondiciones({
  cotizacion,
  despachar,
}: {
  cotizacion: Cotizacion;
  despachar: Despachar;
}) {
  const { condiciones } = cotizacion;
  const editar = (cambios: Partial<typeof condiciones>) =>
    despachar({ tipo: 'editarCondiciones', cambios });

  const vence = sumarDias(cotizacion.fecha, condiciones.validezDias);

  return (
    <Seccion
      titulo="Condiciones comerciales"
      accion={
        <div className="flex gap-1.5">
          {PLANTILLAS.map((plantilla) => (
            <button
              key={plantilla.clave}
              type="button"
              title={plantilla.descripcion}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-bold text-neutral-600 transition hover:border-marca-400 hover:bg-marca-50 hover:text-marca-700"
              onClick={() => despachar({ tipo: 'aplicarPlantilla', clave: plantilla.clave })}
            >
              {plantilla.titulo}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTexto
          etiqueta="Tiempo de entrega"
          value={condiciones.tiempoEntrega}
          onChange={(e) => editar({ tiempoEntrega: e.currentTarget.value })}
        />
        <CampoSelect
          etiqueta="Forma de pago"
          value={condiciones.formaPago}
          onChange={(e) => editar({ formaPago: e.currentTarget.value as FormaPago })}
        >
          {FORMAS_PAGO.map((forma) => (
            <option key={forma} value={forma}>
              {forma}
            </option>
          ))}
        </CampoSelect>
        <CampoNumero
          etiqueta="Validez (días)"
          valor={condiciones.validezDias}
          minimo={1}
          alCambiar={(validezDias) => editar({ validezDias })}
        />
        <div className="flex items-end pb-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              className="casilla"
              checked={condiciones.incluyeFlete}
              onChange={(e) => editar({ incluyeFlete: e.currentTarget.checked })}
            />
            Flete incluido
          </label>
        </div>
      </div>

      <p className="mt-2 text-xs text-neutral-500">Vence el {fechaLarga(vence)}.</p>

      <fieldset className="mt-4">
        <legend className="etiqueta">La oferta incluye</legend>
        <ul className="space-y-2">
          {condiciones.incluye.map((punto, indice) => (
            <li key={indice} className="flex gap-2">
              {/* Son campos sin rótulo visible: el de la lista lo da el
                  `legend`. Se nombran por posición para poder distinguirlos. */}
              <input
                className="campo"
                aria-label={`Punto ${indice + 1} de lo que incluye la oferta`}
                value={punto}
                onChange={(e) => {
                  const incluye = [...condiciones.incluye];
                  incluye[indice] = e.currentTarget.value;
                  editar({ incluye });
                }}
              />
              <button
                type="button"
                aria-label={`Quitar el punto ${indice + 1}`}
                className="min-h-11 shrink-0 rounded-lg border border-neutral-200 px-4 text-neutral-500 transition hover:border-red-300 hover:text-red-600 lg:min-h-0"
                onClick={() =>
                  editar({ incluye: condiciones.incluye.filter((_, i) => i !== indice) })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 py-2 text-xs font-bold text-marca-700 underline"
          onClick={() => editar({ incluye: [...condiciones.incluye, ''] })}
        >
          Añadir punto
        </button>
      </fieldset>

      <label className="mt-4 block">
        <span className="etiqueta">Observaciones</span>
        <textarea
          className="campo min-h-20 resize-y"
          value={condiciones.observaciones}
          placeholder="Notas que aparecerán en el PDF"
          onChange={(e) => editar({ observaciones: e.currentTarget.value })}
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {NOTAS_FRECUENTES.map((nota) => (
          <button
            key={nota}
            type="button"
            title={nota}
            className="max-w-full truncate rounded-full bg-neutral-100 px-3 py-2 text-xs text-neutral-600 transition hover:bg-marca-50 hover:text-marca-700"
            onClick={() =>
              editar({
                observaciones: condiciones.observaciones
                  ? `${condiciones.observaciones.trimEnd()} ${nota}`
                  : nota,
              })
            }
          >
            + {nota}
          </button>
        ))}
      </div>
    </Seccion>
  );
}

export function ResumenTotales({ totales, iva }: { totales: TotalesCotizacion; iva: number }) {
  const filas: [string, string][] = [
    ['Subtotal', pesos(totales.bruto)],
    ...(totales.descuento > 0
      ? ([['Descuento', `- ${pesos(totales.descuento)}`]] as [string, string][])
      : []),
    // Con tarifa cero la fila del IVA sólo confunde: se sustituye por una
    // línea que dice por qué no lo lleva.
    ...(iva > 0
      ? ([[`IVA ${redondear(iva * 100)}%`, pesos(totales.iva)]] as [string, string][])
      : []),
  ];

  return (
    <div className="tarjeta overflow-hidden">
      <dl className="divide-y divide-neutral-100">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-baseline justify-between px-5 py-2.5">
            <dt className="text-sm text-neutral-600">{etiqueta}</dt>
            <dd className="text-sm font-semibold text-neutral-800">{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between bg-marca-950 px-5 py-3.5 text-white">
        <span className="text-sm font-bold">TOTAL</span>
        <span className="text-xl font-bold">{pesos(totales.total)}</span>
      </div>
      <p className="px-5 py-2 text-xs text-neutral-500">
        {unidades(totales.unidades)} unidades en total
        {iva > 0 ? null : ' · operación sin IVA'}
      </p>
    </div>
  );
}

/** 19 en vez de 19.00, pero 8.5 si la tarifa lo lleva. */
function redondear(valor: number): string {
  return String(Math.round(valor * 100) / 100);
}
