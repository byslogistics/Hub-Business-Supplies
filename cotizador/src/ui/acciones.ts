/**
 * Salidas de la cotización: PDF, WhatsApp y portapapeles.
 *
 * jsPDF y su tabla pesan bastante más que el resto de la aplicación. Al
 * importarlos aquí de forma dinámica quedan en un paquete aparte, y la
 * pantalla se dibuja sin tener que analizarlos ni ejecutarlos; el navegador
 * los descarga en segundo plano para que el primer PDF salga sin espera.
 */

import type { Cotizacion } from '../dominio/tipos';
import { enlaceWhatsapp, mensajeWhatsapp } from '../mensajes/whatsapp';

async function generar(cotizacion: Cotizacion, borrador: boolean) {
  const { construirPdf, nombreArchivo } = await import('../pdf/cotizacionPdf');
  return {
    doc: construirPdf(cotizacion, { borrador }),
    nombre: nombreArchivo(cotizacion),
  };
}

export async function descargarPdf(cotizacion: Cotizacion, borrador = false): Promise<void> {
  const { doc, nombre } = await generar(cotizacion, borrador);
  doc.save(nombre);
}

/**
 * Abre el PDF en otra pestaña para revisarlo antes de enviarlo.
 *
 * El object URL se libera tras un minuto: revocarlo de inmediato deja la
 * pestaña en blanco en varios navegadores, porque aún no ha terminado de leer.
 */
export async function verPdf(cotizacion: Cotizacion, borrador = false): Promise<void> {
  const { doc } = await generar(cotizacion, borrador);
  const url = URL.createObjectURL(doc.output('blob'));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * El mismo PDF que se descarga, pero en base64 para mandarlo por correo.
 *
 * Se genera aquí y no en el servidor porque jsPDF vive en el navegador, y
 * porque así el archivo que recibe el cliente por correo es **byte por byte**
 * el mismo que sale del botón de descargar. Regenerarlo en el servidor con otra
 * librería sería tener dos PDF distintos con el mismo número.
 */
export async function pdfEnBase64(
  cotizacion: Cotizacion,
): Promise<{ base64: string; nombre: string }> {
  const { doc, nombre } = await generar(cotizacion, false);
  return { base64: aBase64(new Uint8Array(doc.output('arraybuffer'))), nombre };
}

/**
 * Bytes a base64, por trozos.
 *
 * `String.fromCharCode(...bytes)` con un PDF entero revienta la pila de
 * argumentos: son cientos de miles de números en una sola llamada. De ocho mil
 * en ocho mil no.
 */
function aBase64(bytes: Uint8Array): string {
  const TROZO = 8192;
  let binario = '';

  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }

  return btoa(binario);
}

export function abrirWhatsapp(cotizacion: Cotizacion): void {
  window.open(enlaceWhatsapp(cotizacion, cotizacion.iva), '_blank', 'noopener');
}

/**
 * Copia el mensaje al portapapeles.
 *
 * `navigator.clipboard` sólo existe en contextos seguros; abierto el `dist/`
 * desde un `file://` no está, y ahí hace falta el camino viejo.
 */
export async function copiarMensaje(cotizacion: Cotizacion): Promise<boolean> {
  const texto = mensajeWhatsapp(cotizacion, cotizacion.iva);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* Permiso denegado: se intenta con el método antiguo. */
  }

  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copiado = document.execCommand('copy');
    document.body.removeChild(area);
    return copiado;
  } catch {
    return false;
  }
}
