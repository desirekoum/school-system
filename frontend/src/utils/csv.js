/**
 * Downloads rows as a CSV file that Excel / LibreOffice open directly.
 * columns: [[key, header, format?]]; ';' separator (French locale Excel) and a BOM so accents survive.
 */
export function downloadCsv(filename, rows, columns) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    columns.map(([, header]) => cell(header)).join(';'),
    ...rows.map((r) => columns.map(([key, , format]) => cell(format ? format(r[key], r) : r[key])).join(';')),
  ];
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
