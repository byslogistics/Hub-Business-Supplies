# Cotizador · B&S Logistics

Arma una cotización desde el listado de precios y produce dos cosas: el **PDF
formal** con la marca de la empresa y el **mensaje de WhatsApp** que hoy se
copia y pega a mano desde el Excel.

Armar la cotización ocurre entero en el navegador: el catálogo, los precios y
el PDF salen de la propia página, sin esperar a nadie. Lo único que necesita
servidor es **emitir**, porque desde entonces cada cotización emitida queda
guardada en el historial que ven las dos socias, con su número tomado de un
consecutivo central.

Esta aplicación vive dentro del [hub de herramientas](../README.md), que es
donde están el historial, el despliegue y los pasos de puesta en marcha.

<img src="docs/ejemplo-cotizacion.png" alt="Primera página de una cotización generada" width="520">


---

## Por qué existe

El área comercial cotiza desde `LISTADO_PRECIOS_2026.xlsx`. Ese archivo tiene
570 filas de precios en escalones por cantidad, más tres hojas de plantillas
donde alguien reescribe a mano el mismo mensaje cada vez. De ahí salen los
tres errores que este cotizador elimina:

1. **Buscar el escalón a ojo.** El precio depende de la cantidad y de si el
   producto lleva logo, y los escalones no son iguales para todos los
   productos (hay 38 juegos distintos). Aquí se resuelve solo.
2. **Recalcular el IVA a mano.** Tres filas del Excel tienen el total
   descuadrado respecto a `unitario × cantidad`.
3. **Reescribir las condiciones.** Entrega, vigencia y forma de pago cambian
   según sea producto personalizado o de stock; ahora son dos plantillas.

---

## Puesta en marcha

Desde la raíz del hub, no desde aquí:

```bash
npm run instalar   # dependencias del hub y del cotizador
npm run dev        # el Worker y el historial, en :8787
npm run pantalla   # esta aplicación con recarga en caliente, en :5173
```

Hacen falta las dos: la pantalla manda las llamadas de `/api` al Worker de al
lado. Sin él la aplicación abre igual y deja armar cotizaciones, pero al emitir
avisa de que no hay conexión con el historial.

Para producción se construye el hub entero (`npm run build` en la raíz), que
deja esta aplicación en `publico/cotizador/`. Las rutas del `dist/` son
relativas, así que el mismo empaquetado sirve colgado de `/cotizador/` o
abierto desde el disco.

---

## Actualizar los precios

Los precios **no se editan en el código**. La fuente sigue siendo el Excel que
mantiene el área comercial:

```bash
# 1. Deje el listado nuevo en datos-origen/
cp ~/Descargas/LISTADO_PRECIOS_2027.xlsx datos-origen/

# 2. Regenere el catálogo
npm run catalogo -- datos-origen/LISTADO_PRECIOS_2027.xlsx

# 3. Revise lo que el script reporta y vuelva a construir
npm run build
```

El script (`scripts/extraer_catalogo.py`, sólo necesita `openpyxl`) imprime al
final cuántas incidencias encontró. **Léalas**: son las filas que el Excel trae
raras y que alguien debería mirar. En el listado de 2026 son seis, y las mismas
aparecen dentro de la aplicación, al pie de la pantalla.

Si el catálogo va a salir de la máquina del área comercial, use
`npm run catalogo -- <archivo> --sin-costos` para omitir el costo de compra y
el nombre del proveedor.

### Qué hace el extractor con el Excel

El Excel es un documento de trabajo, no una base de datos. El script normaliza:

| Rareza del listado | Qué hace el script |
|---|---|
| La referencia sólo aparece en la primera fila del bloque | La arrastra hacia abajo |
| La columna LOGO también sólo aparece una vez por sub-bloque | La arrastra; sin esto las tandas con y sin logo se mezclan |
| `CLISE PARA LOGO` metido como si fuera un escalón de cantidad | Lo saca a producto propio |
| Erratas (`GAYA`, `DELLO`, `REFE`, 40 espacios seguidos) | Las corrige al leer, sin tocar el original |
| Totales que no cuadran con `unitario × cantidad` | Manda el unitario, y lo reporta |
| El mismo escalón dos veces con precios distintos | Se queda con **la fila de más abajo**, y lo reporta |
| Precio que sube al subir de escalón | Lo respeta, y lo reporta |
| `CAJA X 25 UNIDADES` en la columna de cantidad del proveedor | Lo guarda como empaque |
| Notas sueltas leídas como si fueran productos | Las descarta |

El logo del PDF se empotra aparte, con `npm run logo`, para que el documento se
genere sin pedir nada por red.

---

## Cómo está organizado

```
scripts/          Excel → catálogo JSON, y logo → módulo TypeScript
src/
  datos/          catálogo generado, datos de la empresa, plantillas de condiciones
  dominio/        precios, totales, modelo de la cotización — funciones puras
  pdf/            tokens de marca, primitivas de dibujo, armado del documento
  mensajes/       mensaje de WhatsApp
  historial/      el trato con el servidor, y la pantalla de consulta
  ui/             pantalla React
```

La regla que ordena todo: **`dominio/` no sabe que existe React ni jsPDF**. Se
puede probar sin navegador, y de hecho así se prueba.

```bash
npm test                    # 75 pruebas
MUESTRA_PDF=1 npm test      # además deja PDFs de ejemplo en muestras/
```

Entre las pruebas hay dos que reproducen cotizaciones reales del Excel —la de
la hoja `COTIZACION FORMAL` y la de `COTIZACION YEIMY`— y comprueban que el
cotizador saca los mismos totales al peso.

---

## Decisiones que conviene conocer

**El IVA viaja dentro de la cotización.** No se lee del catálogo al mostrarla,
sino que queda guardado en el documento al crearlo. Antes no era así, y eso
significaba que un cambio de tarifa recalculaba todas las cotizaciones
guardadas: el PDF que el cliente ya tenía en la mano decía un total y la
pantalla otro. La misma pieza permite cotizar una exportación sin IVA, con el
selector «Tratamiento de IVA».

**Una cotización guardada se revisa contra el listado vigente.** El caso real:
se arma el lunes, el martes se regenera el catálogo porque un proveedor subió,
y el miércoles se reabre el borrador. La línea guarda el precio con el que se
armó, así que sin revisión la oferta sale al precio viejo. Al abrirla, las
líneas cuyo precio ya no coincide —o cuya referencia desapareció del listado—
salen marcadas en rojo, con un aviso arriba y un botón para actualizarlas.
Nada se corrige solo: la decisión sigue siendo del asesor.

**El precio se sugiere, no se impone.** El listado propone el precio del
escalón; el asesor puede escribir otro y la línea avisa de la diferencia, con
un botón para volver al sugerido. La lista de precios orienta una negociación,
no la reemplaza. Un precio escrito a mano y un precio que quedó viejo son
cosas distintas y se anuncian distinto.

**Cantidades intermedias.** Pedir 1.500 unidades cuando los escalones son 1.000
y 2.000 se cobra al precio de 1.000: manda el escalón más alto que la cantidad
alcanza. Por debajo del mínimo publicado se propone el escalón más bajo, pero
la línea queda marcada en ámbar.

**Oportunidad de volumen.** Cuando llevar más unidades sale más barato *en
total*, la línea lo dice con la cifra exacta. Es el argumento que hoy el
comercial hace de cabeza.

**El margen no sale nunca en el PDF.** El catálogo guarda el costo de compra
del Excel y la pantalla puede mostrar el margen por línea (casilla «Ver
margen»), pero ni el PDF ni el mensaje de WhatsApp lo mencionan.

**El consecutivo viene del servidor.** `COT-2026-0001` lo llevaba el navegador
de cada asesor, y eso aguantaba mientras cotizara una sola persona: con dos,
cada navegador tenía su propio contador y dos clientes distintos podían recibir
la misma «COT-2026-0007». Ahora lo da la base de datos al emitir, y se gasta al
emitir y no al abrir la pantalla, así que una cotización que nadie llegó a
enviar no deja hueco en la numeración.

Lo que se pierde a cambio: el número **ya no se puede saber por adelantado**,
porque depende de quién emita primero. La pantalla dice «se asigna al emitir»
en lugar de enseñar un número que podría cambiar delante de quien lo lee. El
campo sigue siendo editable para un caso real —pasar al historial una
cotización vieja del Excel, con su número de entonces—, y en ese caso se
respeta el que se escriba.

**Un número escrito a mano no pisa la cotización de otro.** Es la contrapartida
de dejar el campo editable: teclear `COT-2026-0007` cuando ese número ya existe
reemplazaba el documento del primer cliente por el del segundo, sin aviso y sin
forma de recuperarlo. Ahora el historial mira de quién es el número antes de
guardar. Mismo cliente —mismo NIT, o mismo nombre cuando no hay NIT— es la
misma cotización y se actualiza como siempre, que es lo que hace falta para
bajar el PDF y mandar el WhatsApp después. Cliente distinto se rechaza diciendo
de quién es el número.

**Todo va en pesos colombianos.** No hay catálogo ni tarifa en otra moneda. Aun
así el PDF y el mensaje de WhatsApp lo declaran con todas las letras: el «$»
del total lo comparten el peso y el dólar, la empresa atiende también Panamá, y
en las celdas de la tabla el número va sin símbolo ninguno. Quien recibe una
oferta no tiene por qué deducir en qué moneda está.

**Emitir necesita conexión; armar, no.** El catálogo, los precios, el borrador
y la vista previa del PDF siguen funcionando sin red. Emitir no, porque el
número lo da el servidor. Dejar que el navegador se inventara uno provisional
significaría que el PDF que ya tiene el cliente dice un número y el historial
otro; un envío que espera a que vuelva la red se explica mejor que eso.

**El borrador se guarda solo.** Cerrar la pestaña no cuesta el trabajo hecho.

**En móvil, catálogo y cotización se alternan.** Apilados obligaban a bajar
una pantalla entera de catálogo antes de ver el formulario; con el conmutador
el formulario arranca a 159 px en vez de a 940. Las acciones de envío y el
total bajan a una barra fija, y añadir un producto muestra un aviso, porque
en móvil la línea nueva cae en el panel que no se está viendo.

**Accesibilidad verificada, no supuesta.** Cero violaciones de axe-core en
escritorio y en móvil, con la cotización vacía y con líneas. Los campos que se
repiten en cada línea llevan el nombre del producto —«Cantidad de PRECINTO
GUAYA REF. 01», no cinco «Cantidad» seguidas— y los botones miden 44 px con el
dedo y se compactan con el ratón.

---

## Datos de la empresa

Están en `src/datos/empresa.ts`, cruzando dos fuentes: el sitio
byslogistics-web (teléfonos y correo comercial vigentes) y las hojas de
cotización del Excel (NIT y dirección, que no están en el sitio).

**Razón social: `S.A.S.`**, confirmado por la empresa. El `LTDA.` que aparece
en las hojas viejas del Excel es la forma anterior y no vuelve a ningún
documento que salga de aquí; hay una prueba que lo comprueba sobre el PDF ya
generado.

Queda una cosa pendiente de confirmar:

- **Tarifa del clisé.** El listado tiene dos: `$55.000` fijo por diseño
  (fila 40) y `$2.300` por unidad (hoja `COTIZADOR`). Se cargó la de `$55.000`
  como servicio independiente.

### Sobre la vigencia de la oferta

Una cotización no es documento fiscal: no le aplica la facturación electrónica
de la DIAN, así que no necesita CUFE ni resolución de numeración. El
consecutivo local es válido para lo que es.

Lo que sí importa: el documento declara una vigencia («válida hasta…»), y una
oferta con plazo compromete al oferente durante ese plazo. Por eso se quitó de
las notas frecuentes un «precios sujetos a cambio sin previo aviso» que
contradecía esa misma vigencia. En su lugar hay dos notas compatibles: los
precios se reconfirman *vencida* la oferta, y lo que depende de la TRM se acota
a los productos importados, que es donde el propio Excel anota «TRM máxima».
La redacción definitiva conviene que la valide el área jurídica.

---

## Lo que este cotizador todavía no hace

- **Rastreo satelital.** Los equipos JT701D y JT709T se cotizan por número de
  equipos, con planes de plataforma y tarifas de alquiler: es otro modelo de
  precio. Los datos ya se extraen a `catalogo.json` (`satelitales`), pero la
  pantalla aún no los ofrece.
- **Recargo por centímetro adicional.** Las etiquetas cobran un extra por
  centímetro sobre la medida base, distinto para cada medida. El dato se
  extrae y se muestra junto a la medida, pero no se suma solo: hay que
  escribir el precio a mano, que es como se hace hoy.
- **Descuento de distribuidor.** El Excel menciona un 10 % en dos celdas
  sueltas. Se puede aplicar como descuento de línea, pero no está automatizado
  porque no está claro si es política general.
