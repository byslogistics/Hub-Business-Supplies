/**
 * Las columnas de un cliente cuando viaja como hoja de cálculo.
 *
 * Un solo sitio para las tres cosas que tienen que coincidir o el archivo deja
 * de servir: **la plantilla** que se descarga, **la exportación** de la lista y
 * **la importación** por lote. Escribirlas por separado sería garantizar que un
 * día la plantilla pida «Asesora» y el lector busque «Vendedora».
 *
 * De ahí sale una propiedad que vale la pena tener: se puede **exportar la
 * lista, corregirla en Excel y volver a subirla**. Es el mismo formato.
 */

import { esEstadoCliente, esTipoCliente, type Cliente, type DatosCliente } from './clientes';
import { sinTildes } from './texto';

/** Con qué se separan los correos y teléfonos adicionales dentro de una celda. */
export const SEPARADOR_LISTA = ' | ';

export interface ColumnaCliente {
  /** El encabezado que lleva la plantilla y el que escribe la exportación. */
  readonly titulo: string;
  /**
   * Otros encabezados que se aceptan al leer un archivo ajeno.
   *
   * Se comparan sin tildes ni mayúsculas, así que aquí sólo hacen falta las
   * formas realmente distintas. Es lo que permite subir el Excel que ya tenía
   * la empresa sin renombrarle las columnas a mano.
   */
  readonly alias?: readonly string[];
  /** Qué sale en el archivo para este cliente. */
  readonly escribir: (cliente: Cliente) => string;
  /**
   * Qué parte de una ficha significa esa celda.
   *
   * Devuelve un trozo y no un valor suelto para que las columnas que traducen
   * —tipo, estado— y las que son listas puedan resolverlo por su cuenta. Una
   * celda vacía devuelve un trozo vacío: **no llenar no es lo mismo que
   * borrar**, y quien importa no puede vaciar un dato sin querer.
   */
  readonly leer: (texto: string) => Partial<DatosCliente>;
}

/** Una celda con texto, o nada. Lo vacío nunca escribe. */
function siHay(texto: string, hacer: (limpio: string) => Partial<DatosCliente>): Partial<DatosCliente> {
  const limpio = texto.trim();
  return limpio ? hacer(limpio) : {};
}

/** Una celda de lista: `uno@x.com | dos@x.com`, o con coma, o con salto. */
function comoLista(texto: string): string[] {
  return texto
    .split(/[|,;\n]/)
    .map((parte) => parte.trim())
    .filter(Boolean);
}

export const COLUMNAS_CLIENTE: readonly ColumnaCliente[] = [
  {
    titulo: 'Empresa',
    alias: ['nombre', 'razon social', 'cliente', 'empresa o nombre'],
    escribir: (c) => c.empresa,
    leer: (t) => siHay(t, (v) => ({ empresa: v })),
  },
  {
    titulo: 'Tipo',
    alias: ['tipo de cliente', 'persona o empresa'],
    escribir: (c) => (c.tipo === 'persona' ? 'Persona' : 'Empresa'),
    leer: (t) =>
      siHay(t, (v) => {
        const limpio = sinTildes(v);
        if (limpio.startsWith('persona') || limpio.startsWith('natural')) return { tipo: 'persona' };
        return { tipo: esTipoCliente(limpio) ? limpio : 'empresa' };
      }),
  },
  {
    titulo: 'NIT o cédula',
    alias: ['nit', 'cedula', 'nit/cc', 'nit / cc', 'documento', 'identificacion'],
    escribir: (c) => c.nit,
    leer: (t) => siHay(t, (v) => ({ nit: v })),
  },
  {
    titulo: 'Contacto',
    alias: ['nombre del contacto', 'persona de contacto', 'encargado'],
    escribir: (c) => c.contacto,
    leer: (t) => siHay(t, (v) => ({ contacto: v })),
  },
  {
    titulo: 'Cargo',
    alias: ['puesto'],
    escribir: (c) => c.cargo,
    leer: (t) => siHay(t, (v) => ({ cargo: v })),
  },
  {
    titulo: 'Teléfono',
    alias: ['telefono fijo', 'tel', 'fijo'],
    escribir: (c) => c.telefono,
    leer: (t) => siHay(t, (v) => ({ telefono: v })),
  },
  {
    titulo: 'WhatsApp',
    alias: ['celular', 'movil', 'wpp'],
    escribir: (c) => c.whatsapp,
    leer: (t) => siHay(t, (v) => ({ whatsapp: v })),
  },
  {
    titulo: 'Correo',
    alias: ['email', 'correo electronico', 'e-mail', 'mail'],
    escribir: (c) => c.correo,
    leer: (t) => siHay(t, (v) => ({ correo: v })),
  },
  {
    titulo: 'Otros correos',
    alias: ['correos adicionales', 'correos extra', 'otros emails'],
    escribir: (c) => c.correosExtra.join(SEPARADOR_LISTA),
    leer: (t) => siHay(t, (v) => ({ correosExtra: comoLista(v) })),
  },
  {
    titulo: 'Otros teléfonos',
    alias: ['telefonos adicionales', 'telefonos extra', 'otros celulares'],
    escribir: (c) => c.telefonosExtra.join(SEPARADOR_LISTA),
    leer: (t) => siHay(t, (v) => ({ telefonosExtra: comoLista(v) })),
  },
  {
    titulo: 'Ciudad',
    escribir: (c) => c.ciudad,
    leer: (t) => siHay(t, (v) => ({ ciudad: v })),
  },
  {
    titulo: 'Dirección',
    alias: ['direccion de entrega'],
    escribir: (c) => c.direccion,
    leer: (t) => siHay(t, (v) => ({ direccion: v })),
  },
  {
    titulo: 'Asesora',
    alias: ['asesor', 'vendedora', 'vendedor', 'comercial', 'responsable'],
    escribir: (c) => c.asesor,
    leer: (t) => siHay(t, (v) => ({ asesor: v })),
  },
  {
    titulo: 'Estado',
    escribir: (c) => NOMBRE_ESTADO_EN_ARCHIVO[c.estado],
    leer: (t) =>
      siHay(t, (v) => {
        const limpio = sinTildes(v);
        if (esEstadoCliente(limpio)) return { estado: limpio };
        // «Cliente activo» es lo que escribe la exportación, y también lo que
        // escribe a mano quien llena la plantilla.
        if (limpio.includes('activo')) return { estado: 'activo' };
        if (limpio.includes('inactivo')) return { estado: 'inactivo' };
        return { estado: 'prospecto' };
      }),
  },
  {
    titulo: 'Notas',
    alias: ['observaciones', 'comentarios'],
    escribir: (c) => c.notas,
    leer: (t) => siHay(t, (v) => ({ notas: v })),
  },
];

/** Cómo se escribe cada estado en el archivo. */
const NOMBRE_ESTADO_EN_ARCHIVO = {
  prospecto: 'Prospecto',
  activo: 'Cliente activo',
  inactivo: 'Inactivo',
} as const;

/**
 * La columna del código, que no es un dato del cliente sino su identidad.
 *
 * Va aparte de las demás porque se comporta al revés: la exportación la
 * escribe, pero al importar **no se rellena a mano nunca** —el código lo
 * asigna el servidor—. Sólo sirve para el viaje de ida y vuelta: exportar la
 * lista, corregirla en Excel y volver a subirla sabiendo exactamente a qué
 * ficha va cada fila.
 */
export const COLUMNA_CODIGO = {
  titulo: 'Código',
  alias: ['codigo de cliente', 'cod cliente', 'cod. cliente'],
} as const;

/** Todos los encabezados de la plantilla, en orden. */
export function encabezados(): string[] {
  return [COLUMNA_CODIGO.titulo, ...COLUMNAS_CLIENTE.map((c) => c.titulo)];
}

/**
 * Qué columna es un encabezado leído de un archivo.
 *
 * Compara sin tildes ni mayúsculas y contra los alias, porque el archivo que
 * llega puede venir de cualquier parte: «NIT», «Nit / CC» y «nit o cédula» son
 * la misma columna, y obligar a que coincidan letra por letra convertiría la
 * importación en un ejercicio de renombrar encabezados.
 */
export function columnaDe(encabezado: string): ColumnaCliente | null {
  const buscado = sinTildes(encabezado);
  if (!buscado) return null;

  return (
    COLUMNAS_CLIENTE.find(
      (columna) =>
        sinTildes(columna.titulo) === buscado ||
        (columna.alias ?? []).some((alias) => sinTildes(alias) === buscado),
    ) ?? null
  );
}

/** Si ese encabezado es el del código de cliente. */
export function esColumnaCodigo(encabezado: string): boolean {
  const buscado = sinTildes(encabezado);
  return (
    sinTildes(COLUMNA_CODIGO.titulo) === buscado ||
    COLUMNA_CODIGO.alias.some((alias) => sinTildes(alias) === buscado)
  );
}
