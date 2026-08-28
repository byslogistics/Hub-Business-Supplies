/**
 * El contrato del panel de clientes: qué es un cliente y qué viaja por el cable.
 *
 * Vive fuera del cotizador y del Worker por lo mismo que `historial.ts`: si un
 * día los clientes dejan de estar en Cloudflare, este archivo es lo que la otra
 * implementación tiene que cumplir.
 *
 * La decisión que explica casi todo lo de abajo es **cómo se reconoce a un
 * cliente que llega**. Ver `COINCIDENCIA` y `claveDe`.
 */

import { correoNormal, sinTildes, soloDigitos } from './texto';

/** En qué punto de la relación está. */
export type EstadoCliente = 'prospecto' | 'activo' | 'inactivo';

export const ESTADOS_CLIENTE: readonly EstadoCliente[] = ['prospecto', 'activo', 'inactivo'];

export const NOMBRE_ESTADO_CLIENTE: Record<EstadoCliente, string> = {
  prospecto: 'Prospecto',
  activo: 'Cliente activo',
  inactivo: 'Inactivo',
};

export function esEstadoCliente(valor: unknown): valor is EstadoCliente {
  return valor === 'prospecto' || valor === 'activo' || valor === 'inactivo';
}

/**
 * Empresa o persona natural.
 *
 * No es cosmético: decide si el documento se llama NIT o cédula, y en Colombia
 * cotizarle a una persona natural es corriente.
 */
export type TipoCliente = 'empresa' | 'persona';

export function esTipoCliente(valor: unknown): valor is TipoCliente {
  return valor === 'empresa' || valor === 'persona';
}

/** Cómo se llama el documento de identidad de cada uno. */
export function nombreDocumento(tipo: TipoCliente): string {
  return tipo === 'persona' ? 'Cédula' : 'NIT';
}

/**
 * Lo que se puede escribir de un cliente.
 *
 * Separado de `Cliente` a propósito: esto es lo que viaja al crear o editar, y
 * lo de allá lleva además lo que pone el servidor —el código, las fechas, la
 * papelera— que nunca se acepta de quien llama.
 */
export interface DatosCliente {
  empresa: string;
  nit: string;
  tipo: TipoCliente;
  contacto: string;
  cargo: string;
  telefono: string;
  whatsapp: string;
  correo: string;
  /** Los que se fueron sumando. El principal es `correo` y no está aquí. */
  correosExtra: string[];
  telefonosExtra: string[];
  ciudad: string;
  direccion: string;
  notas: string;
  /** Quién lo atiende. Decide qué firma llevará el correo que se le mande. */
  asesor: string;
  estado: EstadoCliente;
}

export interface Cliente extends DatosCliente {
  /** `CLI-0001`. Lo asigna el servidor y no cambia nunca. */
  codigo: string;
  creadoEn: string;
  actualizadoEn: string;
  /** Sólo las fichas de la papelera lo traen. */
  eliminadoEn: string | null;
  eliminadoPor: string | null;
}

/** Una ficha vacía, para el formulario de «cliente nuevo». */
export function clienteVacio(): DatosCliente {
  return {
    empresa: '',
    nit: '',
    tipo: 'empresa',
    contacto: '',
    cargo: '',
    telefono: '',
    whatsapp: '',
    correo: '',
    correosExtra: [],
    telefonosExtra: [],
    ciudad: '',
    direccion: '',
    notas: '',
    asesor: '',
    estado: 'prospecto',
  };
}

export interface FiltroClientes {
  /** Busca en código, empresa, NIT, contacto, correo y ciudad. */
  texto?: string;
  estado?: EstadoCliente;
  asesor?: string;
  pagina?: number;
  /** `true` lista la papelera en vez de las fichas a la vista. */
  papelera?: boolean;
}

export interface PaginaClientes {
  clientes: Cliente[];
  /** Cuántos cumplen el filtro en total, no cuántos trae esta página. */
  cuantos: number;
  pagina: number;
  porPagina: number;
}

export const CLIENTES_POR_PAGINA = 25;

/**
 * A qué fichas alcanza una operación en bloque. El gemelo de `Seleccion` del
 * historial, y por las mismas razones: mil códigos no viajan por el cable.
 */
export type SeleccionClientes =
  | { readonly codigos: readonly string[] }
  | { readonly todos: true; readonly filtro: FiltroClientes };

export const MAXIMO_SELECCION_CLIENTES = 500;

/** Cuántas fichas tocó una operación en bloque. */
export interface CuantosClientes {
  cuantos: number;
}

/** `CLI-0007`. Sin año: los códigos de cliente no se reinician en enero. */
export function formatoCodigoCliente(valor: number): string {
  return `CLI-${String(valor).padStart(4, '0')}`;
}

// --- Cómo se reconoce a un cliente ------------------------------------------

/**
 * Por qué el código de cliente **no** sirve para reconocerlo.
 *
 * Es la pregunta que más se repite y conviene dejarla escrita. Cuando llega una
 * cotización hay que decidir «¿a éste ya lo tengo?», y en ese momento el código
 * todavía no existe: generarlo respondería «es nuevo» siempre, y así es como se
 * llena una base de duplicados. El código es el resultado de haber reconocido
 * al cliente, no la forma de reconocerlo.
 *
 * Lo que sí reconoce es esta escalera, en orden, y el primer peldaño que dé
 * respuesta gana:
 *
 * 1. **NIT o cédula**, comparando sólo los dígitos. Es lo único que no se
 *    repite y no cambia; si coincide, es el mismo aunque el nombre esté escrito
 *    de otra forma.
 * 2. **Un documento que se le parece**: el mismo número con un dígito de más o
 *    de menos al final. Es el NIT escrito con y sin dígito de verificación
 *    —`900.437.215-8` y `900437215`— que es, con diferencia, la forma más común
 *    de acabar con dos fichas del mismo cliente en Colombia.
 * 3. **Correo**, en minúsculas, cuando no hay NIT. Cubre al prospecto que
 *    todavía no ha dado sus datos, que es justo el primer contacto.
 * 4. **Nombre de la empresa**, sin tildes ni mayúsculas. Último recurso.
 *
 * Sólo el peldaño 1 puede unir solo. Los otros tres son flojos —dos empresas
 * comparten el correo de la misma secretaria, «Transportes del Norte» hay
 * varias, y una cédula de diez dígitos puede parecerse a un NIT de nueve más su
 * verificación— así que quien los use tiene que **preguntar antes de unir**,
 * nunca fusionar en silencio. Esa diferencia es la que lleva `fuerte`.
 *
 * El orden entre el 1 y el 2 importa y no es casual: un documento idéntico se
 * da por hecho, y uno parecido se consulta. Al revés se estaría preguntando por
 * algo que ya se sabe, y peor, uniendo por parecido lo que quizá no lo es.
 */
export const COINCIDENCIA = ['nit', 'parecido', 'correo', 'empresa'] as const;

export type ClaseCoincidencia = (typeof COINCIDENCIA)[number];

/** Si una coincidencia basta para unir sin preguntar. Sólo el NIT exacto. */
export function coincidenciaFuerte(clase: ClaseCoincidencia): boolean {
  return clase === 'nit';
}

/**
 * Cuántos dígitos hacen falta para que valga la pena comparar dos documentos.
 *
 * Por debajo de esto la comparación deja de significar algo: un «12» y un «123»
 * se parecerían, y de eso no se puede sacar ninguna conclusión.
 */
const MINIMO_DIGITOS_DOCUMENTO = 8;

/**
 * Si dos documentos se diferencian sólo en un dígito final.
 *
 * En Colombia el NIT se escribe de las dos formas —`900.437.215-8` con su
 * dígito de verificación y `900437215` sin él— y quien teclea una hoy y la otra
 * mañana acaba con dos fichas del mismo cliente. Esto lo detecta.
 *
 * **No es prueba de que sean el mismo**: una cédula de diez dígitos puede
 * parecerse a un NIT de nueve más su verificación sin tener nada que ver. Por
 * eso es una coincidencia floja, que se pregunta y no se aplica sola.
 */
export function documentosParecidos(a: string, b: string): boolean {
  const unoDigitos = soloDigitos(a);
  const otroDigitos = soloDigitos(b);
  if (!unoDigitos || !otroDigitos || unoDigitos === otroDigitos) return false;

  const [corto, largo] =
    unoDigitos.length < otroDigitos.length ? [unoDigitos, otroDigitos] : [otroDigitos, unoDigitos];

  if (corto.length < MINIMO_DIGITOS_DOCUMENTO) return false;
  return largo.length === corto.length + 1 && largo.startsWith(corto);
}

/** Por qué se parecen, dicho para que lo lea una persona. */
export const MOTIVO_COINCIDENCIA: Record<ClaseCoincidencia, string> = {
  nit: 'tiene el mismo NIT o documento',
  parecido: 'tiene un documento casi igual: el mismo número con un dígito de diferencia',
  correo: 'tiene ese mismo correo',
  empresa: 'se llama igual',
};

/** Lo mínimo para buscar a un cliente que llega. */
export interface ClaveCliente {
  nit: string;
  correo: string;
  empresa: string;
}

/**
 * Deja los tres datos listos para comparar: dígitos, minúsculas y sin tildes.
 *
 * Lo usan los dos lados —el servidor para consultar y la pantalla para decidir
 * si hace falta preguntar— y por eso está aquí y no en ninguno de los dos.
 */
export function claveDe(datos: Partial<ClaveCliente> | null | undefined): ClaveCliente {
  return {
    nit: soloDigitos(datos?.nit),
    correo: correoNormal(datos?.correo),
    empresa: sinTildes(datos?.empresa),
  };
}

/** Si esa clave tiene con qué buscar algo. Sin nada de esto no hay cliente. */
export function claveUtil(clave: ClaveCliente): boolean {
  return Boolean(clave.nit || clave.correo || clave.empresa);
}

/** Lo que responde el servidor al preguntar «¿a éste ya lo tengo?». */
export interface Coincidencia {
  cliente: Cliente;
  /** Por cuál de los tres peldaños se encontró. */
  clase: ClaseCoincidencia;
  /** `true` sólo con el NIT: se puede dar por hecho sin preguntar. */
  fuerte: boolean;
}
