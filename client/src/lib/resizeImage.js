/**
 * Shrink a photo before upload: longest side ≤ maxSide, re-encoded as JPEG.
 * A 4MB phone photo becomes ~200–400KB, which loads fast on a WhatsApp-opened phone.
 */
export async function resizeImage(file, { maxSide = 1600, quality = 0.85 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode_failed'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs → white, not black, in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}
