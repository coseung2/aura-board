-- The drawing board layout is retired. Legacy boards are converted to the
-- freeform layout so they keep rendering; cards and related data are untouched.
UPDATE public."Board"
SET "layout" = 'freeform'
WHERE "layout" = 'drawing';

-- Remove only the bundled SVG seed rows. User-created assets are preserved.
DELETE FROM public."StudentAsset"
WHERE "title" IN (
  'seed:star',
  'seed:heart',
  'seed:check',
  'seed:speech-bubble',
  'seed:arrow-right',
  'seed:frame'
)
  AND "source" = 'upload'
  AND "fileUrl" LIKE 'data:image/svg+xml;base64,%';
