/**
 * «¿Para qué cliente es esta cotización?».
 *
 * Va arriba de los datos del cliente y no es obligatorio: se puede seguir
 * escribiendo a mano como siempre, y al emitir la ficha se crea sola. Obligar a
 * elegir antes de empezar estorbaría en la cotización de afán, que es justo
 * cuando nadie quiere pelearse con un buscador.
 *
 * Lo que gana quien sí lo usa es no volver a teclear un NIT: se elige y los seis
 * campos se llenan solos, con lo que la ficha tenga hoy.
 */

import { useEffect, useRef, useState } from 'react';

import type { Cliente as FichaCliente } from '../../../compartido/clientes';
import { FalloApi } from '../api/fallo';
import { clientes } from './almacen';

interface Props {
  /** El código enlazado, si la cotización ya tiene uno. */
  codigo?: string;
  alElegir: (ficha: FichaCliente | null) => void;
}

/** Cuánto se espera antes de buscar, para no pedir en cada tecla. */
const ESPERA = 250;

export function BuscadorCliente({ codigo, alElegir }: Props) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<FichaCliente[] | null>(null);
  const [enlazado, setEnlazado] = useState<FichaCliente | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState('');
  const caja = useRef<HTMLDivElement>(null);

  // La ficha enlazada se pide por su código: se puede llegar aquí con un
  // borrador recuperado de ayer, sin haber pasado por el buscador.
  useEffect(() => {
    if (!codigo) {
      setEnlazado(null);
      return;
    }

    let vigente = true;
    clientes
      .abrir(codigo)
      .then((ficha) => vigente && setEnlazado(ficha))
      .catch(() => vigente && setEnlazado(null));

    return () => {
      vigente = false;
    };
  }, [codigo]);

  // Se busca al parar de escribir, no en cada tecla.
  useEffect(() => {
    const aguja = texto.trim();
    if (aguja.length < 2) {
      setResultados(null);
      return;
    }

    let vigente = true;
    const reloj = setTimeout(() => {
      setBuscando(true);
      setFallo('');
      clientes
        .listar({ texto: aguja })
        .then((pagina) => vigente && setResultados(pagina.clientes))
        .catch((error: unknown) => {
          if (!vigente) return;
          setResultados([]);
          setFallo(error instanceof FalloApi ? error.mensaje : 'No se pudo buscar.');
        })
        .finally(() => vigente && setBuscando(false));
    }, ESPERA);

    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [texto]);

  // Cerrar la lista al pulsar fuera: si no, se queda tapando el formulario.
  useEffect(() => {
    const alPulsar = (evento: MouseEvent) => {
      if (caja.current && !caja.current.contains(evento.target as Node)) setResultados(null);
    };
    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
  }, []);

  if (enlazado) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-marca-200 bg-marca-50 px-3 py-2">
        <span className="text-xs font-bold tracking-wide text-marca-700 uppercase">Ficha</span>
        <span className="font-bold text-marca-900">{enlazado.empresa}</span>
        <span className="font-mono text-xs text-marca-700">{enlazado.codigo}</span>
        <button
          type="button"
          className="ml-auto py-1 text-sm font-bold text-marca-700 underline"
          onClick={() => alElegir(null)}
        >
          Quitar
        </button>
      </div>
    );
  }

  return (
    <div ref={caja} className="relative">
      <label className="block">
        <span className="etiqueta">Buscar un cliente ya registrado</span>
        <input
          type="search"
          className="campo"
          value={texto}
          placeholder="Nombre, NIT o correo"
          autoComplete="off"
          onChange={(e) => setTexto(e.currentTarget.value)}
        />
      </label>
      <p className="mt-1 text-xs text-neutral-500">
        Opcional. Si no está, escriba los datos abajo y la ficha se crea sola al emitir.
      </p>

      {fallo ? <p className="mt-1 text-xs font-semibold text-red-700">{fallo}</p> : null}

      {resultados ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-neutral-300 bg-white shadow-lg">
          {buscando && resultados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-neutral-500">Buscando…</p>
          ) : resultados.length === 0 ? (
            <div className="px-3 py-3">
              <p className="text-sm text-neutral-600">Ningún cliente coincide con «{texto.trim()}».</p>
              <p className="mt-1 text-xs text-neutral-500">
                Escriba los datos abajo y la ficha se crea sola al emitir. No hace falta ir a
                ningún otro sitio.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {resultados.map((ficha) => (
                <li key={ficha.codigo}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-neutral-50"
                    onClick={() => {
                      alElegir(ficha);
                      setTexto('');
                      setResultados(null);
                    }}
                  >
                    <span className="block font-bold text-neutral-800">{ficha.empresa}</span>
                    <span className="block text-xs text-neutral-500">
                      {[ficha.codigo, ficha.nit, ficha.ciudad, ficha.correo].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
