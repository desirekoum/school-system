import { Router } from 'express';
import { crudRouter } from '../crud.js';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { withDateRange, paginatedWithSum, fullList } from '../../db/paginate.js';
import { sale, createSale, voidSale, expense, createExpense, voidExpense } from './store.service.js';

// ---------- Items for sale (catalog) ----------
export const items = crudRouter({
  table: 'items',
  fields: ['code', 'name', 'category', 'price', 'stock', 'is_active', 'description'],
  required: ['code', 'name', 'price'],
  listSql: `
    SELECT i.*, COALESCE(sold.quantity, 0)::int AS sold
    FROM items i
    LEFT JOIN (SELECT si.item_id, SUM(si.quantity) AS quantity FROM sale_items si
               JOIN sales s ON s.id = si.sale_id WHERE s.voided_at IS NULL GROUP BY si.item_id) sold ON sold.item_id = i.id`,
  orderBy: 'category, name',
  searchColumns: ['code', 'name', 'description'],
  filters: ['category', 'is_active'],
  beforeDelete: async (id) => {
    const { rowCount } = await query(
      'SELECT 1 FROM sale_items WHERE item_id = $1 UNION ALL SELECT 1 FROM expenses WHERE item_id = $1 LIMIT 1', [id]);
    if (rowCount) throw new HttpError(409, 'This item has sales or purchases: deactivate it instead of deleting it');
  },
});

// ---------- Sales ----------
export const sales = Router();
const SALES = {
  baseSql: `
    SELECT s.*, st.total, st.items, stu.matricule,
           COALESCE(stu.first_name || ' ' || stu.last_name, s.buyer_name) AS buyer,
           (s.voided_at IS NOT NULL) AS voided,
           (SELECT string_agg(si.quantity || ' × ' || i.name, ', ' ORDER BY si.id)
            FROM sale_items si JOIN items i ON i.id = si.item_id WHERE si.sale_id = s.id) AS summary
    FROM sales s JOIN sale_totals st ON st.sale_id = s.id
    LEFT JOIN students stu ON stu.id = s.student_id`,
  orderBy: 'sold_at DESC, id DESC',
  searchColumns: ['receipt_number', 'buyer', 'matricule', 'summary', 'reference'],
  filters: ['academic_year', 'method', 'student_id', 'voided'],
};
sales.get('/', async (req, res) => {
  const opts = withDateRange(req.query, SALES, 's.sold_at');
  if (req.query.page === undefined) return res.json(await fullList(req.query, opts));
  res.json(await paginatedWithSum(req.query, opts, 'SUM(total) FILTER (WHERE NOT voided)'));
});
sales.get('/:id', async (req, res) => res.json(await sale(req.params.id)));
sales.post('/', async (req, res) => res.status(201).json(await createSale(req.body)));
sales.post('/:id/void', async (req, res) => res.json(await voidSale(req.params.id, req.body.reason)));

// ---------- Expenses ----------
export const expenses = Router();
const EXPENSES = {
  baseSql: `
    SELECT e.*, i.name AS item_name, (e.voided_at IS NOT NULL) AS voided
    FROM expenses e LEFT JOIN items i ON i.id = e.item_id`,
  orderBy: 'spent_at DESC, id DESC',
  searchColumns: ['voucher_number', 'description', 'supplier', 'reference', 'item_name'],
  filters: ['academic_year', 'category', 'method', 'voided'],
};
expenses.get('/', async (req, res) => {
  const opts = withDateRange(req.query, EXPENSES, 'e.spent_at');
  if (req.query.page === undefined) return res.json(await fullList(req.query, opts));
  res.json(await paginatedWithSum(req.query, opts, 'SUM(amount) FILTER (WHERE NOT voided)'));
});
expenses.get('/:id', async (req, res) => res.json(await expense(req.params.id)));
expenses.post('/', async (req, res) => res.status(201).json(await createExpense(req.body)));
expenses.post('/:id/void', async (req, res) => res.json(await voidExpense(req.params.id, req.body.reason)));
