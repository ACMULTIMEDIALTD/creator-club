import express, { Router } from 'express';
import { one } from '../../db.js';
import { HttpError } from '../../lib/http.js';
import { imageUrl, sniffImage } from '../../lib/images.js';

const router = Router();
const MAX_BYTES = 3 * 1024 * 1024; // the client resizes first; this is a safety cap

/** Upload one image as the raw request body (Content-Type: image/jpeg|png|webp). */
router.post('/', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_BYTES }), async (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : null;
  const mime = buf && sniffImage(buf);
  if (!mime) throw new HttpError(400, 'invalid_image', 'אפשר להעלות רק תמונה (JPG, PNG או WEBP)');
  const img = await one(
    'INSERT INTO images (mime, data, bytes, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [mime, buf, buf.length, req.user.id],
  );
  res.status(201).json({ id: img.id, url: imageUrl(img.id) });
});

export default router;
