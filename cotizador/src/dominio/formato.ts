/**
 * Formato colombiano de cifras y fechas.
 *
 * Los `Intl.NumberFormat` se crean una sola vez: construirlos dentro de un
 * render cuesta más que formatear.
 */

const MONEDA = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MONEDA_SIN_SIMBOLO = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const ENTERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const PORCENTAJE = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * La moneda, dicha con todas las letras.
 *
 * Todo lo que cotiza esta empresa va en pesos colombianos: no hay catálogo ni
 * tarifa en otra moneda. Aun así los documentos que salen al cliente lo
 * declaran, porque el «$» que imprime `pesos()` lo comparten el peso y el
 * dólar —y la empresa atiende también Panamá—, y en las celdas de la tabla del
 * PDF el número va sin símbolo ninguno.
 *
 * Vive aquí, junto a los formateadores, para que el PDF y el mensaje de
 * WhatsApp digan exactamente lo mismo.
 */
export const MONEDA_DECLARADA =
  'Todas las cifras están expresadas en pesos colombianos (COP).';

/** "$ 1.250" — para pantalla. */
export function pesos(valor: number): string {
  return MONEDA.format(valor).replace(/\s/g, ' ');
}

/**
 * "1.250" — para las tablas del PDF, donde repetir el símbolo en cada celda
 * sólo añadiría ruido. La moneda la declara `MONEDA_DECLARADA` bajo la tabla,
 * una vez y para todas las cifras del documento.
 */
export function pesosSinSimbolo(valor: number): string {
  return MONEDA_SIN_SIMBOLO.format(valor);
}

export function unidades(valor: number): string {
  return ENTERO.format(valor);
}

export function porcentaje(fraccion: number): string {
  return PORCENTAJE.format(fraccion);
}

/** ISO `2026-08-13` → `13 de agosto de 2026`. */
export function fechaLarga(iso: string): string {
  return FECHA_LARGA.format(desdeIso(iso));
}

/** ISO `2026-08-13` → `13/08/2026`. */
export function fechaCorta(iso: string): string {
  const d = desdeIso(iso);
  return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
    .map((n, i) => (i < 2 ? String(n).padStart(2, '0') : n))
    .join('/');
}

export function hoyIso(): string {
  return aIso(new Date());
}

export function sumarDias(iso: string, dias: number): string {
  const fecha = desdeIso(iso);
  fecha.setDate(fecha.getDate() + dias);
  return aIso(fecha);
}

function aIso(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * `new Date('2026-08-13')` se interpreta como UTC y en Colombia (UTC-5) cae en
 * el día anterior. Construir la fecha por partes la deja en hora local.
 */
function desdeIso(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio ?? 1970, (mes ?? 1) - 1, dia ?? 1);
}
