-- Receta estructurada (13/10/2026), para registrar cada receta en el repositorio
-- de Farmalink (docs/farmalink-integracion.md). Hasta hoy la receta quedaba solo
-- como texto (`contenido`) y la lista de medicamentos se perdía al cerrar.
--
-- Solo suma: columna nueva, vacía, que no lee ni escribe nada de lo que ya
-- funciona. La escribe el servidor (POST /api/documentos/receta-medicamentos)
-- DESPUÉS de que la receta ya se guardó; si esa escritura falla, la receta queda
-- igual que siempre. No entra en el contenido firmado (`contenidoFirmable`).
-- documentos no tiene policy de UPDATE para authenticated, pero el profesional
-- puede INSERTAR una fila con su sesión: por eso la lista no se cree a ciegas.
-- El endpoint solo la guarda si coincide con `contenido`, y quien la use la
-- vuelve a validar (`listaCoincideConReceta`, src/lib/recetas/serializar.ts).

ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS medicamentos jsonb;

COMMENT ON COLUMN public.documentos.medicamentos IS
  'Receta estructurada: lista de medicamentos (nombre, droga, presentación, forma, vía, cantidad de envases). La guarda el servidor si coincide con contenido; quien la use la valida con listaCoincideConReceta. El texto de la receta sigue en contenido.';
