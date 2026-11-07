import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { pool, isMySQL } from './pool.js';

// Each engine has its own schema files: migrations/*.sql (PostgreSQL) or migrations/mysql/*.sql (MySQL 8)
const base = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const dir = isMySQL ? path.join(base, 'mysql') : base;

/**
 * PostgreSQL: each file runs in a transaction (DDL is transactional there).
 * MySQL: DDL commits implicitly, so a file runs as one multi-statement batch on its own connection;
 * a failure leaves it unrecorded, to be fixed and re-run.
 */
async function apply(file, sql) {
  if (isMySQL) {
    const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });
    try { await conn.query(sql); } finally { await conn.end(); }
    await pool.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Runs each .sql file once, in name order, tracked in schema_migrations
async function migrate() {
  await pool.query(isMySQL
    ? 'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, run_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3))'
    : 'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, run_at TIMESTAMPTZ DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  for (const file of (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    await apply(file, await fs.readFile(path.join(dir, file), 'utf8'));
    console.log(`applied ${file}`);
  }
  await pool.end();
}

migrate().catch(e => { console.error(e); process.exit(1); });
