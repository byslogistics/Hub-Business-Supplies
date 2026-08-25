/**
 * Todo lo que hace falta para armar un correo comercial: quién lo firma, los
 * datos de la empresa, y las plantillas.
 *
 * Este archivo lo usan dos sitios distintos y por eso está escrito en
 * JavaScript llano, sin TypeScript ni nada que necesite compilarse:
 *
 *  - `correo/index.html` lo carga tal cual en el navegador, con
 *    `<script type="module">`, para pintar la vista previa mientras se
 *    escribe.
 *  - `worker/index.ts` importa las mismas funciones para generar el HTML de
 *    verdad que se manda por Resend.
 *
 * Así el correo que la vendedora ve en la vista previa es exactamente el que
 * sale — no hay dos copias de la plantilla que se puedan desincronizar.
 *
 * IMPORTANTE: el HTML final SIEMPRE se genera aquí, del lado del servidor
 * (`worker/index.ts` llama a `renderCorreo`, nunca confía en HTML que venga
 * del navegador). Lo que viaja desde el formulario son sólo los valores de
 * los campos.
 */

// --- Quién puede firmar un correo ------------------------------------------
//
// Para añadir o corregir una vendedora: sólo hay que editar este objeto. No
// hace falta tocar nada más del archivo.
export const REMITENTES = {
  paola: {
    id: 'paola',
    nombre: 'Paola Vargas',
    cargo: 'Departamento comercial',
    whatsapp: '311 253 3085',
    // A esta dirección llegan las respuestas del cliente, aunque el correo
    // salga técnicamente desde el dominio de la empresa (ver EMPRESA.correoVentas).
    correoDirecto: 'byslogisticsltda@hotmail.com',
  },
  yeimy: {
    id: 'yeimy',
    nombre: 'Yeimy Mahecha',
    cargo: 'Departamento comercial',
    whatsapp: '+57 321 418 9261',
    // Pendiente confirmar si Yeimy tiene un correo propio distinto al de
    // Paola. Mientras tanto, las respuestas también llegan a este buzón
    // compartido — cámbialo aquí si ella prefiere otro.
    correoDirecto: 'byslogisticsltda@hotmail.com',
  },
};

// --- Datos fijos de la empresa ----------------------------------------------
export const EMPRESA = {
  nombre: 'B&S Logistics S.A.S.',
  telefono: '601 - 4699809',
  web: 'www.byslogistics.com.co',
  direccion: 'Cra. 86B #53-22 Sur Manzana C, Bloque 13 Ofi 152 - Bogotá D.C. (Multifamiliares Tayrona)',
  // Logo público de la página web. Tiene que ser una URL a la que cualquier
  // programa de correo pueda llegar sin iniciar sesión en nada.
  logoUrl: 'https://byslogistics.com.co/LOgo-navbar.png',
  sitioUrl: 'https://byslogistics.com.co/',
  // La dirección desde la que sale técnicamente el correo. Tiene que ser del
  // dominio verificado en Resend — ver el README para el porqué.
  correoVentas: 'ventas@byslogistics.com.co',
};

const BRAND = {
  azul700: '#00518e',
  azul900: '#00335c',
  fondo: '#eff7fc',
};

// --- Plantillas --------------------------------------------------------------
//
// Cada plantilla declara sus campos (para que el formulario se pinte solo) y
// dos funciones: `asunto(datos)` y `cuerpo(datos)`. `cuerpo` sólo devuelve el
// contenido de en medio del correo — el encabezado y la firma los pone
// `renderCorreo` una sola vez, iguales para las tres.
export const PLANTILLAS = {
  presentacion: {
    id: 'presentacion',
    nombre: 'Presentación comercial',
    descripcion: 'Primer contacto con un cliente nuevo: quiénes somos y qué ofrecemos.',
    campos: [
      campo('nombreCliente', 'Nombre del cliente', 'text', false),
      campo('empresaCliente', 'Empresa del cliente (opcional)', 'text', false),
      campo(
        'mensaje',
        'Mensaje (opcional — si lo deja vacío se usa un texto general)',
        'textarea',
        false,
      ),
    ],
    asunto: (d) =>
      `B&S Logistics — sellos de seguridad y suministros para ${trim(d.empresaCliente) || 'su empresa'}`,
    cuerpo: (d) => `
      ${saludo(d.nombreCliente)}
      ${parrafos(d.mensaje) ||
        parrafo(
          'Somos B&S Logistics, proveedores de sellos de seguridad, precintos y suministros ' +
            'logísticos. Nos ponemos a su disposición para conocer sus necesidades y ofrecerle ' +
            'una propuesta a la medida.',
        )}
      ${parrafo('Con gusto le compartimos nuestro catálogo y le preparamos una cotización sin compromiso.')}
    `,
  },

  seguimiento: {
    id: 'seguimiento',
    nombre: 'Seguimiento a cotización',
    descripcion: 'Para retomar contacto después de haber enviado una cotización.',
    campos: [
      campo('nombreCliente', 'Nombre del cliente', 'text', false),
      campo('numeroCotizacion', 'Número de cotización (opcional)', 'text', false),
      campo('mensaje', 'Mensaje', 'textarea', true),
    ],
    asunto: (d) => `Seguimiento a su cotización${trim(d.numeroCotizacion) ? ` ${trim(d.numeroCotizacion)}` : ''} — B&S Logistics`,
    cuerpo: (d) => `
      ${saludo(d.nombreCliente)}
      ${parrafo(
        `Quería confirmar si alcanzó a revisar la cotización${
          trim(d.numeroCotizacion) ? ` <strong>${esc(d.numeroCotizacion)}</strong>` : ''
        } que le compartimos.`,
      )}
      ${parrafos(d.mensaje)}
      ${parrafo('Quedo atenta a sus comentarios y con gusto resolvemos cualquier duda.')}
    `,
  },

  oferta: {
    id: 'oferta',
    nombre: 'Oferta puntual',
    descripcion: 'Una promoción o condición especial por tiempo limitado.',
    campos: [
      campo('nombreCliente', 'Nombre del cliente', 'text', false),
      campo('tituloOferta', 'Título de la oferta', 'text', true),
      campo('mensaje', 'Detalle de la oferta', 'textarea', true),
      campo('vigencia', 'Vigencia (opcional, ej: "hasta el 30 de agosto")', 'text', false),
    ],
    asunto: (d) => `${trim(d.tituloOferta) || 'Oferta especial'} — B&S Logistics`,
    cuerpo: (d) => `
      ${saludo(d.nombreCliente)}
      ${parrafo(`Tenemos una oferta especial para usted: <strong>${esc(d.tituloOferta)}</strong>.`)}
      ${parrafos(d.mensaje)}
      ${trim(d.vigencia) ? parrafo(`<em>Vigente ${esc(d.vigencia)}.</em>`) : ''}
    `,
  },
};

// --- Armar el correo completo ------------------------------------------------

/**
 * Genera el asunto y el HTML final de un correo.
 *
 * @param {string} remitenteId  Una llave de REMITENTES.
 * @param {string} plantillaId  Una llave de PLANTILLAS.
 * @param {Record<string, string>} datos  Los valores de los campos del formulario.
 * @returns {{ asunto: string, html: string, remitente: object }}
 */
export function renderCorreo(remitenteId, plantillaId, datos) {
  const remitente = REMITENTES[remitenteId];
  const plantilla = PLANTILLAS[plantillaId];
  if (!remitente) throw new Error(`No existe el remitente «${remitenteId}».`);
  if (!plantilla) throw new Error(`No existe la plantilla «${plantillaId}».`);

  for (const c of plantilla.campos) {
    if (c.requerido && !trim(datos[c.clave])) {
      throw new Error(`Falta el campo «${c.etiqueta}».`);
    }
  }

  const asunto = plantilla.asunto(datos);
  const html = envoltura(plantilla.cuerpo(datos), remitente);
  return { asunto, html, remitente };
}

function envoltura(contenidoHtml, remitente) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(EMPRESA.nombre)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.fondo};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.fondo};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
                <img src="${EMPRESA.logoUrl}" alt="${esc(EMPRESA.nombre)}" width="180" style="display:block;border:0;max-width:180px;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#181818;font-size:15px;line-height:1.55;">
                ${contenidoHtml}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                  <tr>
                    <td style="border-radius:999px;background:${BRAND.azul700};">
                      <a href="${EMPRESA.sitioUrl}" style="display:inline-block;padding:11px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">
                        Visitar byslogistics.com.co
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:${BRAND.azul900};padding:28px 32px;color:#ffffff;">
                <p style="margin:0 0 2px;font-size:17px;font-weight:bold;">${esc(remitente.nombre)}</p>
                <p style="margin:0 0 14px;font-size:13px;font-style:italic;color:#cfe3f4;">${esc(remitente.cargo)}</p>
                <p style="margin:0 0 4px;font-size:13px;color:#e7f1fa;">WhatsApp: ${esc(remitente.whatsapp)}</p>
                <p style="margin:0 0 4px;font-size:13px;color:#e7f1fa;">Correo: ${esc(remitente.correoDirecto)}</p>
                <p style="margin:14px 0 4px;font-size:13px;color:#e7f1fa;">Tel: ${esc(EMPRESA.telefono)} &nbsp;·&nbsp; ${esc(EMPRESA.web)}</p>
                <p style="margin:0;font-size:12px;color:#a9c6de;">${esc(EMPRESA.direccion)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// --- Utilidades pequeñas -----------------------------------------------------

function campo(clave, etiqueta, tipo, requerido) {
  return { clave, etiqueta, tipo, requerido };
}

function trim(valor) {
  return String(valor ?? '').trim();
}

function saludo(nombreCliente) {
  const nombre = trim(nombreCliente);
  return parrafo(`Hola${nombre ? ` ${esc(nombre)}` : ''},`);
}

function parrafo(html) {
  return `<p style="margin:0 0 16px;">${html}</p>`;
}

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Como `esc`, pero respeta párrafos (líneas en blanco) y saltos de línea. */
function parrafos(texto) {
  const limpio = esc(texto).trim();
  if (!limpio) return '';
  return limpio
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
