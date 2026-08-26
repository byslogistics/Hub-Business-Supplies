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

/**
 * @typedef {object} Remitente
 * @property {string} id
 * @property {string} nombre
 * @property {string} cargo
 * @property {string} whatsapp
 * @property {string} correoDirecto A esta dirección llegan las respuestas.
 */

/** @type {Record<string, Remitente>} */
export const REMITENTES = {
  paola: {
    id: 'paola',
    nombre: 'Paola Vargas',
    cargo: 'Departamento comercial',
    whatsapp: '+57 311 253 3085',
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
  redes: {
    facebook: 'https://www.facebook.com/people/Byslogistics/100070925777333/',
    instagram: 'https://www.instagram.com/byslogistics/',
  },
};

// Nombres de clave sin dígitos al inicio: en JavaScript `objeto.700` no se
// puede leer con punto (se intenta parsear como número). Ya nos pasó una vez.
const BRAND = {
  azul500: '#157cbf',
  azul700: '#00518e',
  azul900: '#00335c',
  verde600: '#0f8a5f',
  morado600: '#6d4aad',
  ambar600: '#b45309',
  fondo: '#eef2f6',
};

// Ancho de la tarjeta del correo. Lo más ancho que se ve bien sin quedar
// incómodo de leer en escritorio (Gmail, Outlook web) — con `max-width:100%`
// en la tabla, en el celular se encoge solo al ancho de la pantalla.
const ANCHO_CORREO = 700;

/** Los botones (CTA) que existen para poner en un correo. Cuáles aparecen es
 *  algo que se elige al armar el correo, no algo fijo por plantilla — por eso
 *  cada plantilla sólo sugiere cuáles marcar de entrada (`ctasSugeridos`). */
const DEFINICIONES_CTA = {
  sitio: { texto: 'Visitar byslogistics.com.co', href: () => EMPRESA.sitioUrl },
  whatsapp: { texto: 'Escribir por WhatsApp', href: (remitente) => waLink(remitente.whatsapp) },
  facebook: { texto: 'Síguenos en Facebook', href: () => EMPRESA.redes.facebook },
  instagram: { texto: 'Síguenos en Instagram', href: () => EMPRESA.redes.instagram },
};

// Tope de adjuntos que se deja pegar desde el formulario. Coincide con el que
// vuelve a comprobar `worker/index.ts` — cambiar uno sin el otro no tiene
// sentido, ver el comentario allá.
export const MAXIMO_ADJUNTOS_BYTES = 8 * 1024 * 1024;

// --- Plantillas --------------------------------------------------------------
//
// Cada plantilla declara:
//  - `campos`: para que el formulario se pinte solo.
//  - `colorEtiqueta`: el color de la franja fina de arriba del correo — es
//    sólo un acento visual por tipo de correo, el cliente nunca ve el nombre
//    de la plantilla escrito.
//  - `ctasSugeridos`: qué botones (de `DEFINICIONES_CTA`) vienen marcados de
//    entrada al elegir esa plantilla — la vendedora los puede cambiar antes
//    de mandar. Vacío para los correos que no necesitan empujar una acción,
//    un agradecimiento por ejemplo.
//  - `asunto(datos)` y `cuerpo(datos)`: `cuerpo` sólo da el contenido de en
//    medio — el encabezado y la firma los pone `envoltura` una sola vez,
//    iguales para todas.
export const PLANTILLAS = {
  presentacion: {
    id: 'presentacion',
    nombre: 'Presentación comercial',
    descripcion: 'Primer contacto con un cliente nuevo: quiénes somos y qué ofrecemos.',
    colorEtiqueta: BRAND.azul500,
    ctasSugeridos: ['sitio'],
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
    colorEtiqueta: BRAND.azul700,
    ctasSugeridos: ['whatsapp'],
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
    colorEtiqueta: BRAND.ambar600,
    ctasSugeridos: ['sitio'],
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
    colorEtiqueta: BRAND.azul500,
    ctasSugeridos: ['whatsapp'],
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
    colorEtiqueta: BRAND.verde600,
    ctasSugeridos: [],
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
    colorEtiqueta: BRAND.ambar600,
    ctasSugeridos: ['whatsapp'],
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

  libre: {
    id: 'libre',
    nombre: 'Correo libre (en blanco)',
    descripcion: 'Para cuando ninguna plantilla encaja: escribe el correo tal cual, sin saludo ni cierre fijos.',
    colorEtiqueta: BRAND.morado600,
    ctasSugeridos: [],
    campos: [
      campo(
        'mensaje',
        'Escribe el correo completo — admite "- " para viñetas, **negrita**, *cursiva*, enlaces sueltos (https://…) y enlaces con texto [así](https://…)',
        'textarea',
        true,
      ),
    ],
    asunto: () => 'B&S Logistics',
    cuerpo: (d) => parrafos(d.mensaje),
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
 * @param {string[]} [ctasActivos] Claves de `DEFINICIONES_CTA` a incluir. Si
 *   se omite, se usan las que la plantilla trae sugeridas.
 * @returns {{ asunto: string, html: string, remitente: Remitente }}
 */
export function renderCorreo(remitenteId, plantillaId, datos, ctasActivos) {
  const { remitente, plantilla } = resolver(remitenteId, plantillaId);

  for (const c of plantilla.campos) {
    if (c.requerido && !trim(datos[c.clave])) {
      throw new Error(`Falta el campo «${c.etiqueta}».`);
    }
  }

  return construir(remitente, plantilla, datos, ctasActivos);
}

/**
 * Igual que `renderCorreo`, pero sin exigir los campos obligatorios — para
 * que la vista previa del formulario se pinte de inmediato mientras se
 * escribe, en vez de quedarse en blanco hasta que todo esté completo.
 */
export function previsualizarCorreo(remitenteId, plantillaId, datos, ctasActivos) {
  const { remitente, plantilla } = resolver(remitenteId, plantillaId);
  return construir(remitente, plantilla, datos, ctasActivos);
}

function resolver(remitenteId, plantillaId) {
  const remitente = REMITENTES[remitenteId];
  const plantilla = PLANTILLAS[plantillaId];
  if (!remitente) throw new Error(`No existe el remitente «${remitenteId}».`);
  if (!plantilla) throw new Error(`No existe la plantilla «${plantillaId}».`);
  return { remitente, plantilla };
}

function construir(remitente, plantilla, datos, ctasActivos) {
  const asunto = plantilla.asunto(datos);
  const ctas = ctasDe(ctasActivos ?? plantilla.ctasSugeridos, remitente);
  const html = envoltura(plantilla.cuerpo(datos), remitente, plantilla, ctas);
  return { asunto, html, remitente };
}

/** Traduce las claves elegidas ('sitio', 'whatsapp'...) a botón concreto,
 *  descartando cualquier clave que no exista en `DEFINICIONES_CTA`. */
function ctasDe(claves, remitente) {
  return (claves ?? [])
    .filter((clave) => clave in DEFINICIONES_CTA)
    .map((clave) => {
      const def = DEFINICIONES_CTA[clave];
      return { texto: def.texto, href: def.href(remitente) };
    });
}

/**
 * El encabezado, la firma y el pie son siempre iguales; sólo cambia el
 * contenido de en medio y el color de la franja de arriba. Esa franja es
 * deliberadamente sólo color, sin texto: es un acento de diseño para quien
 * arma el correo, no una etiqueta que el cliente deba leer.
 */
function envoltura(contenidoHtml, remitente, plantilla, ctas) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(EMPRESA.nombre)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.fondo};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.fondo};padding:36px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:${ANCHO_CORREO}px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(0,32,58,0.06),0 12px 28px -12px rgba(0,32,58,0.18);">
            <tr>
              <td style="height:6px;line-height:6px;font-size:0;background:${plantilla.colorEtiqueta};">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:34px 44px 22px;">
                <img src="${EMPRESA.logoUrl}" alt="${esc(EMPRESA.nombre)}" width="168" style="display:block;border:0;max-width:168px;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 44px;">
                <div style="height:1px;line-height:1px;font-size:0;background:#edf0f3;">&nbsp;</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 44px 6px;color:#1f2937;font-size:16px;line-height:1.65;">
                ${contenidoHtml}
                ${ctas.length > 0 ? botonesCta(ctas) : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 44px 0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:30px 44px 32px;background:${BRAND.azul900};">
                <p style="margin:0 0 3px;font-size:18px;font-weight:700;color:#ffffff;">${esc(remitente.nombre)}</p>
                <p style="margin:0 0 16px;font-size:13px;font-style:italic;color:#a9c7e0;">${esc(remitente.cargo)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(255,255,255,0.16);width:100%;">
                  <tr><td style="padding-top:14px;font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
                <p style="margin:0 0 5px;font-size:13.5px;color:#e7f1fa;"><strong>WhatsApp</strong> &nbsp;${esc(remitente.whatsapp)}</p>
                <p style="margin:0 0 14px;font-size:13.5px;color:#e7f1fa;"><strong>Correo</strong> &nbsp;${esc(remitente.correoDirecto)}</p>
                <p style="margin:0 0 3px;font-size:13px;color:#a9c7e0;">${esc(EMPRESA.telefono)} &nbsp;·&nbsp; ${esc(EMPRESA.web)}</p>
                <p style="margin:0;font-size:12px;color:#7fa0c2;">${esc(EMPRESA.direccion)}</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:${ANCHO_CORREO}px;">
            <tr>
              <td style="padding:18px 12px 0;text-align:center;font-size:11px;color:#9aa7b4;">
                Business &amp; Supplies Logistics S.A.S. · Bogotá, Colombia
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Varios botones seguidos, uno por CTA activo — cada uno en su propia
 *  tabla `inline-block` para que fluyan en una fila y salten de línea solos
 *  en pantallas angostas. */
function botonesCta(ctas) {
  return `<div style="margin:10px 0 6px;">${ctas.map(botonCta).join('')}</div>`;
}

function botonCta(cta) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-block;vertical-align:top;margin:0 8px 8px 0;">
      <tr>
        <td style="border-radius:999px;background:${BRAND.azul700};box-shadow:0 4px 10px -2px rgba(0,81,142,0.45);">
          <a href="${cta.href}" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:700;letter-spacing:0.01em;">
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

/**
 * Enlaces con etiqueta `[texto](https://…)` primero (se guardan aparte para
 * que negrita/cursiva no les toquen los corchetes), y después enlaces sueltos
 * — dejando afuera la puntuación final (".", ",", ")"...) para que un enlace
 * al final de una frase no la incluya como parte de la URL.
 */
function formatoLigero(texto) {
  const enlaces = [];
  let resultado = texto.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, etiqueta, url) => {
    enlaces.push(`<a href="${url}" style="color:#00518e;">${etiqueta}</a>`);
    return `\u0000${enlaces.length - 1}\u0000`;
  });

  resultado = resultado
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /(https?:\/\/[^\s<]+?)([.,;:!?)\]]*)(?=[\s<]|$)/g,
      (_, url, puntuacion) => `<a href="${url}" style="color:#00518e;">${url}</a>${puntuacion}`,
    );

  return resultado.replace(/\u0000(\d+)\u0000/g, (_, indice) => enlaces[Number(indice)]);
}
