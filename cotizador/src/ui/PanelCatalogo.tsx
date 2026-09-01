/**
 * Buscador del catálogo.
 *
 * 114 referencias son demasiadas para una lista plana: se busca por palabras
 * y se filtra por categoría, y cada resultado muestra el rango de precios y
 * el mínimo, que es lo que el asesor necesita ver antes de añadir la línea.
 */

import { useMemo, useState } from 'react';

import { agruparPorCategoria, buscarProductos, catalogo, rangoDePrecios } from '../dominio/catalogo';
import { pesos, unidades } from '../dominio/formato';
import type { Producto } from '../dominio/tipos';
import { Insignia } from './componentes';

interface Props {
  alAgregar: (producto: Producto) => void;
  productosEnUso: ReadonlySet<string>;
  /** La cotización va en otra moneda: los precios de aquí son en pesos. */
  enDivisa?: boolean;
}

export function PanelCatalogo({ alAgregar, productosEnUso, enDivisa = false }: Props) {
  const [consulta, setConsulta] = useState('');
  const [categoria, setCategoria] = useState('');

  const grupos = useMemo(
    () => agruparPorCategoria(buscarProductos(consulta, categoria || undefined)),
    [consulta, categoria],
  );

  const encontrados = grupos.reduce((total, grupo) => total + grupo.productos.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-neutral-200 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-bold tracking-wide text-marca-700 uppercase">Catálogo</h2>
          <span className="text-xs text-neutral-500">
            {encontrados} de {catalogo.productos.length} referencias
          </span>
        </div>

        {/* El listado está en pesos siempre. Mientras la cotización va en
            pesos no hace falta decirlo; cuando va en dólares, sí: si no, las
            cifras de esta columna y las de la de al lado parecen la misma
            clase de número. */}
        {enDivisa ? (
          <p className="text-xs text-amber-700">
            Precios del listado en pesos (COP). Al añadir una referencia se convierten a la moneda
            de la cotización.
          </p>
        ) : null}

        {/* El texto de las etiquetas va oculto: el rótulo «Catálogo» y el
            marcador de posición bastan a la vista, pero un lector de pantalla
            necesita saber qué es cada control. */}
        <label>
          <span className="sr-only">Buscar referencia en el catálogo</span>
          <input
            className="campo"
            type="search"
            placeholder="Buscar: guaya 40, etiqueta void, bolsa courier…"
            value={consulta}
            onChange={(evento) => setConsulta(evento.currentTarget.value)}
          />
        </label>

        <label>
          <span className="sr-only">Filtrar por categoría</span>
          <select
            className="campo"
            value={categoria}
            onChange={(evento) => setCategoria(evento.currentTarget.value)}
          >
            <option value="">Todas las categorías</option>
            {catalogo.categorias.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {encontrados === 0 ? (
          <p className="p-5 text-sm text-neutral-500">
            Ninguna referencia coincide con «{consulta}». Pruebe con menos palabras.
          </p>
        ) : (
          grupos.map((grupo) => (
            <section key={grupo.categoria}>
              <h3 className="sticky top-0 z-10 border-y border-neutral-200 bg-neutral-50 px-5 py-1.5 text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
                {grupo.categoria}
              </h3>
              <ul>
                {grupo.productos.map((producto) => (
                  <FilaProducto
                    key={producto.id}
                    producto={producto}
                    enUso={productosEnUso.has(producto.id)}
                    alAgregar={alAgregar}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function FilaProducto({
  producto,
  enUso,
  alAgregar,
}: {
  producto: Producto;
  enUso: boolean;
  alAgregar: (producto: Producto) => void;
}) {
  const { minimo, maximo } = rangoDePrecios(producto);

  return (
    <li>
      <button
        type="button"
        onClick={() => alAgregar(producto)}
        aria-label={`Añadir ${producto.nombre} a la cotización`}
        className="group flex w-full items-start gap-3 border-b border-neutral-100 px-5 py-3 text-left transition hover:bg-marca-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-neutral-800">{producto.nombre}</span>
          {/*
            La referencia del listado de precios, debajo del nombre comercial.
            El asesor cotiza con la lista de precios al lado, que dice
            «PRECINTO ANCLA CAJAS», y en pantalla lee «Precinto Ancla para
            Cajas de Seguridad Plásticas»: sin este renglón tendría que
            adivinar que son el mismo producto.
          */}
          {producto.referencia ? (
            <span className="block text-xs text-neutral-400">{producto.referencia}</span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-neutral-500">
              {minimo === maximo ? pesos(minimo) : `${pesos(minimo)} – ${pesos(maximo)}`}
            </span>
            <span className="text-xs text-neutral-400">·</span>
            <span className="text-xs text-neutral-500">
              desde {unidades(producto.minimo)} und.
            </span>
            {producto.empaque ? <Insignia>{producto.empaque}</Insignia> : null}
            {producto.admiteLogo ? <Insignia tono="marca">Con logo</Insignia> : null}
            {producto.medidas?.length ? (
              <Insignia>{producto.medidas.length} medidas</Insignia>
            ) : null}
            {enUso ? <Insignia tono="exito">En la cotización</Insignia> : null}
          </span>
        </span>
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-lg leading-none font-bold text-neutral-500 transition group-hover:bg-marca-600 group-hover:text-white"
        >
          +
        </span>
      </button>
    </li>
  );
}
