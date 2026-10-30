import ExcelJS from 'exceljs';
import { HttpError } from '../../middleware/errors.js';

/**
 * Excel helpers for imports: read a workbook into plain rows, convert cell values to typed values,
 * and build the downloadable template.
 */

export const MAX_ROWS = 5000;

// "Date de naissance", "date_naissance" and "DateNaissance" all become "datedenaissance"/"datenaissance"
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// exceljs cell values can be rich text, hyperlinks, formulas or errors: keep only what the user sees
function plain(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return plain(v.result);          // formula → its computed value
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return plain(v.text);               // hyperlink
    if ('error' in v) return null;                       // #N/A, #REF!...
    return null;
  }
  return v;
}

/** Reads the first data sheet: header = first non-empty row, then one object per non-empty row. */
export async function readSheet(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new HttpError(400, 'This file is not a valid Excel workbook (.xlsx)');
  }
  const ws = wb.worksheets.find((w) => norm(w.name) !== 'instructions' && w.actualRowCount > 0);
  if (!ws) throw new HttpError(400, 'The workbook is empty');

  let headers = null;
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, number) => {
    const values = [];
    row.eachCell({ includeEmpty: false }, (cell, col) => { values[col] = plain(cell.value); });
    if (!values.some((v) => v != null && String(v).trim() !== '')) return;
    if (!headers) {
      headers = values.map((v) => (v == null ? '' : String(v).trim()));
      return;
    }
    rows.push({ number, values });
  });
  if (!headers) throw new HttpError(400, 'No header row found');
  if (rows.length > MAX_ROWS) throw new HttpError(400, `Too many rows (${rows.length}): import at most ${MAX_ROWS} at a time`);
  return { headers, rows };
}

/** Matches the sheet headers to the entity columns by key, label or alias. Returns column index → column. */
export function mapHeaders(headers, columns) {
  const lookup = new Map();
  for (const c of columns) for (const name of [c.key, c.label, ...(c.aliases ?? [])]) lookup.set(norm(name), c);
  const mapping = [];
  const ignored = [];
  const seen = new Set();
  headers.forEach((h, i) => {
    if (!h) return;
    const col = lookup.get(norm(h));
    if (col && !seen.has(col.key)) { mapping[i] = col; seen.add(col.key); }
    else ignored.push(h);
  });
  const missing = columns.filter((c) => c.match && c.required && !seen.has(c.key)).map((c) => c.label);
  return { mapping, ignored, missing };
}

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === +y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === +d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const TRUE = ['oui', 'yes', 'true', 'vrai', '1', 'x', 'o', 'y', 'active', 'actif', 'onsale', 'envente'];
const FALSE = ['non', 'no', 'false', 'faux', '0', 'n', 'inactive', 'inactif', 'withdrawn', 'retire'];

/**
 * Converts one cell to the column type. Returns { value } or { error }.
 * Empty cell → { value: undefined } (the field is left unchanged on update).
 */
export function convert(raw, col) {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return { value: undefined };
  const text = raw instanceof Date ? null : String(raw).trim();
  switch (col.type) {
    case 'int':
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(text.replace(/[\s  ]/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) return { error: 'must be a number' };
      if (col.type === 'int' && !Number.isInteger(n)) return { error: 'must be a whole number' };
      if (col.min != null && n < col.min) return { error: `must be at least ${col.min}` };
      return { value: n };
    }
    case 'date': {
      // Excel stores dates as UTC midnight: read the UTC parts so no time zone shifts the day
      if (raw instanceof Date) return { value: isoDate(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate()) };
      if (typeof raw === 'number') {  // serial number (days since 1899-12-30)
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000);
        return { value: isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
      }
      let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      const v = m ? isoDate(m[1], +m[2], +m[3]) : (m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)) && isoDate(m[3], +m[2], +m[1]);
      return v ? { value: v } : { error: 'must be a date (DD/MM/YYYY)' };
    }
    case 'bool': {
      const t = norm(text);
      if (TRUE.includes(t)) return { value: true };
      if (FALSE.includes(t)) return { value: false };
      return { error: 'must be Yes or No' };
    }
    case 'enum': {
      // Exact text first ("A-" ≠ "A+"), then the loose form ("feminin" = "Féminin")
      const names = (v) => [v.value, v.label, ...(v.aliases ?? [])];
      const hit = col.values.find((v) => names(v).some((s) => s.toLowerCase() === text.toLowerCase()))
        ?? col.values.find((v) => names(v).some((s) => norm(s) === norm(text)));
      return hit ? { value: hit.value } : { error: `must be one of: ${col.values.map((v) => v.label).join(', ')}` };
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? { value: text.toLowerCase() } : { error: 'must be an email address' };
    default:
      if (col.max && text.length > col.max) return { error: `is too long (max ${col.max} characters)` };
      return { value: col.upper ? text.toUpperCase() : text };
  }
}

const FORMAT_HELP = {
  text: 'Text', int: 'Whole number', number: 'Number', date: 'Date (DD/MM/YYYY)', bool: 'Yes / No', email: 'Email address',
};

/** Template workbook: a "Data" sheet with styled headers, an example row and dropdowns, plus an "Instructions" sheet. */
export async function buildTemplate(def) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SchoolDoc';
  const ws = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = def.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(14, c.label.length + 4) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  def.columns.forEach((c, i) => {
    head.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? 'FF1D4ED8' : 'FF64748B' } };
  });
  ws.addRow(def.columns.map((c) => def.example?.[c.key] ?? null));
  def.columns.forEach((c, i) => {
    const letter = ws.getColumn(i + 1).letter;
    if (c.type === 'date') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
    if (c.type === 'enum' || c.type === 'bool') {
      const list = c.type === 'bool' ? ['Yes', 'No'] : c.values.map((v) => v.label);
      // List validation = dropdown in Excel (formula1 is a quoted, comma-separated list)
      ws.dataValidations.add(`${letter}2:${letter}${MAX_ROWS + 1}`, { type: 'list', allowBlank: true, formulae: [`"${list.join(',')}"`] });
    }
  });

  const help = wb.addWorksheet('Instructions');
  help.columns = [{ header: 'Column', width: 28 }, { header: 'Required', width: 12 }, { header: 'Format', width: 22 }, { header: 'Notes / allowed values', width: 70 }];
  help.getRow(1).font = { bold: true };
  for (const c of def.columns) {
    const allowed = c.type === 'enum' ? c.values.map((v) => v.label).join(', ') : '';
    help.addRow([c.label, c.required ? 'Yes' : '', FORMAT_HELP[c.type] ?? 'Text', [c.note, allowed].filter(Boolean).join(' · ')]);
  }
  help.addRow([]);
  for (const line of [
    'Fill the "Data" sheet: one row per record, keep the header row. Delete the example row.',
    `Existing records are matched by ${def.matchedBy} and updated; the others are created.`,
    'An empty cell leaves the existing value unchanged. Unknown columns are ignored.',
    'Nothing is saved if one row has an error: fix the listed rows and import again.',
  ]) help.addRow([line]);
  return wb.xlsx.writeBuffer();
}
