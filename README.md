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
aunque el listado de precios haya cambiado diez veces desde entonces —y aunque
se emitiera en dólares a una tasa que hoy ya no es la de nadie. Las
columnas del listado —cliente, total, unidades— las calcula el servidor a
partir de ese mismo documento, con las mismas funciones que usa la pantalla,
para que el total del historial no pueda discrepar del total del PDF.

Quien firma la cotización se elige en «Datos de la oferta»: Yeimy Mahecha,
Paola Vargas o el equipo comercial. Son los mismos nombres que pueden firmar
un correo (`REMITENTES`, en `correo/plantillas.js`), escritos en dos sitios
porque el correo y el cotizador no dependen el uno del otro: al añadir a
alguien hay que mirar los dos —`ASESORES`, en
`cotizador/src/datos/empresa.ts`, y aquél—.

En la pantalla del historial se puede buscar por número, empresa, NIT o
contacto, filtrar por fechas y por estado, volver a bajar el PDF, reabrir una
cotización para hacerle una versión nueva, y marcar en qué acabó: **emitida**,
**aceptada** o **perdida**. Ese último dato es el que convierte el historial en
algo que se mira: cuánto se cotizó el mes pasado y cuánto de eso entró.

### Quitar una cotización de en medio: la papelera

Del historial se puede borrar, y se puede borrar de a muchas. Con mil
cotizaciones guardadas, un botón de borrar por fila obligaría a mil
confirmaciones para limpiar las pruebas del primer año, así que la pantalla
tiene casillas: se marcan las que sea, o se marca la de la cabecera y sale
«seleccionar las 342 que cumplen el filtro» — que es una condición que
resuelve el servidor de una vez, no trescientos cuarenta y dos números
viajando por el cable.

Se borra en dos tiempos, y no en uno, por lo que cuesta cada error:

1. **Eliminar** manda a la **papelera**. La cotización deja de salir en el
   historial, pero no se ha ido: sigue su documento entero, se puede volver a
   bajar su PDF y se puede **restaurar**. En la papelera se ve quién la retiró
   y cuándo.
2. **Eliminar definitivamente**, ya dentro de la papelera, borra la fila de
   verdad. De ahí no se vuelve: con el documento se va la posibilidad de
   regenerar el PDF que recibió el cliente.

Que haya que pasar por la papelera es lo que convierte «seleccioné
trescientas sin querer» en algo que se deshace. El servidor lo impone además
por su cuenta: la operación de borrado definitivo sólo alcanza filas que ya
estén retiradas, diga lo que diga quien la llame.

**Lo que no devuelve ninguno de los dos pasos es el número.** El consecutivo
se gasta al emitir y no retrocede: si se borra la COT-2026-0007, la siguiente
sigue siendo la 0008. Es deliberado — un hueco en la numeración se explica, y
dos cotizaciones distintas con el mismo número no. Mientras está en la
papelera, el número además sigue ocupado: escribirlo a mano para otro cliente
lo rechaza igual, diciendo que está en la papelera.

Volver a emitir una cotización que estaba retirada la saca de la papelera
sola: lo que acaba de salir hacia un cliente no puede quedarse escondido.

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

#### Cómo funciona por dentro, y cómo se toca

El contador vive en la tabla `consecutivos`, que es **un contador por año**:

| anio | valor |
| ---- | ----- |
| 2025 | 118   |
| 2026 | 47    |

Al emitir, el Worker suma uno al año que corresponda y usa lo que salga:
`COT-` + año + el valor a cuatro cifras (`formatoNumero`, en
`compartido/historial.ts`). El año sale de **la fecha del documento**, la que
se imprime, y no del reloj del servidor —que está en UTC y a las siete de la
tarde en Bogotá ya va por el día siguiente.

De ahí salen tres cosas que conviene tener claras:

- **El año nuevo se numera solo.** La primera cotización con fecha de 2027
  crea la fila `2027` y sale `COT-2027-0001`. No hay nada que hacer en
  diciembre.
- **Empezar una serie en otro número** —por ejemplo, seguir donde quedó el
  Excel— es una línea de SQL contra la base:

  ```bash
  npx wrangler d1 execute bys-cotizaciones --remote \
    --command "INSERT INTO consecutivos (anio, valor) VALUES ('2026', 500)
               ON CONFLICT(anio) DO UPDATE SET valor = 500"
  ```

  La siguiente que se emita será la `COT-2026-0501`. Para mirar por dónde va
  el contador, `SELECT * FROM consecutivos`.
- **Cambiar el formato** (otro prefijo, otro número de cifras) es cambiar
  `formatoNumero` y nada más. Lo ya emitido conserva el número que tuvo: los
  números viejos están escritos en la base y en los PDF que tienen los
  clientes, y no se reescriben.

**Bajarlo no es buena idea.** Poner el contador por debajo de lo ya emitido
hace que la siguiente emisión choque contra un número ocupado —el historial
lo rechaza, que es lo correcto— y si el choque fuera con el mismo cliente,
actualizaría la cotización anterior en vez de crear una nueva. Para
renumerar de verdad hay que decidir antes qué pasa con los PDF que ya están
en manos de los clientes, y eso no lo puede resolver una herramienta.

**La trazabilidad no depende del contador**, sino de la tabla de
cotizaciones: cada fila guarda el número, el instante real de emisión, el
correo de quien la emitió —tomado del token de Access, no de un campo del
formulario—, el cliente, el documento completo y, si se retiró, quién la
retiró y cuándo. Un hueco en la numeración significa una de dos: un número
que se gastó y cuyo guardado falló, o una cotización que alguien borró de la
papelera. Lo primero se ve porque no hay fila; lo segundo, porque tampoco
—de ahí que borrar definitivamente pida confirmación aparte.

### Sin conexión no se emite

Armar la cotización sigue funcionando entero en el navegador —el catálogo, los
precios, la vista previa del PDF— y el borrador se sigue guardando solo. Lo
único que necesita red es **emitir**, porque el número viene del servidor.

Es deliberado. La alternativa sería dejar que el navegador se invente un número
provisional, pero entonces el PDF que ya está en manos del cliente diría un
número y el historial otro. Un envío que espera a que vuelva la red se explica;
dos cotizaciones distintas con el mismo número, no.

---

## El cotizador y el listado de precios

Los precios no se escriben a mano en ningún sitio del código: salen del Excel
de la empresa (`LISTADO_PRECIOS_2026.xlsx`) y los pasa a
`cotizador/src/datos/catalogo.json` un script, `npm run catalogo`. Cuando el
listado cambie, se vuelve a correr y ya. El pie del cotizador dice de qué
archivo salieron y de qué día son.

### Las «observaciones sobre el listado»

Debajo de eso hay una línea en ámbar que dice, por ejemplo, **«Ver 6
observaciones sobre el listado»**. No son errores del cotizador: son las
rarezas que el script encontró **en el Excel** al leerlo, anotadas en vez de
corregidas. El criterio es que quien manda es el listado, y el script no se
inventa un precio; deja constancia para que alguien de la empresa lo mire.

Hoy son seis, y cada tipo quiere decir algo distinto:

| Tipo | Qué encontró |
| ---- | ------------ |
| `subtotal_inconsistente` | En esa fila, `unitario × cantidad` no da el total que trae la columna del Excel. **Se usa el unitario** — el total es un número escrito al lado, y el unitario es con el que se cotiza. Suele ser un descuento pactado que se metió en el total sin bajar el unitario, o un dedazo. |
| `escalon_duplicado` | La misma combinación (producto, cantidad, con o sin logo) aparece dos veces con precios distintos. **Se usa la de más abajo**, porque al editar una hoja lo nuevo se escribe debajo de lo viejo. |
| `precio_no_monotono` | Comprar más sale más caro por unidad: 300 unidades a 5.800 pero 500 a 6.000. Casi siempre es una errata. |
| `producto_sin_precio` | Una fila que parece un producto pero no tiene ningún precio. No entra al catálogo. En el caso de hoy («DE LOS SUJETADORES LOS 1 PAQUETE SON MIL UDS») ni siquiera es un producto: es una nota que quedó en la columna de nombres. |
| `cantidad_ilegible` / `cantidad_con_texto` | La cantidad de la fila no era un número limpio. Dice qué se entendió. |

Las tres primeras **no impiden cotizar** —el precio que sale es el que dice el
Excel para ese escalón— pero merecen una revisión del listado: mientras estén
ahí, esos precios son los que van a ir en las ofertas. Corregirlas es corregir
el Excel y volver a correr `npm run catalogo`; la lista se vacía sola cuando ya
no queda ninguna.

### Cotizar en dólares

Se puede cotizar en **pesos o en dólares**. La moneda se elige en «Datos de la
oferta», junto al tratamiento de IVA, y son dos decisiones distintas aunque
una exportación suela llevar las dos.

El listado de precios está en pesos y va a seguir estándolo —los proveedores
facturan en pesos y el margen se calcula en pesos—, así que cotizar en dólares
es **convertir al salir**. La pregunta que lo decide todo es a cuántos pesos
equivale un dólar, y la respuesta la escribe quien cotiza: al elegir dólares
aparece el campo **TRM pactada**, y esa tasa **se guarda dentro de la
cotización**.

Guardarla, y no consultarla al abrir, es lo mismo que se hizo con el IVA: el
PDF que el cliente tiene en la mano dice unas cifras, y esas cifras no pueden
cambiar por debajo porque el dólar se movió el martes siguiente. Por la misma
razón el PDF **imprime la tasa** junto a la moneda: meses después, las dos
partes pueden reconstruir la cifra en pesos sin discutir cuál era.

Lo que cambia al pasar a dólares:

- **Los precios de las líneas se convierten**, incluidos los escritos a mano:
  3.500 pesos pactados son 0,85 dólares, no 3.500 dólares. Lo que el asesor
  negoció es un importe, no una cifra atada a un símbolo.
- **Se redondea a centavos** en vez de a peso entero. Redondear 0,87 USD a
  entero sería un 15 % de sobreprecio en una sola línea.
- **El catálogo de la izquierda sigue en pesos**, y lo dice: es el listado, no
  la oferta.
- **El margen se sigue calculando en pesos**, que es donde está el costo de
  compra. Comparar 0,87 dólares con un costo de 2.100 pesos daría un margen
  catastrófico e inventado.
- **El aviso de «precio desactualizado» compara ya convertido**, y con la
  tolerancia del dólar. Con la del peso —medio peso— cada línea de cada
  cotización en dólares saldría marcada, porque el propio redondeo a centavos
  ya la supera.

En el historial, cada cotización se lista **en su moneda**, con su equivalente
en pesos debajo. La suma de arriba va siempre en pesos, convirtiendo cada
cotización a la tasa que ella misma guardó: sumar pesos y dólares en la misma
cifra daría un número que no es dinero de ninguna clase, y ordenar por él
pondría una cotización de mil dólares por debajo de una de un millón de pesos.

> El punto de partida de la TRM (`TASA_USD_SUGERIDA`, en
> `cotizador/src/datos/empresa.ts`) es sólo eso, un punto de partida para no
> arrancar en cero. **No es la tasa del día**: quien cotiza la corrige antes de
> emitir, y la pantalla se lo recuerda en ámbar. Conviene actualizar ese número
> de vez en cuando, pero ninguna cotización emitida depende de él.

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
tiempo al lado, vive detrás del botón «Vista previa» de **arriba a la
derecha**, en la barra que se queda pegada al borde superior al bajar. Estaba
flotando en la esquina de abajo, donde tapaba el final del formulario —justo
los adjuntos y el botón de enviar— y en el celular quedaba encima del último
campo. Al abrirla se ve el correo completo, con un interruptor para alternar
entre escritorio y celular, y se actualiza en cada tecla sin esperar a que los
campos obligatorios estén completos.

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
npm test             # 104 pruebas del cotizador
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

Falta hacer cinco cosas a mano, una sola vez cada una: todas piden la sesión
de Cloudflare o de Resend, y por eso no las puede hacer el repositorio por su
cuenta. Lo que sí queda automatizado desde ellas es lo que se repite —publicar
en cada empuje, y aplicar las migraciones nuevas—.

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

Los dos comandos se vuelven a correr cada vez que aparece un archivo nuevo en
`migraciones/`: aplican sólo lo que falte y no repiten lo ya aplicado. La
`0002_papelera.sql` —las dos columnas de la papelera— y la `0003_moneda.sql`
—la moneda, la tasa y el total en divisa— son dos de ésas.

**El despliegue no lo hace.** Cada empuje a `main` publica el código solo
—Cloudflare Workers Builds—, pero la base no se toca: Cloudflare no sabe qué
hay en `migraciones/`. Si el código nuevo llega a una base sin migrar, el
historial responde «La operación falló» a todo —lista y emisión—, porque sus
consultas nombran columnas que ahí no existen. Armar la cotización y bajar el
PDF siguen funcionando; lo que se cae es guardarla.

#### Que se aplique solo

Por eso hay un flujo aparte, `.github/workflows/migrar.yml`, que corre
`npm run migrar` contra la base de verdad cuando un empuje a `main` trae algo
nuevo en `migraciones/`. Sólo entonces: el comando no repite lo ya aplicado,
así que lanzarlo en cada empuje sería inofensivo pero inútil.

Necesita una llave, que se pone una sola vez:

1. En Cloudflare, **My Profile → API Tokens → Create Token → Create Custom
   Token**. Un solo permiso: **Account → D1 → Edit**, sobre la cuenta donde
   vive `bys-cotizaciones`. Nada más — con eso puede tocar D1 y ninguna otra
   cosa de la cuenta.
2. En GitHub, **Settings → Secrets and variables → Actions → New repository
   secret**, con nombre `CLOUDFLARE_API_TOKEN` y el valor que imprimió
   Cloudflare (sólo se enseña una vez).
3. Si la cuenta de Cloudflare tiene más de una organización, hace falta además
   el secreto `CLOUDFLARE_ACCOUNT_ID`; con una sola, el flujo lo deduce.

Sin el secreto, el flujo se detiene en el primer paso diciendo qué falta, en
vez de fallar con un error de autenticación que no explica nada.

**Aun así, para una migración delicada conviene correr `npm run migrar` a mano
antes de mezclar a `main`.** El flujo arranca a la vez que la construcción de
Cloudflare, no antes, y encadenarlas no se puede desde aquí. En la práctica
gana la migración —aplicar dos sentencias tarda segundos y construir el
cotizador, minutos—, y el riesgo de perder la carrera es un rato con el
historial caído, no un dato perdido: añadir columnas no molesta al código
viejo, que ni las nombra, así que la base puede ir por delante sin que nadie
lo note.

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
.github/          los flujos: la vista previa y las migraciones de la base
```

La portada y el correo **no se construyen**: son un `index.html` con los
estilos dentro y sin dependencias. Se abren con doble clic y se ven igual que
publicados, y añadir una herramienta a la portada es copiar un `<li>` y
cambiarle cuatro cosas (está explicado dentro del propio archivo). Meterlos en
el empaquetador no ganaría nada y costaría esa propiedad.

El cotizador sí, porque es una aplicación de verdad. `npm run build` lo compila
en `publico/cotizador/` y copia la portada y el correo al lado.

### Las tarjetas «Redes» e «IA»

Dos de las tarjetas de la portada no llevan a ningún sitio por sí solas: al
pulsarlas se despliegan debajo, a todo el ancho, con los sitios de fuera a los
que el equipo entra a diario. **Redes** son Gmail, WhatsApp Web, Meet,
Instagram, Telegram, TikTok, Business Suite, Facebook y Microsoft; **IA** son
Claude, ChatGPT, Gemini, Grok y Meta AI, cada una con una línea de para qué
sirve. No hay nada que mantener detrás —son enlaces— pero tenerlos ahí ahorra
rehacer los marcadores en cada computador nuevo.

Van con el resto de las herramientas, en la misma rejilla, porque es donde se
busca un botón. Están hechas con `<details>`/`<summary>`: abren y cierran
aunque el JavaScript no llegue a cargar, el teclado las maneja solo y
`<details name="…">` ya impide que las dos queden abiertas a la vez. El
`<script>` del final de `index.html` sólo añade las cortesías —cerrar al
pulsar fuera y con Escape—, que es justo lo que se puede perder sin romper
nada. Abierta, la tarjeta se lleva la fila entera (`li:has(.menu[open])`) y el
panel se reparte en tantas columnas como quepan; en un navegador sin `:has()`
el panel sale igual, sólo que angosto dentro de su columna.

Para añadir un sitio: copiar un `<li>` del listado que toque y cambiar el
enlace, el color de la pastilla (`--c`), el icono y los dos textos.

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
