/**
 * Qué dice el correo de una cotización.
 *
 * Vive en el cotizador y **lo importa el Worker**, igual que ya hacía con
 * `totalesDeCotizacion`: son las cifras del documento, y calcularlas dos veces
 * sería tener dos respuestas para la misma pregunta.
 *
 * Que sea una sola función es lo que hace que la vista previa del navegador
 * enseñe **exactamente** el correo que va a salir. El servidor la llama con la
 * cotización que tiene guardada; la pantalla, con la que está en la mano. Si
 * fueran dos, la vista previa acabaría enseñando un total viejo.
 */

import { dinero, fechaLarga } from '../dominio/formato';
import { cambioDe } from '../dominio/moneda';
import { totalesDeCotizacion } from '../dominio/precios';
import type { Cotizacion } from '../dominio/tipos';

/** Los valores que la plantilla `cotizacion` necesita, ya formateados. */
export function datosDeLaCotizacion(
  documento: Cotizacion,
  numero: string,
  mensaje: string,
): Record<string, string> {
  const cambio = cambioDe(documento);
  const totales = totalesDeCotizacion(documento.lineas, documento.iva, cambio.moneda);

  return {
    // Se saluda al contacto si lo hay; si no, a la empresa. Un «Hola,» a secas
    // es mejor que un «Hola Distribuidora La Sabana S.A.S.,» cuando hay nombre.
    nombreCliente: documento.cliente?.contacto || documento.cliente?.empresa || '',
    numero,
    fecha: fechaLarga(documento.fecha),
    total: dinero(totales.total, cambio.moneda),
    validez: documento.condiciones?.validezDias ? `${documento.condiciones.validezDias} días` : '',
    entrega: documento.condiciones?.tiempoEntrega ?? '',
    pago: documento.condiciones?.formaPago ?? '',
    mensaje,
  };
}

/** El mensaje con el que arranca la ventana de envío. */
export function mensajeSugerido(documento: Cotizacion): string {
  const empresa = documento.cliente?.empresa?.trim();
  return (
    `Gracias por su interés en nuestros productos${empresa ? '' : ''}. ` +
    'Cualquier ajuste en cantidades o condiciones lo revisamos con gusto.'
  );
}
