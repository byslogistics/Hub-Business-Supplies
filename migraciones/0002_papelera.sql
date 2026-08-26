-- La papelera del historial.
--
-- Hasta ahora una cotización emitida no se podía quitar de la lista, y en un
-- historial que crece eso significa convivir para siempre con las pruebas del
-- primer día y con el duplicado que salió de un dedazo.
--
-- Se borra en dos tiempos, y no en uno, por lo que cuesta cada error:
-- mandar a la papelera es reversible y borrar de verdad no lo es. Quien se
-- equivoque seleccionando trescientas filas tiene dónde darse cuenta.
--
-- Lo que NO devuelve ninguno de los dos pasos es el número: el consecutivo se
-- gasta al emitir y no se reutiliza. Un hueco en la numeración se explica; dos
-- cotizaciones distintas con el mismo número, no — que es la misma razón por
-- la que el contador vive en la base y no en el navegador.

ALTER TABLE cotizaciones ADD COLUMN eliminada_en TEXT;
-- Correo de quien la mandó a la papelera, del token de Access. Borrar sin
-- dejar constancia de quién borró convierte un descuido en un misterio.
ALTER TABLE cotizaciones ADD COLUMN eliminada_por TEXT;

-- El historial normal consulta siempre `eliminada_en IS NULL`, y la papelera
-- lo contrario. Es la columna que entra en todas las consultas del listado a
-- partir de ahora, así que va indexada junto al orden de emisión.
CREATE INDEX cotizaciones_papelera ON cotizaciones (eliminada_en, emitida_en DESC);
