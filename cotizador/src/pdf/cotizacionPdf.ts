/**
 * Armado del PDF de la cotización.
 *
 * El documento se compone de arriba abajo: cabecera y pie se repiten en cada
 * página (los pinta `autoTable` con su gancho `didDrawPage`), y el contenido
 * fluye. Ninguna coordenada está escrita a mano dos veces: cada bloque recibe
 * la Y donde termina el anterior y devuelve la suya.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { AGRADECIMIENTO } from '../datos/condiciones';
import { EMPRESA } from '../datos/empresa';
import {
  dinero,
  dineroSinSimbolo,
  fechaLarga,
  monedaDeclarada,
  sumarDias,
  unidades,
} from '../dominio/formato';
import { cambioDe, type Cambio } from '../dominio/moneda';
import { totalesDeCotizacion, totalesDeLinea } from '../dominio/precios';
import type { Cotizacion } from '../dominio/tipos';
import { campo, escribir, panel, regla, relleno, rotulo, tinta } from './documento';
import { LOGO_DATA_URI, LOGO_RELACION_ASPECTO } from './logo';
import { ANCHO_UTIL, COLOR, FUENTE, HOJA, TIPO } from './marca';

/** Alto de la banda superior, donde viven el logo y el título. */
const ALTO_CABECERA = 34;
const Y_CONTENIDO = ALTO_CABECERA + 10;
const ANCHO_LOGO = 44;

export interface OpcionesPdf {
  /** Añade una marca de agua diagonal, para revisiones internas. */
  borrador?: boolean;
}

/**
 * Construye el documento y lo devuelve. Quien llama decide qué hacer con él:
 * descargarlo, abrirlo en otra pestaña o adjuntarlo.
 */
export function construirPdf(cotizacion: Cotizacion, opciones: OpcionesPdf = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

  doc.setProperties({
    title: `Cotización ${cotizacion.numero} · ${EMPRESA.nombreComercial}`,
    subject: `Cotización para ${cotizacion.cliente.empresa || 'cliente'}`,
    author: EMPRESA.razonSocial,
    creator: `Cotizador ${EMPRESA.nombreComercial}`,
  });

  // La tarifa sale del documento, no del catálogo: una cotización emitida
  // conserva sus totales aunque el IVA cambie después.
  const iva = cotizacion.iva;
  // La moneda sale del documento por lo mismo que la tarifa: una cotización
  // emitida en dólares a 4.100 sigue diciendo eso mismo dentro de un año.
  const cambio = cambioDe(cotizacion);
  const totales = totalesDeCotizacion(cotizacion.lineas, iva, cambio.moneda);
  const hayDescuento = totales.descuento > 0;

  let y = bloqueDatos(doc, cotizacion, Y_CONTENIDO);
  y = tablaDeItems(doc, cotizacion, iva, cambio, hayDescuento, y);
  y = bloqueTotales(doc, totales, hayDescuento, iva, cambio, y);
  y = bloqueCondiciones(doc, cotizacion, y);
  bloqueCierre(doc, cotizacion, y);

  numerarPaginas(doc);
  if (opciones.borrador) marcaDeAgua(doc);

  return doc;
}

export function nombreArchivo(cotizacion: Cotizacion): string {
  const cliente = (cotizacion.cliente.empresa || 'cliente')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${cotizacion.numero}-${cliente || 'cliente'}.pdf`;
}

// --- Cabecera y pie -------------------------------------------------------

function cabecera(doc: jsPDF): void {
  const { margen } = HOJA;

  // El logo lleva letras negras y grises, así que necesita fondo claro; la
  // banda de color va debajo, como filete.
  relleno(doc, COLOR.blanco);
  doc.rect(0, 0, HOJA.ancho, ALTO_CABECERA, 'F');

  doc.addImage(
    LOGO_DATA_URI,
    'PNG',
    margen,
    7,
    ANCHO_LOGO,
    ANCHO_LOGO / LOGO_RELACION_ASPECTO,
    undefined,
    'FAST',
  );

  const derecha = HOJA.ancho - margen;
  escribir(doc, 'COTIZACIÓN', derecha, 17, {
    tamano: TIPO.titulo,
    color: COLOR.marcaOscuro,
    negrita: true,
    alineacion: 'right',
  });
  escribir(doc, EMPRESA.eslogan, derecha, 23, {
    tamano: 8,
    color: COLOR.textoSuave,
    alineacion: 'right',
  });

  relleno(doc, COLOR.marca);
  doc.rect(0, ALTO_CABECERA - 1.6, HOJA.ancho, 1.6, 'F');
}

function pie(doc: jsPDF): void {
  const { margen } = HOJA;
  const base = HOJA.alto - HOJA.pie;

  regla(doc, margen, base, ANCHO_UTIL, COLOR.borde, 0.3);

  const centro = HOJA.ancho / 2;
  let y = base + 5;
  y = escribir(doc, EMPRESA.razonSocial, centro, y, {
    tamano: TIPO.pie,
    color: COLOR.marcaOscuro,
    negrita: true,
    alineacion: 'center',
  });
  y = escribir(
    doc,
    `NIT ${EMPRESA.nit}  ·  ${EMPRESA.direccion}  ·  ${EMPRESA.ciudad}`,
    centro,
    y,
    { tamano: TIPO.pie, color: COLOR.textoSuave, alineacion: 'center' },
  );
  escribir(
    doc,
    `${EMPRESA.telefonos.join(' · ')}  ·  Cel. ${EMPRESA.celulares.join(' · ')}  ·  ` +
      `${EMPRESA.email}  ·  ${EMPRESA.sitioWeb}`,
    centro,
    y,
    { tamano: TIPO.pie, color: COLOR.textoSuave, alineacion: 'center' },
  );
}

/**
 * El "de N" sólo se conoce cuando el documento está completo, así que la
 * numeración se estampa al final recorriendo las páginas ya dibujadas.
 */
function numerarPaginas(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    escribir(
      doc,
      `Página ${pagina} de ${total}`,
      HOJA.ancho - HOJA.margen,
      HOJA.alto - HOJA.pie + 5,
      { tamano: TIPO.pie, color: COLOR.textoTenue, alineacion: 'right' },
    );
  }
}

function marcaDeAgua(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    doc.saveGraphicsState();
    doc.setGState(doc.GState({ opacity: 0.08 }));
    doc.setFont(FUENTE, 'bold');
    doc.setFontSize(72);
    tinta(doc, COLOR.marca);
    doc.text('BORRADOR', HOJA.ancho / 2, HOJA.alto / 2, {
      align: 'center',
      angle: 32,
    });
    doc.restoreGraphicsState();
  }
}

// --- Bloques del cuerpo ---------------------------------------------------

/** Panel del cliente a la izquierda y datos de la oferta a la derecha. */
function bloqueDatos(doc: jsPDF, cotizacion: Cotizacion, y: number): number {
  const { margen } = HOJA;
  const separacion = 6;
  const anchoDerecha = 62;
  const anchoIzquierda = ANCHO_UTIL - anchoDerecha - separacion;
  // Alto para tres filas de datos del cliente; el panel derecho tiene cuatro
  // campos más cortos y cabe de sobra en la misma altura.
  const alto = 50;
  const xDerecha = margen + anchoIzquierda + separacion;

  panel(doc, { x: margen, y, ancho: anchoIzquierda, alto }, { borde: COLOR.borde });
  panel(
    doc,
    { x: xDerecha, y, ancho: anchoDerecha, alto },
    { fondo: COLOR.marcaTenue, borde: COLOR.marcaSuave },
  );

  const { cliente } = cotizacion;
  const relleno1 = margen + 5;
  const anchoTexto = anchoIzquierda - 10;

  let yi = rotulo(doc, 'Cliente', relleno1, y + 7, anchoTexto);
  yi = escribir(doc, cliente.empresa || 'Sin especificar', relleno1, yi + 2.5, {
    tamano: 11,
    negrita: true,
    color: COLOR.texto,
    ancho: anchoTexto,
  });

  // Rejilla de dos columnas bajo el nombre de la empresa. El correo ocupa la
  // fila entera porque no cabe en media columna.
  const anchoColumna = anchoTexto / 2 - 3;
  const xColumna2 = relleno1 + anchoColumna + 6;
  const fila1 = yi + 2;
  const fila2 = campo(doc, 'NIT / C.C.', cliente.nit, relleno1, fila1, anchoColumna) + 2;
  campo(doc, 'Contacto', cliente.contacto, xColumna2, fila1, anchoColumna);
  const fila3 = campo(doc, 'Teléfono', cliente.telefono, relleno1, fila2, anchoColumna) + 2;
  campo(doc, 'Ciudad', cliente.ciudad, xColumna2, fila2, anchoColumna);
  campo(doc, 'Correo', cliente.email, relleno1, fila3, anchoTexto);

  const relleno2 = xDerecha + 5;
  const anchoDatos = anchoDerecha - 10;
  let yd = rotulo(doc, 'Oferta', relleno2, y + 7, anchoDatos);
  yd = escribir(doc, cotizacion.numero, relleno2, yd + 2.5, {
    tamano: 11,
    negrita: true,
    color: COLOR.marcaOscuro,
  });
  yd = campo(doc, 'Fecha', fechaLarga(cotizacion.fecha), relleno2, yd + 2, anchoDatos);
  yd = campo(
    doc,
    'Válida hasta',
    fechaLarga(sumarDias(cotizacion.fecha, cotizacion.condiciones.validezDias)),
    relleno2,
    yd + 1.5,
    anchoDatos,
  );
  campo(doc, 'Asesor', cotizacion.asesor, relleno2, yd + 1.5, anchoDatos);

  return y + alto + 8;
}

function tablaDeItems(
  doc: jsPDF,
  cotizacion: Cotizacion,
  iva: number,
  cambio: Cambio,
  hayDescuento: boolean,
  y: number,
): number {
  const cabeza = [
    '#',
    'Descripción',
    'Cant.',
    // La moneda va en el encabezado además de en la declaración de abajo: es
    // donde mira quien recorre la tabla con el dedo.
    `Vr. unitario (${cambio.moneda})`,
    ...(hayDescuento ? ['Dcto.'] : []),
    `Valor total (${cambio.moneda})`,
  ];

  const cuerpo = cotizacion.lineas.map((linea, indice) => {
    const t = totalesDeLinea(linea, iva, cambio.moneda);
    return [
      String(indice + 1),
      descripcionDeLinea(linea),
      unidades(linea.cantidad),
      dineroSinSimbolo(linea.unitario, cambio.moneda),
      ...(hayDescuento ? [linea.descuento ? `${linea.descuento}%` : '—'] : []),
      dineroSinSimbolo(t.subtotal, cambio.moneda),
    ];
  });

  const anchoDescuento = hayDescuento ? 14 : 0;
  const anchoFijo = 9 + 20 + 26 + 28 + anchoDescuento;

  // `autoTable` no devuelve dónde terminó la tabla. El cursor del gancho de
  // página sí lo sabe, y en la última página es justo lo que hace falta para
  // seguir escribiendo debajo.
  let finY = y;

  autoTable(doc, {
    startY: y,
    head: [cabeza],
    body: cuerpo,
    margin: { top: Y_CONTENIDO, left: HOJA.margen, right: HOJA.margen, bottom: HOJA.pie + 6 },
    theme: 'plain',
    styles: {
      font: FUENTE,
      fontSize: TIPO.tabla,
      cellPadding: { top: 2.4, bottom: 2.4, left: 2.5, right: 2.5 },
      textColor: [...COLOR.texto],
      lineColor: [...COLOR.borde],
      lineWidth: { bottom: 0.15 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: [...COLOR.tinta],
      textColor: [...COLOR.blanco],
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: 0,
      cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
    },
    alternateRowStyles: { fillColor: [...COLOR.marcaTenue] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center', textColor: [...COLOR.textoTenue] },
      1: { cellWidth: ANCHO_UTIL - anchoFijo },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      ...(hayDescuento
        ? {
            4: { cellWidth: anchoDescuento, halign: 'right' as const },
            5: { cellWidth: 28, halign: 'right' as const, fontStyle: 'bold' as const },
          }
        : { 4: { cellWidth: 28, halign: 'right' as const, fontStyle: 'bold' as const } }),
    },
    // `columnStyles` alinea el cuerpo pero no el encabezado, y una columna de
    // cifras a la derecha con su título a la izquierda se lee torcida.
    didParseCell: (datos) => {
      if (datos.section === 'head' && datos.column.index > 1) {
        datos.cell.styles.halign = 'right';
      }
    },
    // La cabecera y el pie se pintan aquí para que aparezcan también en las
    // páginas que crea la propia tabla al desbordarse.
    didDrawPage: (datos) => {
      cabecera(doc);
      pie(doc);
      if (datos.cursor) finY = datos.cursor.y;
    },
  });

  return finY + 6;
}

/**
 * Segunda línea de la descripción con lo que distingue a la línea: medida,
 * marcación y empaque. Va en el mismo texto porque `autoTable` mide una sola
 * celda y así el salto de página nunca separa el producto de su detalle.
 */
function descripcionDeLinea(linea: Cotizacion['lineas'][number]): string {
  const detalles = [
    linea.medida,
    linea.conLogo ? 'Marcado con logo del cliente' : 'Sin marcación',
  ].filter(Boolean);
  return `${linea.descripcion}\n${detalles.join('  ·  ')}`;
}

function bloqueTotales(
  doc: jsPDF,
  totales: ReturnType<typeof totalesDeCotizacion>,
  hayDescuento: boolean,
  iva: number,
  cambio: Cambio,
  y: number,
): number {
  const ancho = 78;
  const x = HOJA.ancho - HOJA.margen - ancho;
  const importe = (valor: number) => dinero(valor, cambio.moneda);
  const filas: [string, string][] = [
    ['Subtotal', importe(totales.bruto)],
    ...(hayDescuento
      ? ([['Descuento', `- ${importe(totales.descuento)}`]] as [string, string][])
      : []),
    // Una fila «IVA 0%: $ 0» parece un error de cálculo. Cuando la operación
    // no lleva IVA se dice con palabras, bajo el total.
    ...(iva > 0
      ? ([[`IVA ${Math.round(iva * 10000) / 100}%`, importe(totales.iva)]] as [string, string][])
      : []),
  ];

  const altoFila = 6;
  const altoTotal = 12;
  const alto = filas.length * altoFila + altoTotal + 4;

  let yActual = asegurarEspacio(doc, y, alto + 6);

  // Las unidades totales quedan a la izquierda del bloque: es el dato que
  // primero busca quien recibe la oferta.
  escribir(doc, `${unidades(totales.unidades)} unidades en total`, HOJA.margen, yActual + 5, {
    tamano: 8.5,
    color: COLOR.textoSuave,
  });

  // La moneda se dice, no se deduce. Un «$» a secas es ambiguo —la empresa
  // atiende también Panamá, y el peso y el dólar comparten símbolo—, y en las
  // celdas de la tabla ni siquiera aparece: el número va solo. Quien recibe
  // una oferta no tiene por qué averiguar en qué moneda está.
  escribir(doc, monedaDeclarada(cambio), HOJA.margen, yActual + 10, {
    tamano: 7.5,
    color: COLOR.textoSuave,
    // En dólares la declaración lleva además la tasa y no cabe en una línea:
    // se le da el ancho que queda a la izquierda del bloque de totales.
    ancho: ANCHO_UTIL - ancho - 6,
  });

  for (const [etiqueta, valor] of filas) {
    escribir(doc, etiqueta, x + 4, yActual + 4.5, { tamano: 9, color: COLOR.textoSuave });
    escribir(doc, valor, x + ancho - 4, yActual + 4.5, {
      tamano: 9,
      color: COLOR.texto,
      alineacion: 'right',
    });
    yActual += altoFila;
  }

  yActual += 1;
  relleno(doc, COLOR.tinta);
  doc.roundedRect(x, yActual, ancho, altoTotal, 2, 2, 'F');
  escribir(doc, 'TOTAL', x + 4, yActual + 7.6, {
    tamano: 10,
    color: COLOR.blanco,
    negrita: true,
  });
  escribir(doc, importe(totales.total), x + ancho - 4, yActual + 7.6, {
    tamano: 12,
    color: COLOR.blanco,
    negrita: true,
    alineacion: 'right',
  });

  yActual += altoTotal;

  if (iva === 0) {
    yActual = escribir(doc, 'Operación no gravada con IVA.', x + ancho, yActual + 4, {
      tamano: 7.5,
      color: COLOR.textoSuave,
      alineacion: 'right',
    });
  }

  return yActual + 9;
}

function bloqueCondiciones(doc: jsPDF, cotizacion: Cotizacion, y: number): number {
  const { condiciones } = cotizacion;
  const separacion = 8;
  const anchoColumna = (ANCHO_UTIL - separacion) / 2;
  const xDerecha = HOJA.margen + anchoColumna + separacion;

  let yActual = asegurarEspacio(doc, y, 42);
  const yInicio = yActual;

  let yi = rotulo(doc, 'La oferta incluye', HOJA.margen, yActual, anchoColumna);
  for (const punto of condiciones.incluye) {
    escribir(doc, '•', HOJA.margen, yi + 3.4, { tamano: 9, color: COLOR.marca, negrita: true });
    yi = escribir(doc, punto, HOJA.margen + 4, yi + 3.4, {
      tamano: 8.5,
      color: COLOR.texto,
      ancho: anchoColumna - 4,
    });
  }

  let yd = rotulo(doc, 'Condiciones comerciales', xDerecha, yInicio, anchoColumna);
  const pares: [string, string][] = [
    ['Tiempo de entrega', condiciones.tiempoEntrega],
    ['Forma de pago', condiciones.formaPago],
    ['Validez de la oferta', `${condiciones.validezDias} días calendario`],
    ['Flete', condiciones.incluyeFlete ? 'Incluido a ciudades principales' : 'No incluido'],
  ];
  for (const [etiqueta, valor] of pares) {
    escribir(doc, etiqueta, xDerecha, yd + 3.6, { tamano: 8.5, color: COLOR.textoSuave });
    escribir(doc, valor, xDerecha + anchoColumna, yd + 3.6, {
      tamano: 8.5,
      color: COLOR.texto,
      negrita: true,
      alineacion: 'right',
    });
    yd += 3.6 + 1.6;
  }

  yActual = Math.max(yi, yd) + 6;

  if (condiciones.observaciones.trim()) {
    yActual = asegurarEspacio(doc, yActual, 24);
    yActual = rotulo(doc, 'Observaciones', HOJA.margen, yActual, ANCHO_UTIL);
    yActual = escribir(doc, condiciones.observaciones.trim(), HOJA.margen, yActual + 3.4, {
      tamano: 8.5,
      color: COLOR.texto,
      ancho: ANCHO_UTIL,
    });
    yActual += 4;
  }

  return yActual;
}

function bloqueCierre(doc: jsPDF, cotizacion: Cotizacion, y: number): void {
  // Lo que ocupa de verdad: agradecimiento, aire, filete y dos líneas de
  // firma. Reservar de más manda la firma sola a una página nueva.
  let yActual = asegurarEspacio(doc, y, 25);

  yActual = escribir(doc, AGRADECIMIENTO, HOJA.margen, yActual + 2, {
    tamano: 8.5,
    color: COLOR.textoSuave,
    ancho: ANCHO_UTIL,
  });

  yActual += 11;
  const anchoFirma = 62;
  regla(doc, HOJA.margen, yActual, anchoFirma, COLOR.texto, 0.3);
  yActual = escribir(doc, cotizacion.asesor, HOJA.margen, yActual + 4, {
    tamano: 9,
    negrita: true,
    color: COLOR.texto,
  });
  escribir(doc, `Asesor comercial · ${EMPRESA.nombreComercial}`, HOJA.margen, yActual, {
    tamano: 7.5,
    color: COLOR.textoSuave,
  });
}

/**
 * Abre página nueva si el bloque que viene no cabe entero.
 *
 * Partir un bloque de condiciones entre dos páginas se lee mal, y es la clase
 * de detalle por el que una cotización parece hecha a mano.
 */
function asegurarEspacio(doc: jsPDF, y: number, alto: number): number {
  if (y + alto <= HOJA.alto - HOJA.pie - 4) return y;
  doc.addPage();
  cabecera(doc);
  pie(doc);
  return Y_CONTENIDO;
}
