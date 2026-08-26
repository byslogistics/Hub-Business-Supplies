-- Cotizaciones en dólares.
--
-- El listado de precios de la empresa está en pesos y va a seguir estándolo:
-- los proveedores facturan en pesos. Cotizar en dólares es convertir al salir,
-- con una tasa que escribe quien cotiza y que se guarda dentro del documento
-- —igual que el IVA— para que lo emitido no se recalcule solo cuando el dólar
-- se mueva.
--
-- El historial guarda las dos cifras a propósito:
--
--   total         siempre en PESOS, convertido con la tasa de esa cotización
--   total_divisa  lo que dice el documento, en su propia moneda
--
-- La suma del listado y el orden usan `total`. Sumar una columna con pesos y
-- dólares mezclados daría una cifra que no es dinero de ninguna clase, y
-- «cuánto cotizamos el mes pasado» dejaría de tener respuesta. La otra columna
-- es la que se enseña en cada fila, porque es la que el cliente tiene delante.

ALTER TABLE cotizaciones ADD COLUMN moneda TEXT NOT NULL DEFAULT 'COP'
  CHECK (moneda IN ('COP', 'USD'));
-- Pesos por una unidad de la moneda: 1 en pesos, la TRM pactada en dólares.
ALTER TABLE cotizaciones ADD COLUMN tasa REAL NOT NULL DEFAULT 1;
-- REAL y no INTEGER: el dólar sí tiene centavos.
ALTER TABLE cotizaciones ADD COLUMN total_divisa REAL NOT NULL DEFAULT 0;

-- Todo lo emitido hasta hoy fue en pesos, así que su total en divisa es el
-- mismo que su total. Sin esto, el historial enseñaría cero en cada fila
-- vieja.
UPDATE cotizaciones SET total_divisa = total;
