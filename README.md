# Hub · B&S Logistics

Las herramientas internas de **Business & Supplies Logistics S.A.S.** en un
solo sitio, detrás de una sola puerta. Un empleado entra, se identifica una vez
y ve lo que necesita.

```
/                 la portada con las tarjetas
/cotizador/       el cotizador y el historial de cotizaciones
/api/             el historial por dentro (sólo lo usa el cotizador)
```

---

## Qué hay aquí y qué no

| Herramienta       | Dónde vive                       |
| ----------------- | -------------------------------- |
| **Portada**       | Aquí: `index.html`               |
| **Cotizador**     | Aquí: `cotizador/`               |
| **Historial**     | Aquí: `worker/` + D1             |
| **Página web**    | Fuera: `byslogistics-web`        |
| **CRM · Chatbot** | Fuera: su propio Worker          |

El cotizador **se mudó a este repositorio** con toda su historia de commits: el
repo `Cotizador-Business-Supplies` ya no recibe cambios. Convendría archivarlo
(Settings → Archive this repository), no borrarlo: archivar lo deja en sólo
lectura conservando sus PRs y su historia, y borrarlo se lleva todo eso por
delante sin ganar nada.

---

## El historial de cotizaciones

Hasta ahora una cotización emitida no dejaba rastro en ningún sitio: salía el
PDF, se mandaba por WhatsApp y ahí se acababa. Ahora cada cotización emitida
queda guardada, y las dos socias ven la misma lista desde donde sea.

De cada una se guarda **el documento JSON completo**, que es la fuente de
verdad: al reabrirla se regenera un PDF idéntico al que recibió el cliente,
aunque el listado de precios haya cambiado diez veces desde entonces. Las
columnas del listado —cliente, total, unidades— las calcula el servidor a
partir de ese mismo documento, con las mismas funciones que usa la pantalla,
para que el total del historial no pueda discrepar del total del PDF.

En la pantalla del historial se puede buscar por número, empresa, NIT o
contacto, filtrar por fechas y por estado, volver a bajar el PDF, reabrir una
cotización para hacerle una versión nueva, y marcar en qué acabó: **emitida**,
**aceptada** o **perdida**. Ese último dato es el que convierte el historial en
algo que se mira: cuánto se cotizó el mes pasado y cuánto de eso entró.

### El consecutivo dejó de ser local

`COT-2026-0001` lo llevaba el navegador de cada asesor. Con una sola persona
funcionaba; con dos, cada navegador tenía su propio contador y dos clientes
distintos podían recibir la misma «COT-2026-0007» sin que nadie se enterara
hasta cruzar los dos PDF. Ahora el número lo da la base de datos, en una sola
sentencia SQL que dos personas emitiendo a la vez no pueden desordenar.

La contrapartida es que el número **ya no se puede saber por adelantado**:
depende de quién emita primero. Por eso la pantalla dice «se asigna al emitir»
en vez de enseñar un número que podría cambiar delante de quien lo está
leyendo.

El campo sigue siendo editable, porque hay un caso real que lo necesita: pasar
al historial una cotización vieja del Excel con el número que tuvo entonces. Lo
que ya no se puede es pisar con él una cotización ajena. Si el número escrito
ya es de otro cliente, el historial lo rechaza y dice de quién es; si es del
mismo, se actualiza como siempre —bajar el PDF y mandar después el WhatsApp es
una cotización, no dos.

### Sin conexión no se emite

Armar la cotización sigue funcionando entero en el navegador —el catálogo, los
precios, la vista previa del PDF— y el borrador se sigue guardando solo. Lo
único que necesita red es **emitir**, porque el número viene del servidor.

Es deliberado. La alternativa sería dejar que el navegador se invente un número
provisional, pero entonces el PDF que ya está en manos del cliente diría un
número y el historial otro. Un envío que espera a que vuelva la red se explica;
dos cotizaciones distintas con el mismo número, no.

---

## Puesta en marcha

```bash
npm run instalar     # dependencias del hub y del cotizador
npm test             # 75 pruebas del cotizador
npm run build        # deja el sitio entero en publico/
```

Para trabajar en la pantalla, dos terminales:

```bash
npm run dev          # el Worker y el historial, en :8787
npm run pantalla     # el cotizador con recarga en caliente, en :5173
```

El segundo manda las llamadas de `/api` al primero. Para que el historial
responda en local hace falta un archivo `.dev.vars` —que no se versiona— con:

```
MODO=desarrollo
CORREO_DESARROLLO=usted@byslogistics.com.co
```

`MODO=desarrollo` salta la comprobación de Cloudflare Access, que en local no
existe. **Nunca en producción**: sin esa comprobación, el historial queda
abierto a quien dé con la dirección.

---

## Publicar

Falta hacer cuatro cosas a mano, una sola vez. Ninguna se puede automatizar
desde aquí: todas piden la sesión de Cloudflare.

### 1. Crear la base de datos

```bash
npx wrangler d1 create bys-cotizaciones
```

Imprime un `database_id`. Hay que pegarlo en `wrangler.jsonc`, donde ahora dice
`"PENDIENTE"`.

### 2. Crear las tablas

```bash
npm run migrar          # las crea en la base de verdad
npm run migrar:local    # y en la de pruebas, para el `npm run dev`
```

### 3. Poner la puerta: Cloudflare Access

En el panel de Cloudflare, **Zero Trust → Access → Applications → Add an
application → Self-hosted**:

- **Dominio**: el del hub (p. ej. `herramientas.byslogistics.com.co`).
- **Política**: `Allow`, con la regla *Emails* y los correos de quien deba
  entrar — las dos socias y los asesores. Cualquier correo que no esté en esa
  lista no pasa de la primera pantalla.

Cuando quede creada, la aplicación muestra su **Application Audience (AUD)
Tag**. Ese valor y el dominio del equipo (`algo.cloudflareaccess.com`) van en
`wrangler.jsonc`, en `ACCESO_DOMINIO` y `ACCESO_AUD`. Hasta que estén puestos,
el historial rechaza todo con «sin acceso», que es lo correcto: sin Access
configurado no hay forma de saber quién está entrando.

Access protege **el sitio entero**, no sólo el historial: la portada, el
cotizador y las herramientas que se añadan mañana. Es la razón principal por la
que el hub está en Cloudflare y no en otro sitio — el acceso se resuelve una
vez, en la puerta, y no una vez por herramienta.

> Añadir a alguien al equipo es añadir su correo a esa política. No hay usuarios
> ni contraseñas que gestionar aquí dentro.

### 4. Desplegar

```bash
npm run desplegar
```

Construye `publico/` y lo sube junto con el Worker. El dominio se conecta en
**Workers & Pages → bys-hub → Settings → Domains & Routes**.

Ojo: `wrangler.jsonc` lleva `workers_dev: false` a propósito. La dirección
`bys-hub.<cuenta>.workers.dev` no pasa por Access, así que dejarla encendida
abriría una puerta lateral al historial saltándose la lista de correos.

### Y una vez publicado

Cuando el dominio de Cloudflare responda, hay que **apagar GitHub Pages en los
dos repositorios** (Settings → Pages → Source: None): el del cotizador, que
sirve la versión vieja sin historial, y el de este hub, que sirve la vista
previa de aquí abajo. Si no, quedan copias en pie que nadie mantiene y alguien
acabará usando la equivocada.

Apagar la del cotizador cierra además una fuga abierta hoy: su paquete lleva
**el costo de compra de 109 de los 114 productos y el proveedor de 108**, y
cualquiera con el enlace puede descargarlo y leerlos. Detrás de Access esos
datos sólo los ve el equipo, que es para quien están.

---

## La vista previa

Mientras no haya nada en Cloudflare, cada empuje a `main` publica una versión
**de muestra** en GitHub Pages:

**https://byslogistics.github.io/Hub-Business-Supplies/**

Sirve para enseñar cómo va quedando —la portada, el cotizador, el PDF, la
pantalla de historial— sin tener que montar antes la base de datos ni Access.

Lo que se publica es lo que produce `npm run build`, o sea exactamente lo mismo
que se sube a Cloudflare, con una diferencia: `VITE_DEMO=1`. Esa marca cambia
dos cosas.

**El historial se guarda en el navegador de quien mira.** Aquí no hay servidor,
y sin servidor el cotizador ni siquiera dejaría emitir, porque el número lo da
la base. Con la marca puesta entra `historial/almacenLocal.ts`, que hace de
historial contra `localStorage`. No es compartido —cada quien ve lo suyo— y los
números salen como `COT-DEMO-0001`, para que ningún PDF de éstos se confunda
con uno de verdad. Sale además una franja ámbar diciéndolo, que no se puede
cerrar.

**El catálogo va sin costos ni proveedores.** La vista previa es pública, y su
paquete se puede descargar y leer entero, así que ocultar el margen en pantalla
no serviría de nada: el dato viajaría igual. Un complemento de Vite
(`catalogoSinCostos`, en `cotizador/vite.config.ts`) los quita al construir. Los
precios de venta sí van, porque sin ellos no habría nada que enseñar.

Ninguna de las dos cosas llega a producción: el despliegue de Cloudflare no
define `VITE_DEMO`, así que el almacén de mentira no entra en el paquete y el
catálogo va completo. Es comprobable —`grep COT-DEMO publico/` después de un
`npm run build` normal no encuentra nada.

> Aun sin costos, la vista previa enseña los precios de venta a cualquiera con
> el enlace. Conviene no repartirlo más allá de quien tenga que opinar, y
> apagar Pages cuando Cloudflare esté en pie.

---

## Cómo está hecho

```
index.html        la portada: marcado y estilos en un solo archivo, sin construir
assets/           el logo
cotizador/        la aplicación del cotizador (React + Vite)
worker/           la API del historial y la verificación de Access
compartido/       el contrato entre los dos: qué viaja por el cable
migraciones/      el esquema de la base, en SQL
scripts/          arma `publico/` a partir de la portada y del cotizador
.github/          el flujo que publica la vista previa
```

La portada **no se construye**: es un `index.html` con los estilos dentro y sin
dependencias. Se abre con doble clic y se ve igual que publicada, y añadir una
herramienta es copiar un `<li>` y cambiarle cuatro cosas (está explicado dentro
del propio archivo). Meterla en el empaquetador no ganaría nada y costaría esa
propiedad.

El cotizador sí, porque es una aplicación de verdad. `npm run build` lo compila
en `publico/cotizador/` y copia la portada al lado.

### Cambiar de proveedor sin rehacer nada

Todo lo que el cotizador sabe del servidor está detrás de una interfaz,
`cotizador/src/historial/contrato.ts`. La pantalla llama a
`almacen.registrar(...)` y no sabe si detrás hay Cloudflare, Supabase o una
carpeta. Si algún día conviene mudarse, se escribe otra implementación y el
resto de la aplicación no se entera.

Que eso no era palabrería se vio enseguida: la vista previa necesitaba un
historial sin servidor y salió de ahí, `almacenLocal.ts`, sin tocar ni una
línea de las pantallas.

### Por qué se verifica la firma del token

Access añade a cada petición una cabecera con el correo de quien entró, y
leerla sería una línea de código. `worker/acceso.ts` no hace eso: comprueba la
firma criptográfica del token contra las claves públicas del equipo.

La diferencia importa porque esa cabecera es texto que cualquiera puede
escribir. Si un día el Worker queda alcanzable por una ruta que no pasa por
Access —un dominio nuevo mal configurado, una prueba, el subdominio de
`workers.dev`—, leerla a secas convertiría «quién eres» en un campo que rellena
quien llama. Está probado: una petición con la cabecera falsificada recibe un
401.
