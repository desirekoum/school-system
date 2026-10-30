import { downloadCsv } from './csv';

const save = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
};

// 'YYYY-MM-DD' (or an ISO timestamp) → a real Excel date, so it sorts and filters as a date
// A timestamp keeps the local calendar day (a 23:30 payment in Douala is not moved to the next UTC day)
const toDate = (v) => {
  if (typeof v !== 'string') return v;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(+d) ? v : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : v;
};

/**
 * Downloads rows as a real Excel workbook (.xlsx). Same `columns` as downloadCsv: [[key, header, format?]].
 * Numbers stay numbers and dates stay dates, so totals and filters work in Excel.
 * exceljs (~1 MB) is loaded with a dynamic import(): it becomes its own chunk, fetched on the first export only.
 */
export async function downloadXlsx(filename, rows, columns, sheetName = 'Data') {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SchoolDoc';
  const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(([key, header]) => ({ header, key }));

  for (const r of rows) {
    ws.addRow(columns.map(([key, , format]) => {
      const v = format ? format(r[key], r) : r[key];
      if (v == null || v === '') return null;
      if (typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
      if (/date|_at$/.test(key)) return toDate(v);
      return v;
    }));
  }

  columns.forEach(([key], i) => {
    const col = ws.getColumn(i + 1);
    const values = rows.map((_, j) => ws.getRow(j + 2).getCell(i + 1).value);
    if (values.some((v) => v instanceof Date)) col.numFmt = 'dd/mm/yyyy';
    else if (/amount|price|fee|total|balance|paid|salary|tuition|cost/.test(key)) col.numFmt = '#,##0';
    // Width from the longest value (capped), so the sheet is readable without resizing
    const longest = Math.max(String(col.header).length, ...values.map((v) => (v instanceof Date ? 10 : String(v ?? '').length)));
    col.width = Math.min(50, Math.max(10, longest + 2));
  });

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buffer = await wb.xlsx.writeBuffer();
  save(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

/** Export in the chosen format; `name` has no extension. */
export const exportRows = (format, name, rows, columns) =>
  format === 'csv' ? downloadCsv(`${name}.csv`, rows, columns) : downloadXlsx(`${name}.xlsx`, rows, columns);

export { save as saveBlob };
