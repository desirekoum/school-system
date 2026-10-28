import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { tx, METHODS } from '../finances/finances.service.js';

export const ITEM_CATEGORIES = ['uniform', 'books', 'supplies', 'documents', 'services', 'other'];
export const EXPENSE_CATEGORIES = ['stock', 'supplies', 'furniture', 'equipment', 'maintenance', 'utilities', 'transport', 'events', 'other'];

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? '')) && !Number.isNaN(Date.parse(d));
const todayIso = () => new Date().toISOString().slice(0, 10);
const positiveInt = (n) => Number.isInteger(Number(n)) && Number(n) > 0;

function checkPayment({ method = 'cash', reference }, dateField, date) {
  if (!METHODS.includes(method)) throw new HttpError(400, `method must be one of ${METHODS.join(', ')}`);
  if (method !== 'cash' && !reference) throw new HttpError(400, 'A reference (transaction id, cheque number...) is required for non-cash payments');
  if (date && !isDate(date)) throw new HttpError(400, `${dateField} must be a date (YYYY-MM-DD)`);
  if (date && date > todayIso()) throw new HttpError(400, `${dateField} cannot be in the future`);
}

/** Academic year a sale or expense belongs to: the given one, else the current one. */
async function resolveYear(client, name) {
  const { rows: [y] } = name
    ? await client.query('SELECT name FROM academic_years WHERE name = $1', [name])
    : await client.query('SELECT name FROM academic_years ORDER BY is_current DESC, name DESC LIMIT 1');
  if (!y) throw new HttpError(400, name ? `Unknown academic year ${name}` : 'Create an academic year first');
  return y.name;
}

// ---------- Sales ----------

export async function sale(id) {
  const { rows: [s] } = await query(`
    SELECT s.*, st.total, st.items, stu.matricule, stu.first_name || ' ' || stu.last_name AS student,
           (SELECT c.name FROM registrations r JOIN classes c ON c.id = r.class_id
            WHERE r.student_id = s.student_id AND r.academic_year = s.academic_year LIMIT 1) AS class_name
    FROM sales s JOIN sale_totals st ON st.sale_id = s.id
    LEFT JOIN students stu ON stu.id = s.student_id
    WHERE s.id = $1`, [id]);
  if (!s) throw new HttpError(404, 'Sale not found');
  const { rows: lines } = await query(`
    SELECT si.*, i.code, i.name FROM sale_items si JOIN items i ON i.id = si.item_id
    WHERE si.sale_id = $1 ORDER BY si.id`, [id]);
  return { ...s, lines };
}

/**
 * Records a sale of one or more items. Item rows are locked (in id order, so two sales never
 * wait on each other in a cycle = no deadlock) before the stock is checked and decremented.
 */
export async function createSale({ student_id, buyer_name, academic_year, lines, method = 'cash', reference, sold_at, received_by, notes }) {
  if (!student_id && !buyer_name?.trim()) throw new HttpError(400, 'Choose a student or enter the buyer name');
  if (!Array.isArray(lines) || !lines.length) throw new HttpError(400, 'Add at least one item');
  checkPayment({ method, reference }, 'sold_at', sold_at);

  // Same item twice in the cart → one line with the summed quantity
  const qty = new Map();
  for (const l of lines) {
    if (!positiveInt(l.item_id) || !positiveInt(l.quantity)) throw new HttpError(400, 'Each line needs an item and a positive whole quantity');
    qty.set(Number(l.item_id), (qty.get(Number(l.item_id)) ?? 0) + Number(l.quantity));
  }
  const ids = [...qty.keys()].sort((a, b) => a - b);

  const id = await tx(async (client) => {
    const { rows: items } = await client.query('SELECT * FROM items WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
    if (items.length !== ids.length) throw new HttpError(400, 'Unknown item in the cart');
    for (const it of items) {
      if (!it.is_active) throw new HttpError(409, `${it.name} is no longer sold`);
      if (it.stock !== null && it.stock < qty.get(it.id)) throw new HttpError(409, `Not enough stock for ${it.name}: ${it.stock} left`);
    }
    const year = await resolveYear(client, academic_year);
    const { rows: [s] } = await client.query(`
      INSERT INTO sales (student_id, buyer_name, academic_year, sold_at, method, reference, received_by, notes)
      VALUES ($1, $2, $3, COALESCE($4::date, current_date), $5, $6, $7, $8) RETURNING id`,
      [student_id || null, buyer_name?.trim() || null, year, sold_at || null, method, reference || null, received_by || null, notes || null]);
    await client.query(`
      INSERT INTO sale_items (sale_id, item_id, quantity, unit_price)
      SELECT $1, i.id, u.quantity, i.price
      FROM unnest($2::int[], $3::int[]) AS u(item_id, quantity) JOIN items i ON i.id = u.item_id`,
      [s.id, ids, ids.map((i) => qty.get(i))]);
    await client.query(`
      UPDATE items i SET stock = i.stock - u.quantity
      FROM unnest($1::int[], $2::int[]) AS u(item_id, quantity)
      WHERE i.id = u.item_id AND i.stock IS NOT NULL`, [ids, ids.map((i) => qty.get(i))]);
    return s.id;
  });
  return sale(id);
}

/** Voiding a sale puts the items back in stock. */
export async function voidSale(id, reason) {
  if (!reason?.trim()) throw new HttpError(400, 'A reason is required to void a sale');
  await tx(async (client) => {
    const { rows: [s] } = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [id]);
    if (!s) throw new HttpError(404, 'Sale not found');
    if (s.voided_at) throw new HttpError(409, 'Sale already voided');
    await client.query('UPDATE sales SET voided_at = now(), void_reason = $2 WHERE id = $1', [id, reason.trim()]);
    await client.query(`
      UPDATE items i SET stock = i.stock + si.quantity
      FROM (SELECT item_id, SUM(quantity)::int AS quantity FROM sale_items WHERE sale_id = $1 GROUP BY item_id) si
      WHERE i.id = si.item_id AND i.stock IS NOT NULL`, [id]);
  });
  return sale(id);
}

// ---------- Expenses ----------

export async function expense(id) {
  const { rows: [e] } = await query(
    'SELECT e.*, i.name AS item_name, i.code AS item_code FROM expenses e LEFT JOIN items i ON i.id = e.item_id WHERE e.id = $1', [id]);
  if (!e) throw new HttpError(404, 'Expense not found');
  return e;
}

/** Records an expense. Buying a catalog item (item_id) adds the quantity to its stock. */
export async function createExpense(body) {
  const { academic_year, category = 'other', description, supplier, item_id, quantity = 1, unit_price, spent_at, method = 'cash', reference, approved_by, notes } = body;
  if (!description?.trim() && !item_id) throw new HttpError(400, 'Missing: description');
  if (!positiveInt(quantity)) throw new HttpError(400, 'quantity must be a positive whole number');
  if (!positiveInt(unit_price)) throw new HttpError(400, 'unit_price must be a positive whole number of FCFA');
  if (!EXPENSE_CATEGORIES.includes(category)) throw new HttpError(400, `category must be one of ${EXPENSE_CATEGORIES.join(', ')}`);
  checkPayment({ method, reference }, 'spent_at', spent_at);

  const id = await tx(async (client) => {
    let item = null;
    if (item_id) {
      ({ rows: [item] } = await client.query('SELECT * FROM items WHERE id = $1 FOR UPDATE', [item_id]));
      if (!item) throw new HttpError(400, 'Unknown item');
      await client.query('UPDATE items SET stock = stock + $2 WHERE id = $1 AND stock IS NOT NULL', [item.id, Number(quantity)]);
    }
    const year = await resolveYear(client, academic_year);
    const { rows: [e] } = await client.query(`
      INSERT INTO expenses (academic_year, category, description, supplier, item_id, quantity, unit_price, spent_at, method, reference, approved_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, current_date), $9, $10, $11, $12) RETURNING id`,
      [year, item ? 'stock' : category, description?.trim() || `Restock: ${item.name}`, supplier || null, item?.id ?? null,
        Number(quantity), Number(unit_price), spent_at || null, method, reference || null, approved_by || null, notes || null]);
    return e.id;
  });
  return expense(id);
}

/** Voiding a stock purchase removes the quantity again, unless those items were already sold. */
export async function voidExpense(id, reason) {
  if (!reason?.trim()) throw new HttpError(400, 'A reason is required to void an expense');
  await tx(async (client) => {
    const { rows: [e] } = await client.query('SELECT * FROM expenses WHERE id = $1 FOR UPDATE', [id]);
    if (!e) throw new HttpError(404, 'Expense not found');
    if (e.voided_at) throw new HttpError(409, 'Expense already voided');
    if (e.item_id) {
      const { rows: [it] } = await client.query('SELECT * FROM items WHERE id = $1 FOR UPDATE', [e.item_id]);
      if (it.stock !== null && it.stock < e.quantity) {
        throw new HttpError(409, `Only ${it.stock} ${it.name} left in stock: the purchased quantity (${e.quantity}) was partly sold`);
      }
      await client.query('UPDATE items SET stock = stock - $2 WHERE id = $1 AND stock IS NOT NULL', [e.item_id, e.quantity]);
    }
    await client.query('UPDATE expenses SET voided_at = now(), void_reason = $2 WHERE id = $1', [id, reason.trim()]);
  });
  return expense(id);
}
