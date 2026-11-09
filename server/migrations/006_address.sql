-- Home address for shipping barter products (required when open to barter, or for hybrid campaigns).
ALTER TABLE creators
  ADD COLUMN address_street       text,
  ADD COLUMN address_apt          text,
  ADD COLUMN address_city         text,
  ADD COLUMN address_zip          text,
  ADD COLUMN address_confirmed_at timestamptz;

-- When selected for a campaign with a product, she confirms where to ship it (a snapshot,
-- so a later profile change doesn't silently move a package that's already on its way).
ALTER TABLE applications
  ADD COLUMN shipping_address     text,
  ADD COLUMN address_confirmed_at timestamptz;
