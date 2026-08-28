/**
 * Estado de la cotización en curso.
 *
 * Un `useReducer` en lugar de varios `useState` porque casi ninguna acción es
 * independiente: añadir una línea puede recalcular precios, cambiar de
 * plantilla reescribe las condiciones, y todo hay que persistirlo junto.
 */

import { useEffect, useMemo, useReducer } from 'react';

import type { Cliente as FichaCliente } from '../../../compartido/clientes';
import { PLANTILLAS, type ClavePlantilla } from '../datos/condiciones';
import { catalogo, productoPorId } from '../dominio/catalogo';
import {
  actualizarLinea,
  convertirCotizacion,
  cotizacionNueva,
  descartarBorrador,
  guardarBorrador,
  lineaDesdeProducto,
  normalizar,
  recuperarBorrador,
} from '../dominio/cotizacion';
import { cambioDe, type Cambio } from '../dominio/moneda';
import { totalesDeCotizacion } from '../dominio/precios';
import { revisarCotizacion } from '../dominio/revision';
import type { Cliente, Condiciones, Cotizacion, Linea, Producto } from '../dominio/tipos';

type Accion =
  | { tipo: 'agregar'; producto: Producto }
  | { tipo: 'quitar'; id: string }
  | { tipo: 'editarLinea'; id: string; cambios: Partial<Linea> }
  | { tipo: 'moverLinea'; id: string; direccion: -1 | 1 }
  | { tipo: 'editarCliente'; cambios: Partial<Cliente> }
  /** Enlaza la cotización con una ficha y copia sus datos. `null` desenlaza. */
  | { tipo: 'elegirCliente'; ficha: FichaCliente | null }
  | { tipo: 'editarCondiciones'; cambios: Partial<Condiciones> }
  | { tipo: 'aplicarPlantilla'; clave: ClavePlantilla }
  | {
      tipo: 'editarCabecera';
      cambios: Partial<Pick<Cotizacion, 'asesor' | 'fecha' | 'numero' | 'iva' | 'clienteCodigo'>>;
    }
  /** Pasa la cotización a otra moneda, o a otra tasa dentro de la misma. */
  | { tipo: 'cambiarDivisa'; cambio: Cambio }
  | { tipo: 'reiniciar' }
  | { tipo: 'numeroAsignado'; numero: string }
  | { tipo: 'cargar'; cotizacion: Cotizacion }
  | { tipo: 'actualizarPrecios' };

function reducir(estado: Cotizacion, accion: Accion): Cotizacion {
  switch (accion.tipo) {
    case 'agregar': {
      // El mismo producto puede ir dos veces (con y sin logo, dos medidas),
      // así que se añade siempre una línea nueva en vez de sumar cantidades.
      return {
        ...estado,
        lineas: [...estado.lineas, lineaDesdeProducto(accion.producto, {}, cambioDe(estado))],
      };
    }

    case 'quitar':
      return { ...estado, lineas: estado.lineas.filter((l) => l.id !== accion.id) };

    case 'editarLinea':
      return {
        ...estado,
        lineas: estado.lineas.map((linea) =>
          linea.id === accion.id
            ? actualizarLinea(
                linea,
                accion.cambios,
                productoPorId(linea.productoId),
                cambioDe(estado),
              )
            : linea,
        ),
      };

    case 'moverLinea': {
      const desde = estado.lineas.findIndex((l) => l.id === accion.id);
      const hasta = desde + accion.direccion;
      if (desde < 0 || hasta < 0 || hasta >= estado.lineas.length) return estado;
      const lineas = [...estado.lineas];
      const [movida] = lineas.splice(desde, 1);
      lineas.splice(hasta, 0, movida!);
      return { ...estado, lineas };
    }

    case 'editarCliente':
      // Editar un campo **no** desenlaza: corregir el teléfono de un cliente
      // enlazado es corriente, y lo que se haga con esa corrección se decide al
      // emitir, no mientras se escribe.
      return { ...estado, cliente: { ...estado.cliente, ...accion.cambios } };

    case 'elegirCliente': {
      if (!accion.ficha) {
        // Desenlazar deja los datos escritos donde están: quien lo hace quiere
        // soltar la ficha, no vaciar la cotización que está armando.
        return { ...estado, clienteCodigo: undefined };
      }

      const { ficha } = accion;
      return {
        ...estado,
        clienteCodigo: ficha.codigo,
        cliente: {
          ...estado.cliente,
          empresa: ficha.empresa,
          nit: ficha.nit,
          contacto: ficha.contacto,
          telefono: ficha.telefono || ficha.whatsapp,
          email: ficha.correo,
          ciudad: ficha.ciudad,
        },
      };
    }

    case 'editarCondiciones':
      return { ...estado, condiciones: { ...estado.condiciones, ...accion.cambios } };

    case 'aplicarPlantilla': {
      const plantilla = PLANTILLAS.find((p) => p.clave === accion.clave);
      if (!plantilla) return estado;
      // Las observaciones son del asesor, no de la plantilla: se conservan.
      return {
        ...estado,
        condiciones: {
          ...plantilla.condiciones,
          incluye: [...plantilla.condiciones.incluye],
          observaciones: estado.condiciones.observaciones,
        },
      };
    }

    case 'editarCabecera':
      return { ...estado, ...accion.cambios };

    case 'numeroAsignado':
      // El consecutivo se gasta al emitir, no al abrir la pantalla: una
      // cotización que nadie llegó a enviar no deja hueco en la numeración.
      // El número viene del servidor, que es el único que puede saberlo
      // cuando hay más de una persona cotizando.
      return { ...estado, numero: accion.numero };

    case 'cambiarDivisa':
      return convertirCotizacion(estado, accion.cambio);

    case 'cargar':
      // Una cotización traída del historial. Entra tal cual quedó emitida
      // —con su número, su IVA, su moneda y sus precios— y a partir de ahí se
      // edita como cualquier otra; al volver a emitirla se actualiza la
      // guardada. `normalizar` completa lo que las emitidas antiguas no traen.
      return normalizar(accion.cotizacion);

    case 'actualizarPrecios': {
      // Vuelve a pedirle el precio al listado vigente en todas las líneas que
      // no lleven precio escrito a mano, y deja constancia de con qué versión
      // del catálogo quedó calculada la cotización.
      const cambio = cambioDe(estado);
      const lineas = estado.lineas.map((linea) => {
        const producto = productoPorId(linea.productoId);
        if (!producto || linea.precioManual) return linea;
        return actualizarLinea(linea, { precioManual: false }, producto, cambio);
      });
      return { ...estado, lineas, catalogoVersion: catalogo.version };
    }

    case 'reiniciar':
      descartarBorrador();
      return cotizacionNueva();

    default:
      return estado;
  }
}

export function useCotizacion() {
  const [cotizacion, despachar] = useReducer(
    reducir,
    null,
    () => recuperarBorrador() ?? cotizacionNueva(),
  );

  useEffect(() => {
    guardarBorrador(cotizacion);
  }, [cotizacion]);

  /** La moneda de la cotización y su tasa, que casi todo lo demás necesita. */
  const cambio = useMemo(() => cambioDe(cotizacion), [cotizacion.moneda, cotizacion.tasa]);

  const totales = useMemo(
    () => totalesDeCotizacion(cotizacion.lineas, cotizacion.iva, cambio.moneda),
    [cotizacion.lineas, cotizacion.iva, cambio.moneda],
  );

  /** Ids de productos ya presentes, para marcarlos en el catálogo. */
  const productosEnUso = useMemo(
    () => new Set(cotizacion.lineas.map((l) => l.productoId)),
    [cotizacion.lineas],
  );

  const revision = useMemo(
    () => revisarCotizacion(cotizacion.lineas, productoPorId, cambio),
    [cotizacion.lineas, cambio],
  );

  /** Alertas indexadas por línea, para que cada tarjeta pinte las suyas. */
  const alertasPorLinea = useMemo(
    () => new Map(revision.porLinea.map((r) => [r.lineaId, r.alertas])),
    [revision],
  );

  return { cotizacion, despachar, totales, cambio, productosEnUso, revision, alertasPorLinea };
}

export type Despachar = ReturnType<typeof useCotizacion>['despachar'];
