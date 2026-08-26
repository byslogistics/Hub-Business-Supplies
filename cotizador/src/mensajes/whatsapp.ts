/**
 * Mensaje de WhatsApp de la cotización.
 *
 * El área comercial ya trabaja así: la hoja COTIZADOR del Excel tiene
 * plantillas con emojis que se copian y se pegan en el chat. Se conserva ese
 * formato —es el que los clientes reconocen— pero se arma desde la misma
 * cotización que produce el PDF, en lugar de escribirlo a mano cada vez.
 */

import { EMPRESA } from '../datos/empresa';
import { dinero, fechaCorta, monedaDeclarada, sumarDias, unidades } from '../dominio/formato';
import { cambioDe } from '../dominio/moneda';
import { totalesDeCotizacion, totalesDeLinea } from '../dominio/precios';
import type { Cotizacion } from '../dominio/tipos';

const SEPARADOR = '━━━━━━━━━━━━━━━━━━';

export function mensajeWhatsapp(cotizacion: Cotizacion, iva: number): string {
  const { cliente, condiciones } = cotizacion;
  const cambio = cambioDe(cotizacion);
  const totales = totalesDeCotizacion(cotizacion.lineas, iva, cambio.moneda);
  const importe = (valor: number) => dinero(valor, cambio.moneda);
  const bloques: string[] = [];

  bloques.push(
    [
      SEPARADOR,
      `🏢 ${EMPRESA.razonSocial}`,
      `NIT: ${EMPRESA.nit}`,
      `📍 ${EMPRESA.direccion}`,
      `👤 Contacto: ${cotizacion.asesor}`,
      `📞 ${EMPRESA.celulares.join(' - ')}`,
      `✉️ ${EMPRESA.email}`,
      SEPARADOR,
    ].join('\n'),
  );

  bloques.push(
    [
      `📄 COTIZACIÓN No. ${cotizacion.numero}`,
      `📅 Fecha: ${fechaCorta(cotizacion.fecha)}`,
      '',
      ...(cliente.empresa ? [`🏭 Cliente: ${cliente.empresa}`] : []),
      ...(cliente.contacto ? [`👤 Contacto: ${cliente.contacto}`] : []),
      ...(cliente.telefono ? [`📞 Teléfono: ${cliente.telefono}`] : []),
      ...(cliente.email ? [`📧 Email: ${cliente.email}`] : []),
      ...(cliente.ciudad ? [`📍 Ciudad: ${cliente.ciudad}`] : []),
    ]
      .join('\n')
      .trimEnd(),
  );

  for (const linea of cotizacion.lineas) {
    const t = totalesDeLinea(linea, iva, cambio.moneda);
    bloques.push(
      [
        SEPARADOR,
        `📌 ${linea.descripcion}${linea.medida ? ` · ${linea.medida}` : ''}`,
        `📦 Cantidad: ${unidades(linea.cantidad)} unidades`,
        `💲 Valor unitario: ${importe(linea.unitario)}`,
        ...(linea.descuento ? [`🏷️ Descuento: ${linea.descuento}%`] : []),
        `💰 Total con IVA: ${importe(t.total)}`,
      ].join('\n'),
    );
  }

  // Con una sola línea el total del documento repite el de la línea; sólo
  // vale la pena cuando hay varias.
  if (cotizacion.lineas.length > 1) {
    bloques.push([SEPARADOR, `💰 TOTAL CON IVA: ${importe(totales.total)}`].join('\n'));
  }

  bloques.push(
    [
      SEPARADOR,
      ...condiciones.incluye.map((punto) => `✅ ${punto}`),
      '',
      `🚚 Entrega estimada: ${condiciones.tiempoEntrega}`,
      `📅 Vigencia de la oferta: ${condiciones.validezDias} días ` +
        `(hasta el ${fechaCorta(sumarDias(cotizacion.fecha, condiciones.validezDias))})`,
      `💳 Forma de pago: ${condiciones.formaPago}`,
      ...(condiciones.observaciones.trim() ? ['', `📝 ${condiciones.observaciones.trim()}`] : []),
      '',
      // La misma declaración que lleva el PDF: el «$» del mensaje es tan
      // ambiguo como el del documento, y aquí se lee incluso más deprisa.
      `💵 ${monedaDeclarada(cambio)}`,
      SEPARADOR,
    ].join('\n'),
  );

  return bloques.join('\n\n');
}

/**
 * Enlace de WhatsApp con el mensaje precargado.
 *
 * Si el cliente dejó su teléfono se abre su chat; si no, el de la empresa,
 * para que el asesor reenvíe el texto desde donde quiera.
 */
export function enlaceWhatsapp(cotizacion: Cotizacion, iva: number): string {
  const texto = encodeURIComponent(mensajeWhatsapp(cotizacion, iva));
  const numero = numeroColombiano(cotizacion.cliente.telefono);
  return numero ? `https://wa.me/${numero}?text=${texto}` : `${EMPRESA.whatsapp}?text=${texto}`;
}

/**
 * Normaliza un teléfono colombiano al formato que espera wa.me.
 *
 * Acepta lo que la gente escribe de verdad: "300 790 5606", "3007905606",
 * "+57 300 790 5606". Los fijos de siete dígitos no llevan indicativo de
 * celular, así que se descartan antes que mandar el mensaje a un número
 * equivocado.
 */
export function numeroColombiano(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length === 10 && digitos.startsWith('3')) return `57${digitos}`;
  if (digitos.length === 12 && digitos.startsWith('573')) return digitos;
  return null;
}
