function cell(v) {
  if (v == null) return '';
  if (Array.isArray(v)) v = v.join(', ');
  if (v instanceof Date) v = v.toISOString();
  const s = String(v);
  // Guard against spreadsheet formula injection from user-entered text
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** columns: [[header, row => value], ...]. Output has a UTF-8 BOM so Excel shows Hebrew. */
export function toCsv(columns, rows) {
  const lines = [columns.map(([h]) => cell(h)).join(',')];
  for (const row of rows) lines.push(columns.map(([, get]) => cell(get(row))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
