/**
 * La ficha de un cliente: sus datos, y el formulario para corregirlos.
 *
 * Sirve para las dos cosas que parecen distintas y son la misma —dar de alta y
 * editar—, porque los campos, las validaciones y el rechazo por NIT repetido
 * son idénticos. Lo único que cambia es si al guardar se llama a `crear` o a
 * `actualizar`, y el título.
 *
 * En esta fase la ficha enseña datos. Sus cotizaciones y sus correos entran
 * aquí en las fases siguientes, cuando exista el enlace entre una cotización y
 * su cliente.
 */

import { useState } from 'react';

import {
  ESTADOS_CLIENTE,
  MOTIVO_COINCIDENCIA,
  NOMBRE_ESTADO_CLIENTE,
  clienteVacio,
  nombreDocumento,
  type Cliente,
  type Coincidencia,
  type DatosCliente,
  type EstadoCliente,
  type TipoCliente,
} from '../../../compartido/clientes';
import { pareceCorreo } from '../../../compartido/texto';
import { FalloApi } from '../api/fallo';
import { ASESORES, CIUDADES_CON_FLETE } from '../datos/empresa';
import { CampoSelect, CampoTexto, Insignia, Seccion } from '../ui/componentes';
import { clientes } from './almacen';

interface Props {
  /** La ficha que se abre, o `null` para dar de alta una nueva. */
  cliente: Cliente | null;
  alVolver: () => void;
  /** Avisa a la lista de que algo cambió, para que se recargue. */
  alGuardar: (cliente: Cliente) => void;
  /** Lleva a la ficha de otro cliente: la que resultó ser la misma. */
  alAbrirOtro: (codigo: string) => void;
}

/** Los datos editables de una ficha existente, o una en blanco. */
function datosDe(cliente: Cliente | null): DatosCliente {
  if (!cliente) return clienteVacio();
  const { codigo: _codigo, creadoEn: _creadoEn, actualizadoEn: _actualizadoEn,
          eliminadoEn: _eliminadoEn, eliminadoPor: _eliminadoPor, ...datos } = cliente;
  return datos;
}

export function FichaCliente({ cliente, alVolver, alGuardar, alAbrirOtro }: Props) {
  const [datos, setDatos] = useState<DatosCliente>(() => datosDe(cliente));
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [duplicado, setDuplicado] = useState('');
  /**
   * Una ficha que se le parece, encontrada antes de guardar.
   *
   * Mientras esté puesta, guardar no escribe nada: la persona tiene que decir
   * si es el mismo cliente o uno distinto. Es la promesa de no fusionar en
   * silencio, hecha pantalla — y el único sitio donde se puede cumplir, porque
   * es la única que sabe lo que quien escribe tenía en la cabeza.
   */
  const [parecido, setParecido] = useState<Coincidencia | null>(null);

  const esNueva = cliente === null;
  const editar = (cambios: Partial<DatosCliente>) => setDatos((actual) => ({ ...actual, ...cambios }));

  /**
   * Guarda, pero antes mira si ya hay una ficha que se le parezca.
   *
   * `alSaltarAviso` es el «es otro cliente, cree la ficha igual» de la persona:
   * la comprobación ya se hizo y ella decidió. El NIT idéntico no pasa por
   * aquí — ése lo rechaza el servidor, porque no es una duda, es un choque.
   */
  const guardar = async (alSaltarAviso = false) => {
    if (guardando) return;
    setGuardando(true);
    setFallo('');
    setDuplicado('');

    try {
      if (!alSaltarAviso) {
        const hallado = await clientes.coincidencia({
          nit: datos.nit,
          correo: datos.correo,
          empresa: datos.empresa,
        });
        // Al editar, encontrarse a uno mismo no es encontrar un duplicado.
        if (hallado && hallado.cliente.codigo !== cliente?.codigo) {
          setParecido(hallado);
          return;
        }
      }

      const guardado = esNueva
        ? await clientes.crear(datos)
        : await clientes.actualizar(cliente.codigo, datos);
      alGuardar(guardado);
    } catch (error) {
      setFallo(error instanceof FalloApi ? error.mensaje : 'No se pudo guardar la ficha.');
      // Con quién se chocó, para poder ofrecer abrir esa ficha en vez de
      // dejar a quien escribe adivinando cuál era.
      if (error instanceof FalloApi && error.codigo === 'cliente-duplicado' && error.detalle) {
        setDuplicado(error.detalle);
      }
    } finally {
      setGuardando(false);
    }
  };

  // Cambiar cualquier dato deja sin sentido el aviso anterior: se buscó con
  // otros datos.
  const editarYLimpiarAviso = (cambios: Partial<DatosCliente>) => {
    setParecido(null);
    editar(cambios);
  };

  const correoMalEscrito = datos.correo.trim() !== '' && !pareceCorreo(datos.correo);
  const sinNombre = datos.empresa.trim() === '';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-neutral-800">
            {esNueva ? 'Cliente nuevo' : datos.empresa || cliente.codigo}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
            {esNueva ? (
              'El código se asigna al guardar.'
            ) : (
              <>
                <span className="font-mono">{cliente.codigo}</span>
                <Insignia tono={cliente.estado === 'activo' ? 'exito' : 'neutro'}>
                  {NOMBRE_ESTADO_CLIENTE[cliente.estado]}
                </Insignia>
                {cliente.eliminadoEn ? <Insignia tono="aviso">En la papelera</Insignia> : null}
              </>
            )}
          </p>
        </div>
        <button type="button" className="boton-secundario" onClick={alVolver}>
          Volver a la lista
        </button>
      </div>

      {fallo ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          <p>{fallo}</p>
          {duplicado ? (
            <p className="mt-2 font-normal">
              Si es el mismo cliente, cierre esto y busque <strong>{duplicado}</strong> en la lista.
            </p>
          ) : null}
        </div>
      ) : null}

      {parecido ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            Puede que este cliente ya esté: <strong>{parecido.cliente.empresa}</strong> (
            {parecido.cliente.codigo}) {MOTIVO_COINCIDENCIA[parecido.clase]}.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Nada se ha guardado todavía. Si es el mismo, abra su ficha y corríjala ahí; si de verdad
            es otro cliente, siga adelante.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="boton-secundario"
              onClick={() => alAbrirOtro(parecido.cliente.codigo)}
            >
              Es el mismo · abrir su ficha
            </button>
            <button
              type="button"
              className="boton-primario"
              disabled={guardando}
              onClick={() => {
                setParecido(null);
                void guardar(true);
              }}
            >
              Es otro cliente · guardar igual
            </button>
          </div>
        </div>
      ) : null}

      <Seccion titulo="Quién es">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <CampoTexto
              etiqueta={datos.tipo === 'persona' ? 'Nombre completo' : 'Empresa'}
              value={datos.empresa}
              placeholder="Razón social o nombre"
              nota={sinNombre ? 'Sin esto no se puede guardar la ficha.' : undefined}
              onChange={(e) => editarYLimpiarAviso({ empresa: e.currentTarget.value })}
            />
          </div>
          <CampoSelect
            etiqueta="Tipo"
            value={datos.tipo}
            onChange={(e) => editarYLimpiarAviso({ tipo: e.currentTarget.value as TipoCliente })}
          >
            <option value="empresa">Empresa</option>
            <option value="persona">Persona natural</option>
          </CampoSelect>
          <CampoTexto
            etiqueta={nombreDocumento(datos.tipo)}
            value={datos.nit}
            placeholder="900.000.000-0"
            nota="Es lo único que impide dos fichas del mismo cliente."
            onChange={(e) => editarYLimpiarAviso({ nit: e.currentTarget.value })}
          />
        </div>
      </Seccion>

      <Seccion titulo="Cómo se le escribe">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto
            etiqueta="Contacto"
            value={datos.contacto}
            placeholder="Nombre de quien atiende"
            onChange={(e) => editarYLimpiarAviso({ contacto: e.currentTarget.value })}
          />
          <CampoTexto
            etiqueta="Cargo"
            value={datos.cargo}
            placeholder="Compras, gerencia…"
            onChange={(e) => editarYLimpiarAviso({ cargo: e.currentTarget.value })}
          />
          <div className="sm:col-span-2">
            <CampoTexto
              etiqueta="Correo"
              type="email"
              value={datos.correo}
              nota={correoMalEscrito ? 'Eso no parece un correo. Revíselo antes de guardar.' : undefined}
              onChange={(e) => editarYLimpiarAviso({ correo: e.currentTarget.value })}
            />
          </div>
          <CampoTexto
            etiqueta="Teléfono"
            value={datos.telefono}
            placeholder="601 000 0000"
            onChange={(e) => editarYLimpiarAviso({ telefono: e.currentTarget.value })}
          />
          <CampoTexto
            etiqueta="WhatsApp"
            value={datos.whatsapp}
            placeholder="300 000 0000"
            onChange={(e) => editarYLimpiarAviso({ whatsapp: e.currentTarget.value })}
          />
        </div>

        <ListaExtra
          titulo="Otros correos"
          valores={datos.correosExtra}
          marcador="otro@cliente.com"
          alCambiar={(correosExtra) => editarYLimpiarAviso({ correosExtra })}
        />
        <ListaExtra
          titulo="Otros teléfonos"
          valores={datos.telefonosExtra}
          marcador="300 000 0000"
          alCambiar={(telefonosExtra) => editarYLimpiarAviso({ telefonosExtra })}
        />
      </Seccion>

      <Seccion titulo="Dónde está">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto
            etiqueta="Ciudad"
            value={datos.ciudad}
            list="ciudades-clientes"
            onChange={(e) => editarYLimpiarAviso({ ciudad: e.currentTarget.value })}
          />
          <CampoTexto
            etiqueta="Dirección"
            value={datos.direccion}
            onChange={(e) => editarYLimpiarAviso({ direccion: e.currentTarget.value })}
          />
        </div>
        <datalist id="ciudades-clientes">
          {CIUDADES_CON_FLETE.map((ciudad) => (
            <option key={ciudad} value={ciudad} />
          ))}
        </datalist>
      </Seccion>

      <Seccion titulo="Cómo lo llevamos">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoSelect
            etiqueta="Asesora"
            value={datos.asesor}
            onChange={(e) => editarYLimpiarAviso({ asesor: e.currentTarget.value })}
          >
            <option value="">Sin asignar</option>
            {ASESORES.map((asesor) => (
              <option key={asesor} value={asesor}>
                {asesor}
              </option>
            ))}
          </CampoSelect>
          <CampoSelect
            etiqueta="Estado"
            value={datos.estado}
            onChange={(e) => editarYLimpiarAviso({ estado: e.currentTarget.value as EstadoCliente })}
          >
            {ESTADOS_CLIENTE.map((estado) => (
              <option key={estado} value={estado}>
                {NOMBRE_ESTADO_CLIENTE[estado]}
              </option>
            ))}
          </CampoSelect>
        </div>

        <label className="mt-3 block">
          <span className="etiqueta">Notas</span>
          <textarea
            className="campo min-h-24"
            value={datos.notas}
            placeholder="Lo que haya que recordar de este cliente."
            onChange={(e) => editarYLimpiarAviso({ notas: e.currentTarget.value })}
          />
        </label>
      </Seccion>

      {/* Pegada abajo: el formulario es largo y el botón de guardar no puede
          quedarse fuera de la vista mientras se rellena. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
        <p className="mr-auto text-xs text-neutral-500">
          {esNueva
            ? 'La ficha queda visible para todo el equipo.'
            : `Última corrección: ${new Date(cliente.actualizadoEn).toLocaleString('es-CO')}`}
        </p>
        <button type="button" className="boton-secundario" onClick={alVolver} disabled={guardando}>
          Cancelar
        </button>
        <button
          type="button"
          className="boton-primario"
          onClick={() => void guardar()}
          disabled={guardando || sinNombre || parecido !== null}
        >
          {guardando ? 'Guardando…' : esNueva ? 'Crear cliente' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

/**
 * Los correos y teléfonos que se fueron sumando.
 *
 * Existen porque, cuando una cotización traiga un dato distinto al de la ficha,
 * la pantalla va a ofrecer «guardar los dos» además de «reemplazar». Sin un
 * sitio donde poner el segundo, la única salida sería pisar el primero — que es
 * justo lo que no se quiere hacer en silencio.
 */
function ListaExtra({
  titulo,
  valores,
  marcador,
  alCambiar,
}: {
  titulo: string;
  valores: string[];
  marcador: string;
  alCambiar: (valores: string[]) => void;
}) {
  const [nuevo, setNuevo] = useState('');

  const agregar = () => {
    const limpio = nuevo.trim();
    if (!limpio || valores.includes(limpio)) {
      setNuevo('');
      return;
    }
    alCambiar([...valores, limpio]);
    setNuevo('');
  };

  return (
    <div className="mt-4">
      <span className="etiqueta">{titulo}</span>

      {valores.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {valores.map((valor) => (
            <li
              key={valor}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-100 py-1 pr-1 pl-3 text-sm text-neutral-700"
            >
              {valor}
              <button
                type="button"
                aria-label={`Quitar ${valor}`}
                className="flex size-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                onClick={() => alCambiar(valores.filter((v) => v !== valor))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <input
          className="campo"
          value={nuevo}
          placeholder={marcador}
          onChange={(e) => setNuevo(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter añade el dato; sin esto, dentro de un formulario, enviaría
            // la ficha entera con el campo a medio escribir.
            if (e.key === 'Enter') {
              e.preventDefault();
              agregar();
            }
          }}
        />
        <button type="button" className="boton-secundario shrink-0" onClick={agregar} disabled={!nuevo.trim()}>
          Añadir
        </button>
      </div>
    </div>
  );
}
