-- La cotización apunta a la ficha de su cliente.
--
-- Hasta ahora los datos del cliente vivían **sólo** dentro del documento de
-- cada cotización. Eso sigue siendo así y tiene que seguir siéndolo: el
-- documento es la fuente de verdad de lo que el cliente recibió, y el PDF que
-- tiene en la mano dice el nombre y el NIT que decía **ese día**, aunque la
-- ficha se haya corregido diez veces desde entonces.
--
-- Lo que faltaba era la otra dirección: poder preguntar «¿qué le hemos cotizado
-- a este cliente?» sin buscar por nombre y confiar en que siempre se escribió
-- igual. Esta columna es esa respuesta.
--
-- Va vacía en todo lo emitido hasta hoy, y no pasa nada: la ficha del cliente
-- también encuentra sus cotizaciones por NIT, así que lo viejo no se pierde,
-- sólo depende de un dato más frágil. Lo que se emita a partir de ahora queda
-- enlazado sin ambigüedad.
ALTER TABLE cotizaciones ADD COLUMN cliente_codigo TEXT;

-- «Las cotizaciones de este cliente, lo último primero» es la consulta que va a
-- hacer su ficha cada vez que alguien la abra.
CREATE INDEX cotizaciones_por_cliente_codigo
  ON cotizaciones (cliente_codigo, emitida_en DESC);
