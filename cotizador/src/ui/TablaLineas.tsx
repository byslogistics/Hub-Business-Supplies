/**
 * Las líneas de la cotización.
 *
 * Cada fila es un producto con su cantidad y su precio. El precio se sugiere
 * solo desde el listado, pero se puede escribir a mano: el listado orienta,
 * no manda, y el asesor negocia. Cuando el precio deja de ser el sugerido la
 * fila lo dice y ofrece volver.
 */

import { productoPorId } from '../dominio/catalogo';
import { dinero, pasoDe, pesos, porcentaje, unidades } from '../dominio/formato';
import { aMoneda, EN_PESOS, type Cambio } from '../dominio/moneda';
import { margenDeLinea, oportunidadDeVolumen, totalesDeLinea } from '../dominio/precios';
import type { Alerta } from '../dominio/revision';
import type { Linea } from '../dominio/tipos';
import { CampoNumero, Insignia } from './componentes';
import type { Despachar } from './useCotizacion';

interface Props {
  lineas: readonly Linea[];
  despachar: Despachar;
  /** Tarifa de IVA de la cotización, para el desglose de cada línea. */
  iva: number;
  /**
   * La moneda de la cotización y su tasa.
   *
   * Hace falta en toda la tabla: los importes de la línea van en esa moneda,
   * pero lo que viene del listado —el ahorro por volumen, el costo de compra,
   * el recargo por centímetro— está en pesos y hay que convertirlo o
   * etiquetarlo como pesos, según el caso.
   */
  cambio?: Cambio;
  /** Alertas por línea, calculadas en el dominio. */
  alertasPorLinea: ReadonlyMap<string, readonly Alerta[]>;
  /** Muestra costo y margen. Es información interna: nunca sale en el PDF. */
  verMargen: boolean;
}

export function TablaLineas({
  lineas,
  despachar,
  iva,
  cambio = EN_PESOS,
  alertasPorLinea,
  verMargen,
}: Props) {
  if (lineas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
        Busque una referencia en el catálogo y añádala para empezar la cotización.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {lineas.map((linea, indice) => (
        <FilaLinea
          key={linea.id}
          linea={linea}
          indice={indice}
          esPrimera={indice === 0}
          esUltima={indice === lineas.length - 1}
          despachar={despachar}
          iva={iva}
          cambio={cambio}
          alertas={alertasPorLinea.get(linea.id) ?? []}
          verMargen={verMargen}
        />
      ))}
    </ul>
  );
}

function FilaLinea({
  linea,
  indice,
  esPrimera,
  esUltima,
  despachar,
  iva,
  cambio,
  alertas,
  verMargen,
}: {
  linea: Linea;
  indice: number;
  esPrimera: boolean;
  esUltima: boolean;
  despachar: Despachar;
  iva: number;
  cambio: Cambio;
  alertas: readonly Alerta[];
  verMargen: boolean;
}) {
  const producto = productoPorId(linea.productoId);
  const totales = totalesDeLinea(linea, iva, cambio.moneda);
  const variante = { conLogo: linea.conLogo, medida: linea.medida };

  const oportunidad = producto ? oportunidadDeVolumen(producto, linea.cantidad, variante) : null;
  const margen = margenDeLinea(producto, linea, cambio);
  const desviado = alertas.some(
    (a) => a.tipo === 'precio-manual' || a.tipo === 'precio-desactualizado',
  );

  const editar = (cambios: Partial<Linea>) =>
    despachar({ tipo: 'editarLinea', id: linea.id, cambios });

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-4">
      {/* En móvil el importe y los botones bajan a su propia fila: dejarlos en
          una columna a la derecha estrujaba los campos hasta los 45 px, que no
          dan ni para escribir «10000». `flex-wrap` con `w-full lg:w-auto` los
          manda abajo en pantalla estrecha y los devuelve al lado en ancha. */}
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-2 w-5 shrink-0 text-center text-xs font-bold text-neutral-400">
          {indice + 1}
        </span>

        <div className="min-w-0 flex-1 basis-64 space-y-3">
          <input
            className="campo font-semibold"
            value={linea.descripcion}
            aria-label={`Descripción de la línea ${indice + 1}`}
            onChange={(evento) => editar({ descripcion: evento.currentTarget.value })}
          />

          {/* Todas las líneas repiten los mismos rótulos —«Cantidad», «Valor
              unitario»—, así que a la vista se distinguen por su posición en
              la tarjeta. Un lector de pantalla no tiene esa pista: sin el
              nombre del producto en cada campo, se oyen cinco «Cantidad»
              seguidas sin saber cuál es cuál. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CampoNumero
              etiqueta="Cantidad"
              aria-label={`Cantidad de ${linea.descripcion}`}
              valor={linea.cantidad}
              minimo={1}
              alCambiar={(cantidad) => editar({ cantidad })}
            />

            <label className="block">
              {/* El rótulo dice la moneda: es lo que impide teclear 3.500 en
                  un campo que está pidiendo dólares. */}
              <span className="etiqueta">Valor unitario ({cambio.moneda})</span>
              <CampoNumero
                aria-label={`Valor unitario de ${linea.descripcion} en ${cambio.moneda}`}
                valor={linea.unitario}
                // En dólares hay que poder escribir centavos; en pesos, no.
                step={pasoDe(cambio.moneda)}
                alCambiar={(unitario) => editar({ unitario, precioManual: true })}
                className={desviado ? 'border-amber-400 bg-amber-50' : ''}
              />
            </label>

            <CampoNumero
              etiqueta="Descuento %"
              aria-label={`Descuento porcentual de ${linea.descripcion}`}
              valor={linea.descuento}
              minimo={0}
              max={100}
              alCambiar={(descuento) => editar({ descuento: Math.min(100, descuento) })}
            />

            {producto?.medidas?.length ? (
              <label className="block">
                <span className="etiqueta">Medida</span>
                <select
                  className="campo"
                  aria-label={`Medida de ${linea.descripcion}`}
                  value={linea.medida ?? ''}
                  onChange={(evento) => editar({ medida: evento.currentTarget.value })}
                >
                  {producto.medidas.map((medida) => (
                    <option key={medida.nombre} value={medida.nombre}>
                      {medida.nombre}
                      {medida.cmAdicional ? ` (+${pesos(medida.cmAdicional)} COP/cm)` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2 py-1.5 text-sm text-neutral-700">
            <input
              type="checkbox"
              className="casilla shrink-0"
              checked={linea.conLogo}
              disabled={producto ? !producto.admiteLogo : false}
              aria-label={`Marcar ${linea.descripcion} con el logo del cliente`}
              onChange={(evento) => editar({ conLogo: evento.currentTarget.checked })}
            />
            Marcado con logo del cliente
            {producto && !producto.admiteLogo ? (
              <span className="text-xs text-neutral-400">(no disponible)</span>
            ) : null}
          </label>

          <Avisos
            linea={linea}
            alertas={alertas}
            cambio={cambio}
            oportunidad={oportunidad}
            margen={verMargen ? margen : null}
            costo={verMargen ? producto?.costoReferencia : undefined}
            notas={producto?.notas}
            alRestaurar={() => editar({ precioManual: false })}
            alSubirVolumen={(cantidad) => editar({ cantidad })}
          />
        </div>

        <div className="flex w-full items-center justify-between gap-3 border-t border-neutral-100 pt-3 lg:w-auto lg:shrink-0 lg:flex-col lg:items-end lg:gap-1 lg:border-0 lg:pt-0">
          <div className="flex items-baseline gap-2 lg:flex-col lg:items-end lg:gap-1">
            <span className="text-sm font-bold text-neutral-800">
              {dinero(totales.subtotal, cambio.moneda)}
            </span>
            <span className="text-xs text-neutral-500">
              + IVA {dinero(totales.iva, cambio.moneda)}
            </span>
          </div>
          <div className="flex gap-0.5 lg:mt-1">
            <BotonIcono
              titulo={`Subir ${linea.descripcion}`}
              disabled={esPrimera}
              onClick={() => despachar({ tipo: 'moverLinea', id: linea.id, direccion: -1 })}
            >
              ↑
            </BotonIcono>
            <BotonIcono
              titulo={`Bajar ${linea.descripcion}`}
              disabled={esUltima}
              onClick={() => despachar({ tipo: 'moverLinea', id: linea.id, direccion: 1 })}
            >
              ↓
            </BotonIcono>
            <BotonIcono
              titulo={`Quitar ${linea.descripcion}`}
              peligro
              onClick={() => despachar({ tipo: 'quitar', id: linea.id })}
            >
              ×
            </BotonIcono>
          </div>
        </div>
      </div>
    </li>
  );
}

function Avisos({
  linea,
  alertas,
  cambio,
  oportunidad,
  margen,
  costo,
  notas,
  alRestaurar,
  alSubirVolumen,
}: {
  linea: Linea;
  alertas: readonly Alerta[];
  cambio: Cambio;
  oportunidad: ReturnType<typeof oportunidadDeVolumen>;
  margen: number | null;
  costo?: number;
  notas?: readonly string[];
  alRestaurar: () => void;
  alSubirVolumen: (cantidad: number) => void;
}) {
  const avisos: React.ReactNode[] = [];
  /** Las alertas ya vienen en la moneda del documento; sólo hay que pintarlas. */
  const importe = (valor: number) => dinero(valor, cambio.moneda);
  /** Lo que viene del listado sí hay que convertirlo: allá todo es en pesos. */
  const delListado = (valorEnPesos: number) => importe(aMoneda(valorEnPesos, cambio));

  for (const alerta of alertas) {
    switch (alerta.tipo) {
      case 'referencia-desconocida':
        avisos.push(
          <span key="huerfana" className="font-semibold text-red-700">
            Esta referencia ya no está en el listado de precios. El valor mostrado es el que se
            guardó al armar la cotización y nadie puede verificarlo: confírmelo antes de enviar.
          </span>,
        );
        break;

      case 'precio-desactualizado':
        avisos.push(
          <span key="desactualizado" className="font-semibold text-red-700">
            El listado cambió: esta referencia pasó de {importe(alerta.guardado)} a{' '}
            {importe(alerta.vigente)}.{' '}
            <button type="button" className="underline" onClick={alRestaurar}>
              Actualizar al precio vigente
            </button>
          </span>,
        );
        break;

      case 'precio-manual':
        avisos.push(
          <span key="manual" className="text-amber-700">
            Precio editado a mano. El listado sugiere {importe(alerta.sugerido)} para{' '}
            {unidades(linea.cantidad)} unidades.{' '}
            <button type="button" className="font-bold underline" onClick={alRestaurar}>
              Usar el sugerido
            </button>
          </span>,
        );
        break;

      case 'bajo-minimo':
        avisos.push(
          <span key="minimo" className="text-amber-700">
            La cantidad está por debajo del mínimo publicado ({unidades(alerta.minimo)} unidades);
            se aplicó el precio del escalón más bajo. Confirme con producción antes de enviar.
          </span>,
        );
        break;
    }
  }

  if (oportunidad && oportunidad.ahorro > 0 && !linea.precioManual) {
    avisos.push(
      <span key="volumen" className="text-marca-700">
        Con {unidades(oportunidad.cantidad)} unidades el total baja{' '}
        {delListado(oportunidad.ahorro)} ({unidades(oportunidad.unidadesExtra)} más, a{' '}
        {delListado(oportunidad.unitario)} c/u).{' '}
        <button
          type="button"
          className="font-bold underline"
          onClick={() => alSubirVolumen(oportunidad.cantidad)}
        >
          Subir la cantidad
        </button>
      </span>,
    );
  }

  if (margen !== null && costo) {
    const tono = margen < 0.22 ? 'aviso' : 'exito';
    avisos.push(
      <span key="margen" className="inline-flex items-center gap-1.5">
        <Insignia tono={tono}>Margen {porcentaje(margen)}</Insignia>
        <span className="text-neutral-500">
          costo {pesos(costo)}
          {cambio.moneda === 'USD' ? ' COP' : ''}
        </span>
      </span>,
    );
  }

  // Las notas del Excel son útiles (recargos por centímetro, mínimos de
  // inyección, fletes) pero algunos productos arrastran media docena. Con dos
  // basta para avisar; el resto está en el listado.
  for (const nota of (notas ?? []).slice(0, 2)) {
    avisos.push(
      <span key={`nota-${nota}`} className="text-neutral-500">
        {nota}
      </span>,
    );
  }

  if (avisos.length === 0) return null;

  return (
    <ul className="space-y-1 text-xs">
      {avisos.map((aviso, indice) => (
        <li key={indice}>{aviso}</li>
      ))}
    </ul>
  );
}

function BotonIcono({
  children,
  titulo,
  peligro,
  ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { titulo: string; peligro?: boolean }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      // 44 px en móvil, que es el mínimo cómodo para el dedo; en escritorio
      // se compacta, porque ahí se apunta con el ratón.
      className={`flex size-11 items-center justify-center rounded-lg border border-neutral-200 text-sm transition disabled:opacity-30 lg:size-8 ${
        peligro
          ? 'text-neutral-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600'
          : 'text-neutral-500 hover:border-marca-300 hover:bg-marca-50 hover:text-marca-700'
      }`}
      {...resto}
    >
      {children}
    </button>
  );
}
