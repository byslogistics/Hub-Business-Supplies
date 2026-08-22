/**
 * El historial de mentira, para la vista previa.
 *
 * Existe por una razón concreta: enseñar cómo va a quedar la herramienta antes
 * de montar nada en Cloudflare. En GitHub Pages no hay servidor, y sin servidor
 * el cotizador no deja ni emitir —el número lo da la base—, así que un preview
 * a secas no enseñaría ni el PDF ni el historial, que es justo lo que hay que
 * enseñar.
 *
 * Guarda en `localStorage` del navegador de quien mira. No es un historial
 * compartido y no pretende serlo: cada persona ve lo que ella misma emitió, y
 * los números salen como `COT-DEMO-0001` para que ningún PDF de éstos se pueda
 * confundir con uno de verdad.
 *
 * Sólo entra en juego cuando se construye con `VITE_DEMO=1`, que es lo que
 * hace el flujo de la vista previa y nunca el despliegue de producción.
 */

import {
  mismoCliente,
  POR_PAGINA,
  type CotizacionGuardada,
  type Estado,
  type FiltroHistorial,
  type PaginaHistorial,
  type ResumenCotizacion,
} from '../../../compartido/historial';
import { totalesDeCotizacion } from '../dominio/precios';
import type { Cotizacion } from '../dominio/tipos';
import { FalloHistorial, type Almacen } from './contrato';

const CLAVE = 'bys-cotizador:demostracion';
const CORREO = 'demostracion@byslogistics.com.co';

type Guardadas = Record<string, CotizacionGuardada<Cotizacion>>;

function leer(): Guardadas {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Guardadas) : {};
  } catch {
    return {};
  }
}

function escribir(guardadas: Guardadas): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(guardadas));
  } catch {
    throw new FalloHistorial(
      'fallo',
      'El navegador no deja guardar más. Es una demostración: borre datos del sitio y siga.',
    );
  }
}

/** `COT-DEMO-0007`, uno más que el mayor que haya. */
function siguienteNumero(guardadas: Guardadas): string {
  const mayor = Object.keys(guardadas).reduce((alto, numero) => {
    const cifras = /^COT-DEMO-(\d+)$/.exec(numero);
    return cifras ? Math.max(alto, Number(cifras[1])) : alto;
  }, 0);
  return `COT-DEMO-${String(mayor + 1).padStart(4, '0')}`;
}

/**
 * Las mismas reglas de filtrado que aplica el Worker, repetidas aquí.
 *
 * Repetidas y no compartidas a propósito: allá son cláusulas de SQL y aquí es
 * JavaScript sobre un objeto. Lo que importa es que el preview se comporte
 * igual que lo que vendrá después, no que compartan implementación.
 */
function cumple(guardada: CotizacionGuardada<Cotizacion>, filtro: FiltroHistorial): boolean {
  const texto = filtro.texto?.trim().toLowerCase();
  if (texto) {
    const donde = [guardada.numero, guardada.cliente, guardada.nit, guardada.contacto]
      .join(' ')
      .toLowerCase();
    if (!donde.includes(texto)) return false;
  }
  if (filtro.estado && guardada.estado !== filtro.estado) return false;
  if (filtro.desde && guardada.emitidaEn < `${filtro.desde}T00:00:00.000Z`) return false;
  if (filtro.hasta && guardada.emitidaEn > `${filtro.hasta}T23:59:59.999Z`) return false;
  return true;
}

function aResumen(guardada: CotizacionGuardada<Cotizacion>): ResumenCotizacion {
  const { documento: _documento, ...resumen } = guardada;
  return resumen;
}

export const almacenLocal: Almacen = {
  yo: async () => ({ correo: CORREO }),

  registrar: async (cotizacion) => {
    if (cotizacion.lineas.length === 0) {
      throw new FalloHistorial('invalida', 'Una cotización sin líneas no se emite.');
    }

    const guardadas = leer();
    const numero = cotizacion.numero || siguienteNumero(guardadas);
    const emitidaEn = new Date().toISOString();
    const totales = totalesDeCotizacion(cotizacion.lineas, cotizacion.iva);
    const previa = guardadas[numero];

    // La misma guarda que el Worker: un número escrito a mano no se lleva por
    // delante la cotización de otro cliente. Reemitir la propia —el PDF y
    // luego el WhatsApp— sigue actualizando la que ya está.
    if (
      cotizacion.numero &&
      previa &&
      !mismoCliente(
        { empresa: previa.cliente, nit: previa.nit },
        { empresa: cotizacion.cliente?.empresa ?? '', nit: cotizacion.cliente?.nit ?? '' },
      )
    ) {
      throw new FalloHistorial(
        'numero-ocupado',
        `El número ${numero} ya es de una cotización${previa.cliente ? ` de ${previa.cliente}` : ''}. ` +
          'Verifique el número, o deje el campo vacío para que se asigne el siguiente.',
      );
    }

    guardadas[numero] = {
      numero,
      fecha: cotizacion.fecha,
      // Reemitir no cambia cuándo salió por primera vez, igual que en el Worker.
      emitidaEn: previa?.emitidaEn ?? emitidaEn,
      autor: CORREO,
      asesor: cotizacion.asesor ?? '',
      cliente: cotizacion.cliente?.empresa ?? '',
      nit: cotizacion.cliente?.nit ?? '',
      contacto: cotizacion.cliente?.contacto ?? '',
      total: Math.round(totales.total),
      unidades: Math.round(totales.unidades),
      // El seguimiento comercial sobrevive a una reemisión.
      estado: previa?.estado ?? 'emitida',
      estadoNota: previa?.estadoNota ?? '',
      estadoEn: previa?.estadoEn ?? null,
      estadoPor: previa?.estadoPor ?? null,
      documento: { ...cotizacion, numero },
    };

    escribir(guardadas);
    return { numero, emitidaEn };
  },

  listar: async (filtro) => {
    const todas = Object.values(leer())
      .filter((guardada) => cumple(guardada, filtro))
      .sort((a, b) => b.emitidaEn.localeCompare(a.emitidaEn));

    const pagina = Math.max(1, filtro.pagina ?? 1);
    const desde = (pagina - 1) * POR_PAGINA;

    return {
      cotizaciones: todas.slice(desde, desde + POR_PAGINA).map(aResumen),
      cuantas: todas.length,
      sumaTotales: todas.reduce((suma, guardada) => suma + guardada.total, 0),
      pagina,
      porPagina: POR_PAGINA,
    } satisfies PaginaHistorial;
  },

  abrir: async (numero) => {
    const guardada = leer()[numero];
    if (!guardada) {
      throw new FalloHistorial('no-encontrada', `No hay ninguna cotización ${numero}.`);
    }
    return guardada;
  },

  marcar: async (numero, estado: Estado, nota) => {
    const guardadas = leer();
    const guardada = guardadas[numero];
    if (!guardada) {
      throw new FalloHistorial('no-encontrada', `No hay ninguna cotización ${numero}.`);
    }

    guardadas[numero] = {
      ...guardada,
      estado,
      estadoNota: nota,
      estadoEn: new Date().toISOString(),
      estadoPor: CORREO,
    };
    escribir(guardadas);
  },
};
