CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------- users / auth ----------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  phone         text UNIQUE,
  password_hash text,                       -- null if magic-link only
  role          text NOT NULL CHECK (role IN ('creator','admin')) DEFAULT 'creator',
  status        text NOT NULL CHECK (status IN ('pending','active','suspended','left')) DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- token column stores sha256(token), never the raw token
CREATE TABLE magic_links (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

-- ---------- lookup tables (seeded) ----------
CREATE TABLE niches (
  id   serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE regions (
  id   serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  sort int NOT NULL DEFAULT 0
);

-- ---------- creator profile ----------
CREATE TABLE creators (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name          text NOT NULL,
  birth_year         int,
  city               text,
  region_id          int REFERENCES regions(id),

  instagram_handle   text,
  instagram_followers int,
  tiktok_handle      text,
  tiktok_followers   int,
  youtube_url        text,
  other_platforms    text,

  audience_gender    text CHECK (audience_gender IN ('mostly_women','mostly_men','mixed')),
  audience_age_min   int,
  audience_age_max   int,
  audience_sector    text,

  open_to_paid       boolean NOT NULL DEFAULT true,
  open_to_barter     boolean NOT NULL DEFAULT true,
  open_to_events     boolean NOT NULL DEFAULT false,
  open_to_affiliate  boolean NOT NULL DEFAULT false,
  rate_post_ils      int,
  rate_story_ils     int,
  rate_reel_ils      int,
  billing_status     text CHECK (billing_status IN ('osek_patur','osek_murshe','company','none')) DEFAULT 'none',

  tier               text NOT NULL CHECK (tier IN ('A','B','new')) DEFAULT 'new',
  admin_notes        text,
  internal_rating    smallint CHECK (internal_rating BETWEEN 1 AND 5),

  terms_version      text NOT NULL,
  terms_accepted_at  timestamptz NOT NULL,
  terms_ip           inet,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE creator_niches (
  creator_id uuid REFERENCES creators(user_id) ON DELETE CASCADE,
  niche_id   int  REFERENCES niches(id),
  PRIMARY KEY (creator_id, niche_id)
);

CREATE TABLE creator_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(user_id) ON DELETE CASCADE,
  url        text NOT NULL,
  label      text,
  sort       int NOT NULL DEFAULT 0
);

-- ---------- brands ----------
CREATE TABLE brands (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  contact_name  text,
  contact_phone text,
  contact_email text,
  agreement_signed_at timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- campaigns ----------
CREATE TABLE campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           uuid REFERENCES brands(id),
  title              text NOT NULL,
  brand_display_name text NOT NULL,
  short_description  text NOT NULL,
  full_brief         text,
  type               text NOT NULL CHECK (type IN ('paid','barter','hybrid')),
  product_value_ils  int,
  payment_note       text,
  min_followers      int NOT NULL DEFAULT 0,
  platforms          text[] NOT NULL DEFAULT '{instagram}',
  required_niche_ids int[],
  region_ids         int[],
  slots              int NOT NULL,
  deadline_apply     timestamptz NOT NULL,
  deadline_publish   date,
  status             text NOT NULL CHECK (status IN ('draft','open','closed','in_progress','done','cancelled')) DEFAULT 'draft',
  slug               text UNIQUE NOT NULL,
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE applications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id   uuid NOT NULL REFERENCES creators(user_id) ON DELETE CASCADE,
  message      text CHECK (char_length(message) <= 300),
  status       text NOT NULL CHECK (status IN ('applied','selected','rejected','withdrawn','completed')) DEFAULT 'applied',
  admin_note   text,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  UNIQUE (campaign_id, creator_id)
);

-- ---------- audit ----------
CREATE TABLE events (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  type       text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- indexes ----------
CREATE INDEX ON creators (instagram_followers DESC);
CREATE INDEX ON creators (tier);
CREATE INDEX ON creators (region_id);
CREATE INDEX ON campaigns (status, deadline_apply);
CREATE INDEX ON applications (campaign_id, status);
CREATE INDEX ON applications (creator_id);
CREATE INDEX ON events (user_id, created_at);
CREATE INDEX ON magic_links (user_id);
