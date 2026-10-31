import mysql from 'mysql2/promise';

/**
 * MySQL 8 adapter with the same surface as node-postgres: query(text, params) → { rows, rowCount },
 * pool.connect() → client with query() and release(), pool.end().
 *
 * The modules write PostgreSQL-flavoured SQL. `translate()` rewrites the few PostgreSQL-only
 * constructs they use into MySQL, so one SQL string serves both databases:
 *   $1 placeholders → ?          expr::type → CAST(expr AS type)      ILIKE → LIKE
 *   agg(x) FILTER (WHERE c) → agg(CASE WHEN c THEN x END)             DESC NULLS LAST → DESC
 *   ON CONFLICT … DO UPDATE/NOTHING → ON DUPLICATE KEY UPDATE / INSERT IGNORE
 *   interval '1 month', make_interval(mins => $1) → INTERVAL 1 MONTH, INTERVAL ? MINUTE
 *   to_char, date_trunc, string_agg, json_object_agg, IS DISTINCT FROM → MySQL equivalents
 *   … RETURNING cols → emulated with a SELECT before/after the statement
 * String concatenation with || works because the session runs with PIPES_AS_CONCAT.
 */

const SQL_MODE = 'STRICT_TRANS_TABLES,ONLY_FULL_GROUP_BY,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,PIPES_AS_CONCAT';

// ---------- small scanner helpers ----------

// Ranges of string literals ('…' with '' escapes) so rewrites never touch their content
function literalRanges(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "'") continue;
    let j = i + 1;
    while (j < s.length && !(s[j] === "'" && s[j + 1] !== "'")) j += s[j] === "'" ? 2 : 1;
    out.push([i, j]);
    i = j;
  }
  return out;
}
const inLiteral = (ranges, i) => ranges.some(([a, b]) => i > a && i < b);

// Index of the "(" matching the ")" at `close`
function openParen(s, close) {
  for (let i = close, depth = 0, quoted = false; i >= 0; i--) {
    if (s[i] === "'") quoted = !quoted;
    if (quoted) continue;
    if (s[i] === ')') depth++;
    else if (s[i] === '(' && --depth === 0) return i;
  }
  return -1;
}
// Index of the ")" matching the "(" at `open`
function closeParen(s, open) {
  for (let i = open, depth = 0, quoted = false; i < s.length; i++) {
    if (s[i] === "'") quoted = !quoted;
    if (quoted) continue;
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i;
  }
  return -1;
}
// Splits on top-level commas
function splitArgs(s) {
  const out = []; let depth = 0, cur = '', quoted = false;
  for (const ch of s) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (ch === ',' && depth === 0 && !quoted) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Start index of the operand that ends just before `end` (exclusive): name(...), (…), CASE … END, 'lit', ident, $1, 12
function operandStart(s, end) {
  let i = end - 1;
  if (s[i] === ')') {
    i = openParen(s, i);
    let j = i; while (j > 0 && /\s/.test(s[j - 1])) j--;
    // window call: agg(...) OVER (...) → the operand starts at agg
    if (/\bOVER$/i.test(s.slice(0, j))) { j -= 4; while (j > 0 && /\s/.test(s[j - 1])) j--; return operandStart(s, j); }
    while (i > 0 && /[\w.]/.test(s[i - 1])) i--; // function name
    return i;
  }
  if (s[i] === "'") { i--; while (i >= 0 && s[i] !== "'") i--; return i; }
  if (/END$/i.test(s.slice(0, end))) {
    // back to the matching CASE
    let depth = 0;
    const re = /\b(CASE|END)\b/gi; const toks = [];
    let m; while ((m = re.exec(s.slice(0, end)))) toks.push([m.index, m[1].toUpperCase()]);
    for (let k = toks.length - 1; k >= 0; k--) {
      depth += toks[k][1] === 'END' ? 1 : -1;
      if (depth === 0) return toks[k][0];
    }
  }
  while (i >= 0 && /[\w.$]/.test(s[i])) i--;
  return i + 1;
}

const CAST_TYPES = {
  int: 'SIGNED', integer: 'SIGNED', int4: 'SIGNED', int8: 'SIGNED', bigint: 'SIGNED', smallint: 'SIGNED',
  text: 'CHAR', varchar: 'CHAR', date: 'DATE', time: 'TIME', numeric: 'DECIMAL(30,10)',
  float: 'DOUBLE', float8: 'DOUBLE', real: 'DOUBLE', double: 'DOUBLE', jsonb: 'JSON', json: 'JSON',
};

// expr::type → CAST(expr AS type); array casts (::int[]) are dropped (arrays are expanded as lists)
function rewriteCasts(s) {
  const re = /::(\w+)(\[\])?/;
  for (let guard = 0; guard < 500; guard++) {
    const lits = literalRanges(s);
    let m, idx = -1, from = 0;
    while ((m = re.exec(s.slice(from)))) { const at = from + m.index; if (!inLiteral(lits, at)) { idx = at; break; } from = at + 2; }
    if (idx < 0) return s;
    const [all, type, arr] = re.exec(s.slice(idx));
    const start = operandStart(s, idx);
    const expr = s.slice(start, idx);
    const target = CAST_TYPES[type.toLowerCase()];
    // Unknown types are PostgreSQL enums (::registration_status): MySQL ENUM columns compare with plain strings, so no cast
    s = s.slice(0, start) + (arr || !target ? expr : `CAST(${expr} AS ${target})`) + s.slice(idx + all.length);
  }
  return s;
}

// agg(args) FILTER (WHERE cond) → agg(CASE WHEN cond THEN args END)
function rewriteFilter(s) {
  const re = /\)\s*FILTER\s*\(\s*WHERE\s/i;
  for (let m; (m = re.exec(s));) {
    const close = m.index;
    const open = openParen(s, close);
    const filterOpen = s.indexOf('(', m.index + 1);
    const filterClose = closeParen(s, filterOpen);
    const cond = s.slice(filterOpen + 1, filterClose).replace(/^\s*WHERE\s+/i, '');
    const args = s.slice(open + 1, close).trim();
    const inner = args === '*' ? `CASE WHEN ${cond} THEN 1 END` : `CASE WHEN ${cond} THEN ${args} END`;
    s = s.slice(0, open + 1) + inner + ')' + s.slice(filterClose + 1);
  }
  return s;
}

// fn(…) with a rewriter of its argument list
function rewriteCalls(s, name, fn) {
  const re = new RegExp(`\\b${name}\\s*\\(`, 'i');
  for (let guard = 0, m; guard < 100 && (m = re.exec(s)); guard++) {
    const open = m.index + m[0].length - 1;
    const close = closeParen(s, open);
    s = s.slice(0, m.index) + fn(s.slice(open + 1, close)) + s.slice(close + 1);
  }
  return s;
}

const FORMATS = { 'YYYY-MM-DD': '%Y-%m-%d', 'YYYY-MM': '%Y-%m', YYYY: '%Y', 'HH24:MI': '%H:%i', 'HH24:MI:SS': '%H:%i:%s', FMDay: '%W', 'DD/MM/YYYY': '%d/%m/%Y' };
const UNITS = { day: 'DAY', days: 'DAY', month: 'MONTH', months: 'MONTH', year: 'YEAR', years: 'YEAR', minute: 'MINUTE', minutes: 'MINUTE', min: 'MINUTE', mins: 'MINUTE', hour: 'HOUR', hours: 'HOUR', week: 'WEEK', weeks: 'WEEK' };

export function translate(sql) {
  let s = sql;
  s = s.replace(/\bmake_interval\s*\(\s*(mins|hours|days)\s*=>\s*([^)]+)\)/gi, (_, u, v) => `INTERVAL ${v.trim()} ${UNITS[u.toLowerCase()]}`);
  s = s.replace(/\binterval\s+'(\d+)\s*(\w+)'/gi, (_, n, u) => `INTERVAL ${n} ${UNITS[u.toLowerCase()] ?? u.toUpperCase()}`);
  s = rewriteFilter(s);
  s = rewriteCasts(s);
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  s = s.replace(/\bnow\(\)/gi, 'NOW(3)'); // milliseconds, like PostgreSQL's now() in DATETIME(3) columns
  // Aliases that are reserved words in MySQL 8 (key, rank…) are quoted with backticks
  s = s.replace(/\bAS\s+(key|rank|rows|groups|window|range|lead|lag|row|order|group|interval|percent_rank|dense_rank|row_number)\b(?!\s*\()/gi, 'AS `$1`');
  s = s.replace(/\s+DESC\s+NULLS\s+LAST/gi, ' DESC');
  s = s.replace(/([\w.]+)\s+IS\s+DISTINCT\s+FROM\s+(\$\d+|coalesce\((?:[^()]|\([^()]*\))*\))/gi, 'NOT ($1 <=> $2)');
  s = s.replace(/=\s*ANY\s*\(\s*(\$\d+)\s*\)/gi, 'IN ($1)');
  s = rewriteCalls(s, 'to_char', (a) => {
    const [expr, fmt] = splitArgs(a);
    const f = FORMATS[fmt.replace(/'/g, '')];
    if (!f) throw new Error(`MySQL translation: unsupported to_char format ${fmt}`);
    return `DATE_FORMAT(${expr}, '${f}')`;
  });
  s = rewriteCalls(s, 'date_trunc', (a) => {
    const [unit, expr] = splitArgs(a);
    if (unit.replace(/'/g, '') !== 'month') throw new Error('MySQL translation: date_trunc supports month only');
    return `CAST(DATE_FORMAT(${expr}, '%Y-%m-01') AS DATE)`;
  });
  s = rewriteCalls(s, 'string_agg', (a) => {
    const [expr, rest] = splitArgs(a);
    const m = /^('(?:[^']|'')*')\s*(ORDER BY .*)?$/is.exec(rest);
    return `GROUP_CONCAT(${expr}${m[2] ? ` ${m[2]}` : ''} SEPARATOR ${m[1]})`;
  });
  s = s.replace(/\bjson_object_agg\s*\(/gi, 'JSON_OBJECTAGG(');
  s = s.replace(/\bjson_build_object\s*\(/gi, 'JSON_OBJECT(');
  // ON CONFLICT
  s = s.replace(/\bON\s+CONFLICT\s*(\([^)]*\))?\s*DO\s+UPDATE\s+SET\b/gi, 'ON DUPLICATE KEY UPDATE');
  s = s.replace(/\bEXCLUDED\.(\w+)/gi, 'VALUES($1)');
  if (/\bON\s+CONFLICT\b[^;]*\bDO\s+NOTHING/i.test(s)) {
    s = s.replace(/\bON\s+CONFLICT\s*(\([^)]*\))?\s*DO\s+NOTHING/gi, '').replace(/\bINSERT\s+INTO\b/i, 'INSERT IGNORE INTO');
  }
  return s;
}

// $n → ? with the parameters reordered/duplicated to match; arrays stay arrays (mysql2 expands them as a list)
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function bindParams(s, params = []) {
  const out = [];
  const lits = literalRanges(s);
  const sql = s.replace(/\$(\d+)/g, (m, n, at) => {
    if (inLiteral(lits, at)) return m;
    let v = params[Number(n) - 1];
    if (Array.isArray(v) && v.length === 0) v = [null]; // IN (NULL) matches nothing
    // ISO 8601 timestamps ('2026-09-08T15:00:00Z', '…+01:00') → UTC 'YYYY-MM-DD HH:MM:SS.mmm', as DATETIME expects
    if (typeof v === 'string' && ISO_TS.test(v) && !Number.isNaN(Date.parse(v))) v = new Date(v);
    if (v instanceof Date) v = v.toISOString().slice(0, 23).replace('T', ' ');
    else if (v !== null && typeof v === 'object' && !Array.isArray(v)) v = JSON.stringify(v);
    out.push(v === undefined ? null : v);
    return '?';
  });
  return { sql, values: out };
}

// ---------- RETURNING emulation ----------

const RETURNING = /\s+RETURNING\s+([\s\S]+?)\s*;?\s*$/i;

async function runOne(conn, text, params) {
  const t = cache.get(text) ?? cacheSet(text, translate(text));
  const ret = RETURNING.exec(t);
  if (!ret) {
    const { sql, values } = bindParams(t, params);
    const [res] = await run(conn, sql, values);
    return Array.isArray(res) ? { rows: res, rowCount: res.length } : { rows: [], rowCount: res.affectedRows, insertId: res.insertId };
  }
  const body = t.slice(0, ret.index);
  const cols = ret[1];
  let m;
  if ((m = /^\s*INSERT\s+(?:IGNORE\s+)?INTO\s+(\w+)/i.exec(body))) {
    const table = m[1];
    const { sql, values } = bindParams(body, params);
    const [res] = await run(conn, sql, values);
    if (!res.affectedRows) return { rows: [], rowCount: 0 };
    // ON DUPLICATE KEY UPDATE that updated a row: affectedRows = 2 and insertId = the existing id only with LAST_INSERT_ID(id)
    if (/ON DUPLICATE KEY UPDATE/i.test(body) && !res.insertId) throw new Error('MySQL translation: upsert RETURNING needs id = LAST_INSERT_ID(id)');
    const n = /ON DUPLICATE KEY UPDATE/i.test(body) ? 1 : res.affectedRows;
    const [rows] = await run(conn, `SELECT ${cols} FROM ${table} WHERE id BETWEEN ? AND ? ORDER BY id`, [res.insertId, res.insertId + n - 1]);
    return { rows, rowCount: rows.length };
  }
  if ((m = /^\s*UPDATE\s+(\w+)(\s+\w+)?\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i.exec(body))) {
    const [, table, alias = '', , where] = m;
    // Lock and remember the matching ids first: the update may change the columns the WHERE tests
    const whereSql = `WHERE ${where}`;
    const ids = (await runSelect(conn, `SELECT ${alias.trim() || table}.id FROM ${table}${alias} ${whereSql} FOR UPDATE`, params)).map((r) => r.id);
    if (!ids.length) return { rows: [], rowCount: 0 };
    const { sql, values } = bindParams(body, params);
    await run(conn, sql, values);
    const [rows] = await run(conn, `SELECT ${cols} FROM ${table}${alias} WHERE ${alias.trim() || table}.id IN (?) ORDER BY ${alias.trim() || table}.id`, [ids]);
    return { rows, rowCount: rows.length };
  }
  if ((m = /^\s*DELETE\s+FROM\s+(\w+)\s+(WHERE\s+[\s\S]+)$/i.exec(body))) {
    const [, table, whereSql] = m;
    const rows = await runSelect(conn, `SELECT ${cols} FROM ${table} ${whereSql}`, params);
    const { sql, values } = bindParams(body, params);
    const [res] = await run(conn, sql, values);
    return { rows, rowCount: res.affectedRows };
  }
  throw new Error(`MySQL translation: unsupported RETURNING statement: ${text.slice(0, 80)}`);
}

// Runs a SELECT built from the WHERE part of the original statement: its $n refer to the same parameters
async function runSelect(conn, select, params) {
  const { sql, values } = bindParams(select, params);
  const [rows] = await run(conn, sql, values);
  return rows;
}

const cache = new Map();
const cacheSet = (k, v) => { if (cache.size > 2000) cache.clear(); cache.set(k, v); return v; };

// ---------- errors: MySQL errno → PostgreSQL SQLSTATE, so errorHandler and the services stay unchanged ----------

const ERRNO = { 1062: '23505', 1451: '23503', 1452: '23503', 1048: '23502', 1364: '23502', 3819: '23514', 1265: '22P02', 1366: '22P02', 1292: '22P02', 1411: '22P02', 1264: '22003', 1213: '40P01', 1205: '55P03' };
function asPgError(e) {
  if (!e.errno || !ERRNO[e.errno]) return e;
  const err = new Error(e.sqlMessage ?? e.message);
  err.code = ERRNO[e.errno];
  err.mysqlCode = e.code;
  const key = /for key '(?:(\w+)\.)?(\w+)'/.exec(e.sqlMessage ?? '');
  const col = /column '(\w+)'/i.exec(e.sqlMessage ?? '');
  const chk = /Check constraint '(\w+)'/i.exec(e.sqlMessage ?? '');
  const fk = /CONSTRAINT `(\w+)`/.exec(e.sqlMessage ?? '');
  // Same names as PostgreSQL's default ones for single-column keys: students_matricule_key
  err.constraint = (key && (key[1] ? `${key[1]}_${key[2]}_key` : key[2])) ?? chk?.[1] ?? fk?.[1];
  err.column = col?.[1];
  const dup = /Duplicate entry '(.*)' for key/.exec(e.sqlMessage ?? '');
  if (err.code === '23505') err.detail = key && dup ? `Key (${key[2]})=(${dup[1]}) already exists.` : e.sqlMessage;
  if (err.code === '23503') err.detail = 'The record is referenced by, or references, another record';
  return err;
}

// ---------- pool ----------

/**
 * Results typed like node-postgres returns them:
 * - BOOLEAN columns (TINYINT(1)) → true/false (boolean expressions and BIGINT ids: see run())
 */
function typeCast(field, next) {
  if (field.type === 'TINY' && field.length === 1) { const v = field.string(); return v === null ? null : v === '1'; }
  return next();
}

// The rest needs the full column metadata (orgTable), which typeCast doesn't get: fixed on the rows after the query
const T_LONG = 3, T_LONGLONG = 8;
async function run(conn, sql, values) {
  const [res, fields] = await conn.query(sql, values);
  if (!Array.isArray(res) || !fields?.length) return [res, fields];
  const fix = [];
  for (const f of fields) {
    const expr = !f.orgTable;
    if ((f.columnType === T_LONG || f.columnType === T_LONGLONG) && f.columnLength === 1 && expr) fix.push([f.name, (v) => v === null ? null : Number(v) === 1]);
    // BIGSERIAL ids (auth_events.id) come back as strings from pg (int8 can exceed 2^53)
    else if (f.columnType === T_LONGLONG && f.orgName === 'id') fix.push([f.name, (v) => v === null ? null : String(v)]);
  }
  if (fix.length) for (const r of res) for (const [k, fn] of fix) r[k] = fn(r[k]);
  return [res, fields];
}

export function createPool(url) {
  const raw = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    timezone: 'Z',
    dateStrings: ['DATE'],
    decimalNumbers: false,
    supportBigNumbers: true,
    multipleStatements: false,
    // BOOLEAN is TINYINT(1): return true/false like PostgreSQL
    typeCast,
  });
  raw.on('connection', (c) => { c.query(`SET SESSION sql_mode = '${SQL_MODE}', time_zone = '+00:00'`); });

  const wrap = (conn) => ({
    async query(text, params) {
      if (/^\s*(BEGIN|START TRANSACTION)\s*;?\s*$/i.test(text)) { await conn.query('START TRANSACTION'); return { rows: [], rowCount: 0 }; }
      try { return await runOne(conn, text, params); } catch (e) { throw asPgError(e); }
    },
    release: () => conn.release?.(),
  });

  return {
    dialect: 'mysql',
    query: async (text, params) => {
      const conn = await raw.getConnection();
      try { return await wrap(conn).query(text, params); } finally { conn.release(); }
    },
    connect: async () => wrap(await raw.getConnection()),
    end: () => raw.end(),
    raw,
  };
}
