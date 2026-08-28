-- La base de clientes.
--
-- Hasta ahora los datos del cliente vivían **dentro** de cada cotización, y
-- sólo ahí: el NIT de una empresa a la que se le cotizó cinco veces estaba
-- escrito cinco veces, y borrar la última cotización se llevaba por delante lo
-- único que quedaba de ella. Tampoco había forma de responder «¿qué le hemos
-- cotizado a éste?» sin buscar por nombre y confiar en que siempre se escribió
-- igual.
--
-- Esta tabla invierte la relación: el cliente pasa a existir por su cuenta y la
-- cotización lo referencia. Lo que se guarda dentro del documento de cada
-- cotización **no cambia** —el PDF que el cliente tiene en la mano es
-- intocable— pero deja de ser el único sitio donde vive el dato.
--
-- La regla que gobierna todo lo demás: **la ficha manda y la cotización toma
-- prestado**. Ningún dato de aquí se pisa desde una cotización sin que alguien
-- lo apruebe en pantalla.

CREATE TABLE clientes (
  -- `CLI-0001`. Lo asigna el servidor, como el consecutivo de cotizaciones.
  -- No sirve para reconocer a un cliente que llega —cuando llega, todavía no
  -- tiene código— sino para nombrarlo y enlazarlo una vez existe.
  codigo            TEXT PRIMARY KEY,

  empresa           TEXT NOT NULL,
  nit               TEXT NOT NULL DEFAULT '',
  -- El NIT sin puntos ni guiones. Es la columna con la que se compara: para la
  -- base, `900.437.215-8` y `9004372158` tienen que ser el mismo cliente.
  nit_digitos       TEXT NOT NULL DEFAULT '',
  tipo              TEXT NOT NULL DEFAULT 'empresa'
                      CHECK (tipo IN ('empresa', 'persona')),

  contacto          TEXT NOT NULL DEFAULT '',
  cargo             TEXT NOT NULL DEFAULT '',
  telefono          TEXT NOT NULL DEFAULT '',
  whatsapp          TEXT NOT NULL DEFAULT '',
  correo            TEXT NOT NULL DEFAULT '',
  -- El correo en minúsculas, por lo mismo que `nit_digitos`: es el segundo
  -- peldaño para reconocer a un cliente que aún no ha dado su NIT.
  correo_normal     TEXT NOT NULL DEFAULT '',

  -- Los teléfonos y correos que se fueron sumando, como listas JSON.
  --
  -- Existen por una razón concreta: cuando una cotización trae un correo
  -- distinto al de la ficha, la pantalla ofrece «guardar los dos» además de
  -- «reemplazar». Sin un sitio donde poner el segundo, la única opción sería
  -- pisar el primero, y pisar es justo lo que no se quiere hacer en silencio.
  --
  -- Van como JSON y no como tabla aparte porque son listas cortas que siempre
  -- se leen enteras junto al cliente, nunca por su cuenta. El día que haya que
  -- buscar por ellas o darles nombre propio, se normalizan.
  correos_extra     TEXT NOT NULL DEFAULT '[]',
  telefonos_extra   TEXT NOT NULL DEFAULT '[]',

  ciudad            TEXT NOT NULL DEFAULT '',
  direccion         TEXT NOT NULL DEFAULT '',
  notas             TEXT NOT NULL DEFAULT '',

  -- Quién atiende a este cliente. Es lo que decide qué firma lleva el correo
  -- que se le manda, así que no es un adorno del listado.
  asesor            TEXT NOT NULL DEFAULT '',

  estado            TEXT NOT NULL DEFAULT 'prospecto'
                      CHECK (estado IN ('prospecto', 'activo', 'inactivo')),

  -- El nombre sin tildes ni mayúsculas. Tercer peldaño para reconocer, y de
  -- paso el orden alfabético del listado: ordenar por `empresa` a secas pondría
  -- «Ávila» detrás de «Zapata».
  empresa_normal    TEXT NOT NULL DEFAULT '',

  creado_en         TEXT NOT NULL,
  actualizado_en    TEXT NOT NULL,

  -- La papelera, igual que en cotizaciones y por lo mismo: borrar en dos
  -- tiempos convierte «me llevé el que no era» en algo que se deshace. Borrar
  -- un cliente **no borra sus cotizaciones**; son cosas distintas.
  eliminado_en      TEXT,
  eliminado_por     TEXT
);

-- Dos clientes con el mismo NIT son el mismo cliente, y la base lo impone en
-- vez de confiar en que el código se acuerde de comprobarlo. Es parcial —sólo
-- donde hay NIT— porque los prospectos que aún no lo han dado son legítimos y
-- son varios.
--
-- El índice alcanza también a los de la papelera, a propósito: dar de alta a
-- alguien que está retirado tiene que decir «está en la papelera» y ofrecer
-- restaurarlo, no crear un segundo con el mismo NIT.
CREATE UNIQUE INDEX clientes_nit ON clientes (nit_digitos) WHERE nit_digitos <> '';

CREATE INDEX clientes_correo ON clientes (correo_normal) WHERE correo_normal <> '';
-- El listado se abre en orden alfabético, y la papelera es la otra mitad de
-- todas sus consultas.
CREATE INDEX clientes_papelera ON clientes (eliminado_en, empresa_normal);

-- Contadores con nombre, para lo que necesite numerarse y no dependa del año.
--
-- `consecutivos` no vale: aquélla es «un contador por año» y su clave es el
-- año, porque la numeración de cotizaciones se reinicia cada enero. Los
-- códigos de cliente no se reinician nunca —`CLI-0500` es el quinientos de
-- siempre, no el quinientos de 2027— así que es otro contador, no otra fila
-- de aquél.
CREATE TABLE contadores (
  nombre TEXT PRIMARY KEY,
  valor  INTEGER NOT NULL
);
