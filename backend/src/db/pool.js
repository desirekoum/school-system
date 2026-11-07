import pg from 'pg';
import 'dotenv/config';
import { createPool } from './mysql.js';

/**
 * One database API for the whole app, on PostgreSQL or MySQL 8 — chosen by the DATABASE_URL scheme:
 *   postgres://user:pass@host:5432/schooldoc   or   mysql://user:pass@host:3306/schooldoc
 * Both expose query(text, params) → { rows, rowCount } and pool.connect() → client for transactions.
 * The SQL is written for PostgreSQL; db/mysql.js translates it for MySQL.
 */
const url = process.env.DATABASE_URL ?? '';
export const dialect = /^mysql:/i.test(url) ? 'mysql' : 'postgres';
export const isMySQL = dialect === 'mysql';

// Keep DATE columns as 'YYYY-MM-DD' strings: parsing them as local midnight shifts them
// by a day once serialized to UTC JSON on a UTC+1 server (Central Africa time).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

// One shared connection pool for the whole app (reuses TCP connections)
export const pool = isMySQL ? createPool(url) : new pg.Pool({ connectionString: url });

export const query = (text, params) => pool.query(text, params);

/**
 * Multi-row VALUES list for an INSERT, portable to both databases (replaces PostgreSQL's unnest()).
 *   valuesList([[1, 'a'], [2, 'b']], 1) → { sql: '($2, $3), ($4, $5)', params: [1, 'a', 2, 'b'] }
 * `after` = number of $n placeholders already used before the list.
 */
export function valuesList(rows, after = 0) {
  const params = [];
  const sql = rows.map((r) => `(${r.map((v) => { params.push(v); return `$${after + params.length}`; }).join(', ')})`).join(', ');
  return { sql, params };
}
