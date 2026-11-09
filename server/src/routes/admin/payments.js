import { Router } from 'express';
import { query } from '../../db.js';
import { INVOICE_COLUMNS, invoiceOut } from '../../lib/payments.js';
import { invoiceFileUrl } from '../../lib/images.js';

const router = Router();

/** Every approved video in a paid/hybrid campaign: waiting for an invoice, to pay, or paid. */
router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.decided_at AS approved_at, a.paid_at, ${INVOICE_COLUMNS},
            u.id AS creator_id, u.phone, cr.full_name, cr.billing_status,
            c.id AS campaign_id, c.title, c.slug, c.payment_note
     FROM applications a
     JOIN campaigns c ON c.id = a.campaign_id
     JOIN users u ON u.id = a.creator_id
     JOIN creators cr ON cr.user_id = a.creator_id
     LEFT JOIN invoices i ON i.application_id = a.id
     LEFT JOIN invoice_files f ON f.id = i.file_id
     WHERE a.status = 'completed' AND c.type <> 'barter'
     ORDER BY a.paid_at DESC NULLS FIRST, i.uploaded_at ASC NULLS LAST, a.decided_at ASC`,
  );
  const { rows: archive } = await query(
    `SELECT id, creator_name, creator_email, campaign_title, doc_type, amount_ils, account_holder, bank_name, branch,
            account_number, uploaded_at, paid_at, file_name, account_deleted_at
     FROM payment_archive ORDER BY account_deleted_at DESC`,
  );
  res.json({
    // Invoices of creators who deleted their account (kept as payment records)
    archive: archive.map((r) => ({ ...r, amount_ils: Number(r.amount_ils), file_url: invoiceFileUrl(r.id, 'arc') })),
    payments: rows.map((r) => ({
      id: r.id,
      approved_at: r.approved_at,
      paid_at: r.paid_at,
      creator: { id: r.creator_id, full_name: r.full_name, phone: r.phone, billing_status: r.billing_status },
      campaign: { id: r.campaign_id, title: r.title, slug: r.slug, payment_note: r.payment_note },
      invoice: invoiceOut(r),
    })),
  });
});

export default router;
