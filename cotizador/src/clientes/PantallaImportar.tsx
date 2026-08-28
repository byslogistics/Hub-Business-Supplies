/**
 * Cargar clientes desde una hoja de cálculo, en dos pasos y nunca en uno.
 *
 * Primero se sube el archivo y el servidor dice **qué pasaría con cada fila sin
 * escribir nada**; sólo después, con eso a la vista y aprobado, se escribe. Es
 * la misma idea que la papelera del historial: una operación que toca cientos
 * de fichas de una vez se equivoca en grande y en silencio, y poner una
 * pantalla en medio convierte «subí el archivo que no era» en un susto de diez
 * segundos.
 *
 * Las filas dudosas —las que se parecen a una ficha que ya existe sin ser
 * idénticas— **no se importan solas**. Cada una trae sus tres botones y hasta
 * que alguien elija se quedan fuera. Es lento a propósito: fusionar dos
 * clientes por parecido es de las pocas cosas de este hub que no se deshacen.
 */

import { useState } from 'react';

import type {
  AccionFila,
  FilaImportacion,
  FilaRevisada,
  ResultadoImportacion,
  RevisionImportacion,
} from '../../../compartido/importacion';
import { FalloApi } from '../api/fallo';
import { Insignia } from '../ui/componentes';
import { clientes } from './almacen';
import { csvDePlantilla, descargarCsv } from './exportar';
import { ArchivoIlegible, EXTENSIONES, leerArchivo, type ArchivoLeido } from './leerArchivo';

interface Props {
  alVolver: () => void;
  /** Se llama al terminar, para que la lista se recargue con lo nuevo. */
  alTerminar: (resultado: ResultadoImportacion) => void;
}

/** Cómo se llama y de qué color va cada desenlace posible de una fila. */
const ACCIONES: Record<AccionFila, { titulo: string; tono: 'exito' | 'marca' | 'aviso' | 'neutro'; explica: string }> = {
  crear: { titulo: 'Se crean', tono: 'exito', explica: 'No están en la base. Entran como fichas nuevas.' },
  completar: {
    titulo: 'Se completan',
    tono: 'marca',
    explica: 'Ya existen. Se les llenan los campos que tengan vacíos; lo que ya está escrito no se toca.',
  },
  revisar: {
    titulo: 'Hay que decidir',
    tono: 'aviso',
    explica: 'Se parecen a una ficha que ya existe. No se importan hasta que usted diga qué son.',
  },
  error: { titulo: 'No se pueden usar', tono: 'neutro', explica: 'Se quedan fuera. El motivo va en cada fila.' },
  omitir: { titulo: 'Se dejan fuera', tono: 'neutro', explica: 'No hay nada que hacer con ellas.' },
};

const ORDEN: AccionFila[] = ['revisar', 'crear', 'completar', 'error', 'omitir'];

export function PantallaImportar({ alVolver, alTerminar }: Props) {
  const [leido, setLeido] = useState<ArchivoLeido | null>(null);
  const [revision, setRevision] = useState<RevisionImportacion | null>(null);
  const [decisiones, setDecisiones] = useState<Record<number, FilaImportacion['decision']>>({});
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState('');

  /** Las filas con la decisión que se haya tomado para cada una. */
  const conDecisiones = (): FilaImportacion[] =>
    (leido?.filas ?? []).map((fila) => ({ ...fila, decision: decisiones[fila.linea] }));

  const revisarCon = async (filas: FilaImportacion[]) => {
    setTrabajando(true);
    setFallo('');
    try {
      setRevision(await clientes.revisarImportacion(filas));
    } catch (error) {
      setRevision(null);
      setFallo(error instanceof FalloApi ? error.mensaje : 'No se pudo revisar el archivo.');
    } finally {
      setTrabajando(false);
    }
  };

  const elegirArchivo = async (archivo: File | undefined) => {
    if (!archivo || trabajando) return;
    setFallo('');
    setRevision(null);
    setDecisiones({});
    setTrabajando(true);

    try {
      const leidoAhora = await leerArchivo(archivo);
      setLeido(leidoAhora);
      setTrabajando(false);
      await revisarCon(leidoAhora.filas);
    } catch (error) {
      setLeido(null);
      setTrabajando(false);
      setFallo(
        error instanceof ArchivoIlegible
          ? error.message
          : 'No se pudo leer el archivo. Compruebe que sea un Excel o un CSV.',
      );
    }
  };

  const decidir = (linea: number, decision: FilaImportacion['decision']) => {
    const siguientes = { ...decisiones, [linea]: decision };
    setDecisiones(siguientes);
    // Se vuelve a revisar entera: una decisión cambia el recuento de arriba, y
    // enseñar un resumen viejo junto a una fila ya decidida sería mentir sobre
    // lo que va a pasar al pulsar el botón.
    void revisarCon(
      (leido?.filas ?? []).map((fila) => ({ ...fila, decision: siguientes[fila.linea] })),
    );
  };

  const confirmar = async () => {
    if (trabajando || !revision) return;
    setTrabajando(true);
    setFallo('');
    try {
      alTerminar(await clientes.confirmarImportacion(conDecisiones()));
    } catch (error) {
      setFallo(error instanceof FalloApi ? error.mensaje : 'No se pudo incorporar el archivo.');
      setTrabajando(false);
    }
  };

  const aEscribir = revision ? revision.resumen.crear + revision.resumen.completar : 0;
  const sinDecidir = revision?.resumen.revisar ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-neutral-800">Cargar clientes desde un archivo</h1>
          <p className="text-sm text-neutral-500">
            Nada se guarda hasta que usted vea qué va a pasar con cada fila y lo apruebe.
          </p>
        </div>
        <button type="button" className="boton-secundario" onClick={alVolver}>
          Volver a la lista
        </button>
      </div>

      {fallo ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          {fallo}
        </p>
      ) : null}

      <section className="tarjeta grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-bold text-neutral-800">1 · La plantilla</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Trae los títulos correctos y tres clientes de ejemplo ya llenos, para no tener que
            adivinar qué va en cada columna. Se abre con doble clic en Excel.
          </p>
          <button
            type="button"
            className="boton-secundario mt-3"
            onClick={() => descargarCsv(csvDePlantilla(), 'plantilla-clientes.csv')}
          >
            Descargar plantilla
          </button>
        </div>

        <div>
          <h2 className="text-sm font-bold text-neutral-800">2 · El archivo lleno</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Excel (<code className="rounded bg-neutral-100 px-1">.xlsx</code>) o CSV. Si el suyo ya
            tiene otros títulos, no hace falta renombrarlos: se reconocen los más comunes.
          </p>
          <label className="boton-primario mt-3 cursor-pointer">
            {trabajando && !revision ? 'Leyendo…' : 'Elegir archivo'}
            <input
              type="file"
              accept={EXTENSIONES}
              className="sr-only"
              disabled={trabajando}
              onChange={(e) => void elegirArchivo(e.currentTarget.files?.[0])}
            />
          </label>
        </div>
      </section>

      {leido ? <Leido leido={leido} /> : null}

      {revision ? (
        <>
          <section className="tarjeta p-5">
            <h2 className="text-sm font-bold text-neutral-800">Esto es lo que va a pasar</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ORDEN.filter((accion) => revision.resumen[accion] > 0).map((accion) => (
                <div key={accion} className="rounded-xl border border-neutral-200 p-3">
                  <p className="text-2xl font-bold text-neutral-900">{revision.resumen[accion]}</p>
                  <p className="text-sm font-bold text-neutral-700">{ACCIONES[accion].titulo}</p>
                  <p className="mt-1 text-xs text-neutral-500">{ACCIONES[accion].explica}</p>
                </div>
              ))}
            </div>
          </section>

          {ORDEN.filter((accion) => revision.resumen[accion] > 0).map((accion) => (
            <Grupo
              key={accion}
              accion={accion}
              filas={revision.filas.filter((f) => f.accion === accion)}
              decisiones={decisiones}
              alDecidir={decidir}
              trabajando={trabajando}
            />
          ))}

          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
            <p className="mr-auto text-sm text-neutral-600">
              {aEscribir === 0
                ? 'Con lo elegido ahora mismo no se guardaría nada.'
                : `Se van a guardar ${aEscribir === 1 ? '1 cliente' : `${aEscribir} clientes`}.`}
              {sinDecidir > 0 ? (
                <span className="block text-xs font-bold text-amber-700">
                  {sinDecidir === 1
                    ? 'Queda 1 fila sin decidir; se quedará fuera.'
                    : `Quedan ${sinDecidir} filas sin decidir; se quedarán fuera.`}
                </span>
              ) : null}
            </p>
            <button type="button" className="boton-secundario" onClick={alVolver} disabled={trabajando}>
              Cancelar
            </button>
            <button
              type="button"
              className="boton-primario"
              onClick={() => void confirmar()}
              disabled={trabajando || aEscribir === 0}
            >
              {trabajando ? 'Trabajando…' : `Incorporar ${aEscribir === 1 ? '1 cliente' : `${aEscribir} clientes`}`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Qué se leyó del archivo, antes de hablar de clientes. */
function Leido({ leido }: { leido: ArchivoLeido }) {
  const avisos: string[] = [];
  if (leido.hoja && (leido.hojasIgnoradas?.length ?? 0) > 0) {
    avisos.push(
      `Se leyó la hoja «${leido.hoja}». Las demás (${leido.hojasIgnoradas!.join(', ')}) se dejaron fuera.`,
    );
  }
  if (leido.ignoradas.length > 0) {
    avisos.push(`Columnas que no se reconocieron y se ignoran: ${leido.ignoradas.join(', ')}.`);
  }
  if (leido.vacias > 0) {
    avisos.push(`${leido.vacias} ${leido.vacias === 1 ? 'fila vacía' : 'filas vacías'} descartadas.`);
  }

  return (
    <section className="tarjeta p-4 text-sm">
      <p className="font-bold text-neutral-800">
        {leido.filas.length === 1 ? '1 fila leída' : `${leido.filas.length} filas leídas`} del archivo.
      </p>
      {avisos.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-600">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Grupo({
  accion,
  filas,
  decisiones,
  alDecidir,
  trabajando,
}: {
  accion: AccionFila;
  filas: FilaRevisada[];
  decisiones: Record<number, FilaImportacion['decision']>;
  alDecidir: (linea: number, decision: FilaImportacion['decision']) => void;
  trabajando: boolean;
}) {
  // Las que hay que decidir van abiertas: son las únicas que piden algo.
  const [abierto, setAbierto] = useState(accion === 'revisar');
  const { titulo, tono } = ACCIONES[accion];

  return (
    <section className="tarjeta overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <Insignia tono={tono}>{filas.length}</Insignia>
        <span className="font-bold text-neutral-800">{titulo}</span>
        <span className="ml-auto text-sm text-neutral-500">{abierto ? 'Ocultar' : 'Ver'}</span>
      </button>

      {abierto ? (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
          {filas.map((fila) => (
            <li key={fila.linea} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-xs text-neutral-400">Fila {fila.linea}</span>
                <span className="font-bold text-neutral-800">{fila.nombre}</span>
              </div>
              <p className="text-sm text-neutral-600">{fila.motivo}</p>

              {fila.rellenar && fila.rellenar.length > 0 ? (
                <p className="mt-1 text-sm text-emerald-700">
                  Se llenan: {fila.rellenar.join(', ')}.
                </p>
              ) : null}

              {fila.conflictos && fila.conflictos.length > 0 ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm">
                  <p className="font-bold text-amber-900">
                    Estos datos son distintos y <strong>no se van a tocar</strong>:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-amber-800">
                    {fila.conflictos.map((conflicto) => (
                      <li key={conflicto.campo}>
                        <strong>{conflicto.campo}</strong>: la ficha dice «{conflicto.actual}» y el
                        archivo «{conflicto.nuevo}».
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {accion === 'revisar' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ['completar', `Es el mismo · completar ${fila.codigo}`],
                      ['crear', 'Es otro · crear ficha nueva'],
                      ['omitir', 'Dejarla fuera'],
                    ] as const
                  ).map(([decision, texto]) => (
                    <button
                      key={decision}
                      type="button"
                      className={`boton text-sm ${
                        decisiones[fila.linea] === decision
                          ? 'bg-marca-600 text-white'
                          : 'border border-neutral-300 bg-white text-neutral-700'
                      }`}
                      disabled={trabajando}
                      onClick={() => alDecidir(fila.linea, decision)}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
