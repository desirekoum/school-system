import { query } from './pool.js';
import { HttpError } from '../middleware/errors.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** Reads ?page & ?pageSize, clamped to sane bounds (pageSize 1..100, default 50). */
export function pageParams(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(q.pageSize, 10) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// Escape LIKE wildcards so a search for "50%" matches literally
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Builds the WHERE clause for a list query wrapped as `FROM (baseSql) t`.
 * - search: case-insensitive match on the concatenation of `searchColumns`
 * - filters: exact match on whitelisted columns (?status=active, ?class_id=3...)
 * Returns parameterized SQL fragments: values are never concatenated into the SQL string.
 */
export function buildWhere(q, { searchColumns = [], filters = [] }, params = []) {
  const where = [];
  const search = String(q.search ?? '').trim();
  if (search && searchColumns.length) {
    params.push(`%${likeEscape(search)}%`);
    where.push(`concat_ws(' ', ${searchColumns.map((c) => `t.${c}`).join(', ')}) ILIKE $${params.length}`);
  }
  for (const f of filters) {
    if (q[f] === undefined || q[f] === '') continue;
    params.push(q[f]);
    where.push(`t.${f}::text = $${params.length}`);
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/**
 * Paginated list: one query returns the page AND the total, thanks to the
 * `count(*) OVER()` window function (counts all matching rows before LIMIT applies).
 * `t.id` is appended to the ORDER BY as a tiebreaker: without a unique sort key, rows with equal
 * values (two "Mbarga") can swap between pages and appear twice or not at all.
 */
export async function paginatedList(q, { baseSql, baseParams = [], orderBy, searchColumns, filters }) {
  const { page, pageSize, offset } = pageParams(q);
  // baseParams: values for $1..$n already used inside baseSql (e.g. a class id)
  const { where, params } = buildWhere(q, { searchColumns, filters }, [...baseParams]);
  const { rows } = await query(
    `SELECT t.*, count(*) OVER()::int AS _total FROM (${baseSql}) t ${where}
     ORDER BY ${orderBy}, t.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]);

  // A page past the end returns no row, hence no _total: count separately
  let total = rows[0]?._total;
  if (total === undefined) {
    total = page === 1 ? 0 : (await query(`SELECT count(*)::int AS n FROM (${baseSql}) t ${where}`, params)).rows[0].n;
  }
  rows.forEach((r) => delete r._total);
  return { data: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Date range on top of the generic filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD on `column`.
 * Returns list options whose baseSql carries the condition and baseParams its values.
 * `opts.baseSql` must not already contain a WHERE clause.
 */
export function withDateRange(q, opts, column) {
  const params = [];
  const conds = [];
  for (const [key, op] of [['from', '>='], ['to', '<=']]) {
    if (!q[key]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q[key])) throw new HttpError(400, `${key} must be a date (YYYY-MM-DD)`);
    params.push(q[key]);
    conds.push(`${column} ${op} $${params.length}`);
  }
  return { ...opts, baseSql: opts.baseSql + (conds.length ? ` WHERE ${conds.join(' AND ')}` : ''), baseParams: params };
}

/** Paginated list plus the sum of `sumSql` over the whole filtered set (not just the page). */
export async function paginatedWithSum(q, opts, sumSql) {
  const page = await paginatedList(q, opts);
  const { where, params } = buildWhere(q, opts, [...(opts.baseParams ?? [])]);
  const { rows: [r] } = await query(`SELECT COALESCE(${sumSql}, 0)::bigint::float AS sum FROM (${opts.baseSql}) t ${where}`, params);
  return { ...page, sum: r.sum };
}

/** Full (unpaginated) filtered list, e.g. for CSV export. */
export async function fullList(q, opts) {
  const { where, params } = buildWhere(q, opts, [...(opts.baseParams ?? [])]);
  const { rows } = await query(`SELECT * FROM (${opts.baseSql}) t ${where} ORDER BY ${opts.orderBy}`, params);
  return rows;
}
