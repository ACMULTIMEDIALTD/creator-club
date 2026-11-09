-- A creator can delete her account from the app (App Store requirement). Payment documents are
-- legally required records, so invoices are moved here first; everything else is deleted.
CREATE TABLE payment_archive (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_name   text,
  creator_email  text,
  campaign_title text,
  doc_type       text,
  amount_ils     numeric(10,2),
  account_holder text,
  bank_name      text,
  branch         text,
  account_number text,
  uploaded_at    timestamptz,
  paid_at        timestamptz,
  file_mime      text,
  file_name      text,
  file_data      bytea,
  account_deleted_at timestamptz NOT NULL DEFAULT now()
);
