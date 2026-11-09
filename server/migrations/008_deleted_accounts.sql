-- Deleting the account doesn't end what she agreed to (non-circumvention and confidentiality run
-- 12 months after membership ends, terms §3, §5, §6.1), so the record of who accepted which terms stays.
CREATE TABLE deleted_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         text,
  email             text NOT NULL,
  phone             text,
  instagram_handle  text,
  joined_at         timestamptz,
  terms_version     text,
  terms_accepted_at timestamptz,
  terms_ip          text,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  deleted_ip        text
);
