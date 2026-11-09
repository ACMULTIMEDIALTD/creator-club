export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const notFound = (what = 'not_found') => new HttpError(404, what);

/** Parse with a zod schema or throw a 400 listing the offending fields. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new HttpError(400, 'validation_error', 'הנתונים שנשלחו אינם תקינים', { fields });
  }
  return result.data;
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'too_large', message: 'הקובץ גדול מדי' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_json' });
  }
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'conflict', detail: err.constraint });
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
}
