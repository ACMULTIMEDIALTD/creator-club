import { one } from '../db.js';
import { invoiceFileUrl } from './images.js';

export const DOC_TYPES = {
  deal_invoice: 'חשבונית עסקה',
  tax_invoice: 'חשבונית מס',
  tax_invoice_receipt: 'חשבונית מס/קבלה',
  receipt: 'קבלה',
};

/** Barter pays in products only, so there's nothing to invoice. */
export const needsPayment = (application, campaignType) => application?.status === 'completed' && campaignType !== 'barter';

export const INVOICE_COLUMNS = `i.doc_type, i.amount_ils, i.account_holder, i.bank_name, i.branch, i.account_number,
  i.uploaded_at, i.file_id, f.file_name, f.mime AS file_mime`;

/** Shapes a joined invoice row for the API (null when not uploaded yet). */
export function invoiceOut(r) {
  if (!r?.file_id) return null;
  return {
    doc_type: r.doc_type,
    amount_ils: Number(r.amount_ils),
    account_holder: r.account_holder,
    bank_name: r.bank_name,
    branch: r.branch,
    account_number: r.account_number,
    uploaded_at: r.uploaded_at,
    file_name: r.file_name,
    file_mime: r.file_mime,
    file_url: invoiceFileUrl(r.file_id),
  };
}

/** The payment block on the creator's campaign page. */
export async function paymentFor(userId, applicationId) {
  const row = await one(
    `SELECT a.paid_at, ${INVOICE_COLUMNS}
     FROM applications a LEFT JOIN invoices i ON i.application_id = a.id LEFT JOIN invoice_files f ON f.id = i.file_id
     WHERE a.id = $1`,
    [applicationId],
  );
  // Bank details she chose to save in her profile, so she doesn't type them every time
  const saved = await one(
    `SELECT bank_account_holder AS account_holder, bank_name, bank_branch AS branch, bank_account_number AS account_number
     FROM creators WHERE user_id = $1 AND bank_account_number IS NOT NULL`,
    [userId],
  );
  return { paid_at: row.paid_at, invoice: invoiceOut(row), saved_bank: saved };
}
