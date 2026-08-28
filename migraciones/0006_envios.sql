-- El registro de lo que se ha mandado.
--
-- Hasta ahora, un correo salido del hub no dejaba rastro en ningún sitio: se
-- iba a Resend y ahí se acababa. Lo mismo que le pasaba a una cotización antes
-- de que existiera el historial.
--
-- Con esta tabla, la ficha de un cliente puede responder «¿qué se le ha
-- escrito?» con la misma facilidad con la que el historial responde «¿qué se le
-- ha cotizado?». Y cuando una cotización se envía por correo, la fila del
-- historial puede decir cuándo salió y a quién — que es la pregunta que se hace
-- todos los lunes.
--
-- **No se guarda el texto del correo.** Ni el cuerpo ni los adjuntos: sólo qué
-- se mandó, a quién y cuándo. Guardar el contenido convertiría esta tabla en un
-- buzón, con todo lo que eso arrastra —tamaño, datos personales, copias de PDF
-- que ya están en el documento de la cotización— para responder una pregunta
-- que nadie hace. El contenido, si hace falta, está en Resend y en el buzón de
-- quien lo recibió.

CREATE TABLE envios (
  -- El identificador que devuelve Resend. Es la llave para cruzar esta fila
  -- con su registro de entrega si alguna vez hay que perseguir un correo.
  id                TEXT PRIMARY KEY,
  enviado_en        TEXT NOT NULL,
  -- Quién le dio a enviar, del token de Access. No se acepta del navegador.
  autor             TEXT NOT NULL,
  -- Quién firma: el identificador del equipo (`yeimy`, `paola`…).
  remitente_id      TEXT NOT NULL,
  plantilla_id      TEXT NOT NULL,
  asunto            TEXT NOT NULL,
  -- Lista JSON: un correo comercial puede ir a varias direcciones a la vez.
  destinatarios     TEXT NOT NULL,

  -- A qué ficha y a qué cotización pertenece. Los dos pueden faltar: un correo
  -- suelto a alguien que no está en la base es legítimo.
  cliente_codigo    TEXT,
  cotizacion_numero TEXT,

  -- Cuántos archivos llevaba, para poder decir «con el PDF» sin guardarlo.
  adjuntos          INTEGER NOT NULL DEFAULT 0,
  copia_archivo     INTEGER NOT NULL DEFAULT 0
);

-- Las dos preguntas que va a hacer la ficha del cliente y el historial.
CREATE INDEX envios_por_cliente ON envios (cliente_codigo, enviado_en DESC);
CREATE INDEX envios_por_cotizacion ON envios (cotizacion_numero, enviado_en DESC);
CREATE INDEX envios_por_fecha ON envios (enviado_en DESC);
