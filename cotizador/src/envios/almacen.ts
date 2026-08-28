/**
 * Mandar una cotización por correo, visto desde la pantalla.
 *
 * Lo único que viaja de aquí es lo que sólo el navegador puede saber: a quién
 * se manda, qué mensaje escribió quien envía, y el PDF que se acaba de generar.
 * **Las cifras no viajan**: el número, la fecha y el total los pone el servidor
 * leyendo la cotización guardada, igual que el historial no acepta totales ya
 * calculados.
 */

import { BASE, ES_DEMOSTRACION, pedir } from '../api/pedir';
import { FalloApi } from '../api/fallo';

export interface EnvioDeCotizacion {
  /** Uno o varios correos separados por coma. El servidor los valida todos. */
  destinatario: string;
  asunto: string;
  mensaje: string;
  /** Quién firma: un identificador del equipo (`yeimy`, `paola`…). */
  remitenteId: string;
  pdfBase64: string;
  nombrePdf: string;
  adjuntos?: { nombre: string; contenidoBase64: string }[];
  copiaAlRemitente: boolean;
  copiaArchivo: boolean;
  ctas?: string[];
}

export async function enviarCotizacion(
  numero: string,
  envio: EnvioDeCotizacion,
): Promise<{ enviado: true; id: string }> {
  if (ES_DEMOSTRACION) {
    // La vista previa no tiene ni servidor ni llave de Resend. Decirlo aquí, y
    // no dejar que falle con un error de red, es la diferencia entre «esto no
    // funciona» y «esto aquí no se puede».
    throw new FalloApi(
      'fallo',
      'En la vista previa no se manda correo: no hay servidor detrás. En el hub de verdad, sí.',
    );
  }

  return pedir(`${BASE}/cotizaciones/${encodeURIComponent(numero)}/enviar`, {
    method: 'POST',
    body: JSON.stringify(envio),
  });
}
