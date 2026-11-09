-- Payments: Noa approves the video (application → 'completed'), the creator uploads her
-- invoice/receipt with bank details on the campaign page, Noa marks it paid.
CREATE TABLE invoice_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime       text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
  file_name  text,
  data       bytea NOT NULL,
  bytes      int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  application_id uuid PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  file_id        uuid NOT NULL REFERENCES invoice_files(id),
  doc_type       text NOT NULL CHECK (doc_type IN ('deal_invoice','tax_invoice','tax_invoice_receipt','receipt')),
  amount_ils     numeric(10,2) NOT NULL CHECK (amount_ils > 0),
  account_holder text NOT NULL,
  bank_name      text NOT NULL,
  branch         text NOT NULL,
  account_number text NOT NULL,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE applications ADD COLUMN paid_at timestamptz;

-- Bank details saved to the profile only when the creator chooses to (otherwise only on that invoice)
ALTER TABLE creators
  ADD COLUMN bank_account_holder text,
  ADD COLUMN bank_name           text,
  ADD COLUMN bank_branch         text,
  ADD COLUMN bank_account_number text;
