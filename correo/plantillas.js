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
 * los campos y, si hay, los adjuntos.
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

// Nombres de clave sin dígitos al inicio: en JavaScript `objeto.700` no se
// puede leer con punto (se intenta parsear como número). Ya nos pasó una vez.
const BRAND = {
  azul500: '#157cbf',
  azul700: '#00518e',
  azul900: '#00335c',
  ambar600: '#b45309',
  fondo: '#eff7fc',
};

// Tope de adjuntos que se deja pegar desde el formulario. Coincide con el que
// vuelve a comprobar `worker/index.ts` — cambiar uno sin el otro no tiene
// sentido, ver el comentario allá.
export const MAXIMO_ADJUNTOS_BYTES = 8 * 1024 * 1024;

// --- Plantillas --------------------------------------------------------------
//
// Cada plantilla declara:
//  - `campos`: para que el formulario se pinte solo.
//  - `etiqueta` / `colorEtiqueta`: la pastilla de arriba del correo, para que
//    quien lo recibe sepa de un vistazo de qué tipo de correo se trata.
//  - `ctaTipo`: 'sitio' (botón a la página web), 'whatsapp' (botón al
//    WhatsApp de quien firma) o 'ninguno' — no todos los correos necesitan
//    empujar a una acción; un agradecimiento, por ejemplo, no.
//  - `asunto(datos)` y `cuerpo(datos)`: `cuerpo` sólo da el contenido de en
//    medio — el encabezado y la firma los pone `envoltura` una sola vez,
//    iguales para todas.
export const PLANTILLAS = {
  presentacion: {
    id: 'presentacion',
    nombre: 'Presentación comercial',
    descripcion: 'Primer contacto con un cliente nuevo: quiénes somos y qué ofrecemos.',
    etiqueta: 'Presentación',
    colorEtiqueta: BRAND.azul500,
    ctaTipo: 'sitio',
    ctaTexto: 'Visitar byslogistics.com.co',
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
    descripcion: 'Para retomar contacto después de haber enviado una cotización. Adjunta el PDF si lo tienes a mano.',
    etiqueta: 'Seguimiento',
    colorEtiqueta: BRAND.azul700,
    ctaTipo: 'whatsapp',
    ctaTexto: 'Escribir por WhatsApp',
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
    etiqueta: 'Oferta especial',
    colorEtiqueta: BRAND.ambar600,
    ctaTipo: 'sitio',
    ctaTexto: 'Ver catálogo completo',
    campos: [
      campo('nombreCliente', 'Nombre del cliente', 'text', false),
      campo('tituloOferta', 'Título de la oferta', 'text', true),
      campo('mensaje', 'Detalle de la oferta — admite "- " al inicio de línea para viñetas', 'textarea', true),
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

  reactivacion: {
    id: 'reactivacion',
    nombre: 'Reactivar cliente',
    descripcion: 'Para un cliente con el que hace tiempo no se habla.',
    etiqueta: 'Volvamos a hablar',
    colorEtiqueta: BRAND.azul500,
    ctaTipo: 'whatsapp',
    ctaTexto: 'Hablemos por WhatsApp',
    campos: [
      campo('nombreCliente', 'Nombre del cliente', 'text', false),
      campo('mensaje', 'Mensaje (opcional — si lo deja vacío se usa un texto general)', 'textarea', false),
    ],
    asunto: () => `¿Seguimos en contacto? — B&S Logistics`,
    cuerpo: (d) => `
      ${saludo(d.nombreCliente)}
      ${parrafos(d.mensaje) ||
        parrafo(
          'Hace un tiempo no hablamos y quería saber cómo va todo por su lado. Seguimos con las ' +
            'mismas ganas de acompañar su operación con sellos de seguridad y suministros logísticos.',
        )}
      ${parrafo('Si algo cambió en lo que necesita, con gusto le preparamos una cotización actualizada.')}
    `,
  },

  agradecimiento: {
    id: 'agradecimiento',
    nombre: 'Gracias por su compra',
    descripcion: 'Confirmación y agradecimiento después de un pedido.',
    etiqueta: '¡Gracias!',
    colorEtiqueta: BRAND.azul700,
    ctaTipo: 'ninguno',
    campos: [
      campo('nombreCliente', 'Nombre del cliente', 'text', false),
      campo('numeroPedido', 'Número de pedido o cotización (opcional)', 'text', false),
      campo('mensaje', 'Mensaje (opcional)', 'textarea', false),
    ],
    asunto: (d) => `Gracias por su compra — B&S Logistics${trim(d.numeroPedido) ? ` (${trim(d.numeroPedido)})` : ''}`,
    cuerpo: (d) => `
      ${saludo(d.nombreCliente)}
      ${parrafo(
        `Muchas gracias por su compra${trim(d.numeroPedido) ? ` <strong>${esc(d.numeroPedido)}</strong>` : ''}. ` +
          'Fue un gusto atenderle y esperamos que todo llegue en perfectas condiciones.',
      )}
      ${parrafos(d.mensaje)}
      ${parrafo('Cualquier cosa que necesite, aquí estamos.')}
    `,
  },

  recordatorioPago: {
    id: 'recordatorioPago',
    nombre: 'Recordatorio de pago',
    descripcion: 'Para una factura o saldo pendiente.',
    etiqueta: 'Recordatorio',
    colorEtiqueta: BRAND.ambar600,
    ctaTipo: 'whatsapp',
    ctaTexto: 'Confirmar el pago por WhatsApp',
    campos: [
      campo('nombreCliente', 'Nombre del cliente', 'text', false),
      campo('numeroFactura', 'Número de factura o cotización (opcional)', 'text', false),
      campo('montoPendiente', 'Monto pendiente (opcional, ej: "$450.000")', 'text', false),
      campo('fechaLimite', 'Fecha límite (opcional)', 'text', false),
      campo('mensaje', 'Mensaje (opcional)', 'textarea', false),
    ],
    asunto: (d) => `Recordatorio de pago${trim(d.numeroFactura) ? ` — ${trim(d.numeroFactura)}` : ''} — B&S Logistics`,
    cuerpo: (d) => `
      ${saludo(d.nombreCliente)}
      ${parrafo(
        `Le escribo para recordarle${trim(d.numeroFactura) ? ` la factura <strong>${esc(d.numeroFactura)}</strong>` : ' un saldo'}` +
          `${trim(d.montoPendiente) ? `, por <strong>${esc(d.montoPendiente)}</strong>` : ''}` +
          `${trim(d.fechaLimite) ? `, con fecha límite el <strong>${esc(d.fechaLimite)}</strong>` : ''}.`,
      )}
      ${parrafos(d.mensaje)}
      ${parrafo('Si ya realizó el pago, ignore este mensaje y disculpe la molestia.')}
    `,
  },
};

// --- Armar el correo completo ------------------------------------------------

/**
 * Genera el asunto y el HTML final de un correo, con validación completa.
 * Es la que usa `worker/index.ts` antes de mandar por Resend: si falta un
 * campo obligatorio, no arma nada y avisa cuál.
 *
 * @param {string} remitenteId
 * @param {string} plantillaId
 * @param {Record<string, string>} datos
 * @returns {{ asunto: string, html: string, remitente: object }}
 */
export function renderCorreo(remitenteId, plantillaId, datos) {
  const { remitente, plantilla } = resolver(remitenteId, plantillaId);

  for (const c of plantilla.campos) {
    if (c.requerido && !trim(datos[c.clave])) {
      throw new Error(`Falta el campo «${c.etiqueta}».`);
    }
  }

  return construir(remitente, plantilla, datos);
}

/**
 * Igual que `renderCorreo`, pero sin exigir los campos obligatorios — para
 * que la vista previa del formulario se pinte de inmediato mientras se
 * escribe, en vez de quedarse en blanco hasta que todo esté completo.
 */
export function previsualizarCorreo(remitenteId, plantillaId, datos) {
  const { remitente, plantilla } = resolver(remitenteId, plantillaId);
  return construir(remitente, plantilla, datos);
}

function resolver(remitenteId, plantillaId) {
  const remitente = REMITENTES[remitenteId];
  const plantilla = PLANTILLAS[plantillaId];
  if (!remitente) throw new Error(`No existe el remitente «${remitenteId}».`);
  if (!plantilla) throw new Error(`No existe la plantilla «${plantillaId}».`);
  return { remitente, plantilla };
}

function construir(remitente, plantilla, datos) {
  const asunto = plantilla.asunto(datos);
  const html = envoltura(plantilla.cuerpo(datos), remitente, plantilla);
  return { asunto, html, remitente };
}

function envoltura(contenidoHtml, remitente, plantilla) {
  const cta = ctaDe(plantilla, remitente);

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
                <span style="display:inline-block;margin-bottom:18px;padding:4px 12px;border-radius:999px;background:${plantilla.colorEtiqueta};color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;">${esc(plantilla.etiqueta)}</span>
                ${contenidoHtml}
                ${cta ? botonCta(cta) : ''}
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

function ctaDe(plantilla, remitente) {
  if (plantilla.ctaTipo === 'ninguno') return null;
  if (plantilla.ctaTipo === 'whatsapp') {
    return { texto: plantilla.ctaTexto || 'Escribir por WhatsApp', href: waLink(remitente.whatsapp) };
  }
  return { texto: plantilla.ctaTexto || 'Visitar byslogistics.com.co', href: EMPRESA.sitioUrl };
}

function botonCta(cta) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        <td style="border-radius:999px;background:${BRAND.azul700};">
          <a href="${cta.href}" style="display:inline-block;padding:11px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">
            ${esc(cta.texto)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

/** El número de WhatsApp de la firma, como enlace `wa.me`. */
function waLink(numero) {
  let digitos = String(numero ?? '').replace(/\D/g, '');
  // Un celular colombiano sin el 57 adelante (Paola lo tiene guardado así,
  // Yeimy con el +57 puesto) — wa.me necesita el indicativo siempre.
  if (digitos.length === 10) digitos = `57${digitos}`;
  return `https://wa.me/${digitos}`;
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

/**
 * De texto escrito a mano a HTML: respeta párrafos (líneas en blanco),
 * convierte líneas que empiezan con "- " en una lista, y admite un poco de
 * formato — `**negrita**`, `*cursiva*` y enlaces sueltos (`https://…`).
 *
 * Recibe el texto SIN escapar: escapa primero y aplica el formato después,
 * para que nada de lo que alguien escriba pueda colarse como HTML de verdad.
 */
function parrafos(texto) {
  const limpio = esc(texto).trim();
  if (!limpio) return '';
  return limpio.split(/\n{2,}/).map(bloqueHtml).join('');
}

function bloqueHtml(bloque) {
  const lineas = bloque
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const esLista = lineas.length > 0 && lineas.every((l) => l.startsWith('- '));
  if (esLista) {
    const items = lineas.map((l) => `<li style="margin:0 0 6px;">${formatoLigero(l.slice(2))}</li>`).join('');
    return `<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`;
  }

  return `<p style="margin:0 0 16px;">${formatoLigero(bloque.replace(/\n/g, '<br>'))}</p>`;
}

function formatoLigero(texto) {
  return texto
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#00518e;">$1</a>');
}
