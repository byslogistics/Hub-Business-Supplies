# Hub · B&S Logistics

Las herramientas internas de **Business & Supplies Logistics S.A.S.** en un
solo sitio, detrás de una sola puerta. Un empleado entra, se identifica una vez
y ve lo que necesita.

```
/                 la portada con las tarjetas
/cotizador/       el cotizador y el historial de cotizaciones
/correo/          el envío de correo comercial por Resend
/api/             el historial y el correo por dentro (sólo los usan esas dos)
```

---

## Qué hay aquí y qué no

| Herramienta          | Dónde vive                       |
| --------------------- | --------------------------------- |
| **Portada**           | Aquí: `index.html`               |
| **Cotizador**         | Aquí: `cotizador/`               |
| **Historial**         | Aquí: `worker/` + D1             |
| **Correo comercial**  | Aquí: `correo/` + `worker/` + Resend |
| **Página web**        | Fuera: `byslogistics-web`        |
| **CRM · Chatbot**     | Fuera: su propio Worker          |

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

## El correo comercial

La pantalla en `/correo/` deja mandar un correo con el diseño y la firma de la
empresa ya puestos, sin que quien lo envía tenga que entrar nunca a Resend ni
escribir HTML.

Quien manda elige **quién firma** (por ahora Paola Vargas o Yeimy Mahecha),
**qué plantilla** usar y llena unos pocos campos —nombre del cliente,
mensaje—. Hay siete plantillas: presentación comercial, seguimiento a una
cotización, oferta puntual, reactivar un cliente, agradecimiento de compra,
recordatorio de pago, y una plantilla libre en blanco para cuando ninguna de
las anteriores encaja.

El mensaje libre no es texto plano a secas: una línea que empiece con `- ` se
vuelve viñeta, `**así**` sale en negrita, `*así*` en cursiva, un enlace suelto
(`https://…`) queda subrayado y en azul, y un enlace con texto propio se
escribe `[así](https://…)`. Sigue sin admitir HTML de verdad — todo se escapa
primero y el formato se aplica después, así que nada de lo que alguien
escriba puede colarse como una etiqueta.

**Los botones (CTA) se eligen al armar el correo, no vienen fijos en la
plantilla.** Una fila de casillas deja marcar cualquier combinación de página
web, WhatsApp, Facebook e Instagram — cada plantilla trae marcadas de entrada
las que suele necesitar, pero se pueden cambiar antes de mandar. Ver
`DEFINICIONES_CTA` en `correo/plantillas.js` para añadir un botón nuevo.

**Puede llevar varios destinatarios.** El campo de correo del cliente admite
varias direcciones separadas por coma (hasta cinco); el Worker las vuelve a
validar todas antes de mandar. También hay una casilla para que quien envía
se lleve una copia — a su propio correo de acceso, nunca a uno escrito a
mano.

El constructor ocupa toda la pantalla — la vista previa no se ve todo el
tiempo al lado, vive detrás del botón flotante «Vista previa» de la esquina,
igual que en el Cotizador. Al abrirla se ve el correo completo, con un
interruptor para alternar entre escritorio y celular, y se actualiza en cada
tecla sin esperar a que los campos obligatorios estén completos.

**Se pueden adjuntar archivos.** El botón «Adjuntar archivo» sólo deja elegir
PDF, imágenes, Excel o Word, hasta cinco archivos (por ejemplo, el PDF de una
cotización ya descargada desde el Cotizador), con un tope de 8&nbsp;MB en
total — se ve el peso acumulado junto a la lista. El navegador los lee en
base64 y los manda junto con el resto del formulario; el Worker vuelve a
comprobar el tipo, la cantidad y el peso antes de pasarlos a Resend — lo que
avisa el navegador es sólo para no hacer esperar a la vendedora, lo que de
verdad cuenta es la comprobación del servidor.

**Todo lo editable vive en un solo archivo:** `correo/plantillas.js`. Ahí están
los datos de cada vendedora (nombre, cargo, WhatsApp, a qué correo llegan las
respuestas), los datos fijos de la empresa (teléfono, web, dirección, el logo)
y las plantillas con sus campos y su texto. Añadir una vendedora nueva o una
plantilla nueva es editar ese archivo — no hay que tocar la pantalla ni el
Worker.

Ese mismo archivo lo usan dos sitios, y por eso está en JavaScript llano, sin
compilar: `correo/index.html` lo carga en el navegador para la vista previa, y
`worker/index.ts` lo importa para generar el HTML de verdad que se manda. El
correo que se ve en la vista previa es exactamente el que sale — no hay dos
copias de la plantilla que se puedan desincronizar.

**El HTML final siempre se genera en el servidor.** El formulario manda sólo
los valores sueltos de los campos (el nombre del cliente, el mensaje…); es
`worker/index.ts` quien vuelve a armar el correo completo con `renderCorreo`
antes de mandarlo por Resend. Así una petición manipulada no puede meter en el
correo de la empresa nada distinto de lo que las plantillas permiten, igual que
el historial no confía en los totales que calcula el navegador.

### Por qué Resend y no un botón que lo abra

Resend no tiene una pantalla de «escribir y enviar» como Gmail — es un
servicio pensado para que un programa mande el correo, o para campañas a una
lista de contactos guardada. Un botón que simplemente abriera Resend habría
dejado a quien vende en un panel técnico, sin ningún sitio cómodo para
escribirle a un cliente puntual. Por eso la redacción ocurre aquí, en el hub —
igual que el cotizador—, y Resend queda por detrás, como el motor que entrega
el correo.

### Cómo conectar la cuenta de Resend

Esto es aparte de lo que instala `npm run instalar`: la cuenta de Resend es de
la empresa, y conectarla es un trámite de una sola vez, a mano, igual que el
resto de lo que pide la sección *Publicar* de abajo.

1. **Verificar el dominio.** En el panel de Resend, **Domains → Add Domain**,
   con `byslogistics.com.co`. Resend entrega unos registros (TXT, DKIM, y a
   veces MX) que hay que agregar donde esté administrado ese dominio — el
   panel de quien vendió el dominio, no Resend. Sin el dominio verificado,
   Resend no deja enviar desde `ventas@byslogistics.com.co` — que es la
   dirección que usan los correos de esta herramienta, con la respuesta
   redirigida al buzón de quien firma (ver `correoDirecto` en
   `correo/plantillas.js`).
2. **Crear una llave.** **API Keys → Create API Key**, con permiso de envío
   («Sending access» basta, no hace falta acceso total a la cuenta).
3. **Guardarla como secreto del Worker**, nunca en el código ni en
   `wrangler.jsonc`:

   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

   Pide la llave por consola y la guarda cifrada del lado de Cloudflare. Para
   cambiarla más adelante, se repite el mismo comando.
4. Para probar el envío en `npm run dev`, hace falta la misma llave en
   `.dev.vars` (que no se versiona):

   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   ```

---

## Puesta en marcha

```bash
npm run instalar     # dependencias del hub y del cotizador
npm test             # 75 pruebas del cotizador
npm run build        # deja el sitio entero en publico/
```

Para trabajar en la pantalla, dos terminales:

```bash
npm run dev          # el Worker, el historial y el correo, en :8787
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

Falta hacer cinco cosas a mano, una sola vez cada una. Ninguna se puede
automatizar desde aquí: todas piden la sesión de Cloudflare o de Resend.

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
cotizador, el correo y las herramientas que se añadan mañana. Es la razón
principal por la que el hub está en Cloudflare y no en otro sitio — el acceso
se resuelve una vez, en la puerta, y no una vez por herramienta.

> Añadir a alguien al equipo es añadir su correo a esa política. No hay usuarios
> ni contraseñas que gestionar aquí dentro.

### 4. Conectar Resend

Ver la sección *El correo comercial* de arriba: verificar el dominio, crear
una llave y guardarla con `npx wrangler secret put RESEND_API_KEY`. Sin esto,
`/correo/` deja armar y previsualizar el correo, pero el envío falla.

### 5. Desplegar

El repositorio está conectado a **Cloudflare Workers Builds**: cada `git push`
a `main` construye y publica solo, sin que nadie tenga que correr nada a mano.
El proyecto en Cloudflare se llama **hub-business-supplies** (tiene que
coincidir con `name` en `wrangler.jsonc`, o Cloudflare avisa del desacuerdo).

Para desplegar a mano —por ejemplo, para probar algo sin esperar a Git—
también sirve:

```bash
npm run desplegar
```

El dominio se conecta en **Workers & Pages → hub-business-supplies → Settings
→ Domains & Routes**.

Ojo: `wrangler.jsonc` lleva `workers_dev: false` a propósito. La dirección
`hub-business-supplies.<cuenta>.workers.dev` no pasa por Access, así que
dejarla encendida abriría una puerta lateral al historial saltándose la lista
de correos.

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

`/correo/` también se publica en esta vista previa, pero el botón «Enviar» va
a fallar: la vista previa no tiene el secreto de Resend ni pasa por el Worker
de verdad. Sirve igual para enseñar cómo quedan las plantillas y probar la
vista previa en vivo.

Ninguna de las dos cosas del historial llega a producción: el despliegue de
Cloudflare no define `VITE_DEMO`, así que el almacén de mentira no entra en el
paquete y el catálogo va completo. Es comprobable —`grep COT-DEMO publico/`
después de un `npm run build` normal no encuentra nada.

> Aun sin costos, la vista previa enseña los precios de venta a cualquiera con
> el enlace. Conviene no repartirlo más allá de quien tenga que opinar, y
> apagar Pages cuando Cloudflare esté en pie.

---

## Cómo está hecho

```
index.html        la portada: marcado y estilos en un solo archivo, sin construir
assets/           el logo
cotizador/        la aplicación del cotizador (React + Vite)
correo/           la pantalla de correo comercial y sus plantillas, sin construir
worker/           la API del historial, del correo y la verificación de Access
compartido/       el contrato entre el cotizador y el Worker: qué viaja por el cable
migraciones/      el esquema de la base, en SQL
scripts/          arma `publico/` a partir de la portada, el correo y el cotizador
.github/          el flujo que publica la vista previa
```

La portada y el correo **no se construyen**: son un `index.html` con los
estilos dentro y sin dependencias. Se abren con doble clic y se ven igual que
publicados, y añadir una herramienta a la portada es copiar un `<li>` y
cambiarle cuatro cosas (está explicado dentro del propio archivo). Meterlos en
el empaquetador no ganaría nada y costaría esa propiedad.

El cotizador sí, porque es una aplicación de verdad. `npm run build` lo compila
en `publico/cotizador/` y copia la portada y el correo al lado.

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
