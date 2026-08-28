/**
 * Las pantallas del cotizador: armar, consultar el historial y los clientes.
 *
 * Con el fragmento (`#/clientes/CLI-0007`) y no con rutas de verdad. Así el
 * servidor no tiene que saber nada de rutas —cualquier hosting estático sirve
 * el mismo `index.html`— y el enlace se puede compartir y recargar sin dar un
 * 404. Con tres pantallas sigue sin compensar traer un enrutador entero.
 *
 * Que la ficha de un cliente tenga dirección propia no es un adorno: es lo que
 * permite que la portada del hub lleve directo a `#/clientes` y que un enlace
 * a una ficha concreta se pueda pegar en un chat.
 */

import { useCallback, useEffect, useState } from 'react';

export type Vista = 'cotizador' | 'historial' | 'clientes';

export interface Ruta {
  vista: Vista;
  /** Qué ficha está abierta dentro de `clientes`. `nuevo` es el alta. */
  codigo?: string;
}

function rutaActual(): Ruta {
  const partes = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [vista, codigo] = partes;

  if (vista === 'historial') return { vista: 'historial' };
  if (vista === 'clientes') return { vista: 'clientes', codigo: codigo ? decodeURIComponent(codigo) : undefined };
  return { vista: 'cotizador' };
}

function comoTexto(vista: Vista, codigo?: string): string {
  if (vista === 'historial') return '#/historial';
  if (vista === 'clientes') return codigo ? `#/clientes/${encodeURIComponent(codigo)}` : '#/clientes';
  return '#/';
}

export function useRuta(): [Ruta, (vista: Vista, codigo?: string) => void] {
  const [ruta, setRuta] = useState<Ruta>(rutaActual);

  useEffect(() => {
    // Cubre el botón «atrás» del navegador, que cambia el fragmento sin pasar
    // por `ir`.
    const alCambiar = () => setRuta(rutaActual());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  // Estable entre dibujados: la pantalla de clientes lo usa dentro de un
  // `useEffect`, y una función nueva en cada vuelta lo dispararía sin parar.
  const ir = useCallback((vista: Vista, codigo?: string) => {
    window.location.hash = comoTexto(vista, codigo);
    setRuta({ vista, codigo });
  }, []);

  return [ruta, ir];
}
