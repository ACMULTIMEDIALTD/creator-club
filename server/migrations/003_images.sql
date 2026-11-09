-- Campaign images, stored in Postgres (a few hundred KB each after client-side resizing),
-- so no extra storage service is needed.
CREATE TABLE images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime       text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  data       bytea NOT NULL,
  bytes      int NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ADD COLUMN image_id uuid REFERENCES images(id) ON DELETE SET NULL;
