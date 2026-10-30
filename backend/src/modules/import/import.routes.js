import express, { Router } from 'express';
import { pool } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { syncStatus } from '../finances/finances.service.js';
import { DEFINITIONS, RowError } from './definitions.js';
import { readSheet, mapHeaders, convert, buildTemplate } from './sheet.js';

/**
 * Excel imports. Permissions per entity are in the ACCESS table (middleware/auth.js).
 *  GET  /api/import/:entity/template     → .xlsx to fill
 *  POST /api/import/:entity?dry_run=1    → body = the .xlsx file; checks every row, saves nothing
 *  POST /api/import/:entity              → same checks, then saves (all rows or none)
 */
const router = Router();
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_LISTED_ERRORS = 200;

function definition(entity) {
  const def = DEFINITIONS[entity];
  if (!def) throw new HttpError(404, `Nothing to import for "${entity}"`);
  return def;
}

router.get('/:entity/template', async (req, res) => {
  const def = definition(req.params.entity);
  const buffer = await buildTemplate(def);
  res.set('Content-Type', XLSX);
  res.set('Content-Disposition', `attachment; filename="schooldoc-${req.params.entity}-template.xlsx"`);
  res.send(Buffer.from(buffer));
});

// Readable message for a database error on one row
function rowMessage(e) {
  if (e instanceof RowError || e instanceof HttpError) return e.message;
  if (e.code === '23505') return `already exists${e.detail ? ` (${e.detail.replace(/^Key /, '')})` : ''}`;
  if (e.code === '23503') return 'refers to a record that does not exist (check the academic year, class or teacher)';
  if (e.code === '23514') return `invalid value (${e.constraint})`;
  if (e.code === '22001') return 'a value is too long';
  if (e.code === '22P02' || e.code === '22003') return 'a value has the wrong format';
  throw e;   // unexpected: let the error handler log it and answer 500
}

// express.raw: the request body is the file itself (no multipart parsing needed)
router.post('/:entity', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  const def = definition(req.params.entity);
  const dryRun = ['1', 'true'].includes(String(req.query.dry_run));
  if (!req.body?.length) throw new HttpError(400, 'Send the Excel file as the request body');

  const { headers, rows } = await readSheet(req.body);
  const { mapping, ignored, missing } = mapHeaders(headers, def.columns);
  if (missing.length) throw new HttpError(400, `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  if (!rows.length) throw new HttpError(400, 'The sheet has no data rows');

  const counts = { created: 0, updated: 0, unchanged: 0 };
  const errors = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [current] } = await client.query('SELECT name FROM academic_years WHERE is_current');
    const ctx = { currentYear: current?.name, syncStatus };

    for (const { number, values } of rows) {
      // 1. Convert each cell to its type
      const data = {};
      let bad = false;
      mapping.forEach((col, i) => {
        if (!col) return;
        const { value, error } = convert(values[i], col);
        if (error) { errors.push({ row: number, column: col.label, message: `${col.label} ${error}` }); bad = true; }
        else data[col.key] = value;
      });
      if (bad) continue;
      const empty = def.columns.find((c) => c.match && c.required && data[c.key] === undefined);
      if (empty) { errors.push({ row: number, column: empty.label, message: `${empty.label} is empty` }); continue; }

      // 2. Save it; a savepoint undoes only this row when it fails, so the next rows are still checked
      await client.query('SAVEPOINT import_row');
      try {
        counts[await def.save(client, data, ctx)]++;
        await client.query('RELEASE SAVEPOINT import_row');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT import_row');
        const message = rowMessage(e);
        errors.push({ row: number, column: e.column ?? null, message });
      }
    }

    // All or nothing: one bad row and nothing is saved, so a file can simply be fixed and sent again
    const saved = !dryRun && !errors.length;
    await client.query(saved ? 'COMMIT' : 'ROLLBACK');
    res.json({
      entity: req.params.entity, dry_run: dryRun, saved, total: rows.length, ...counts,
      error_count: errors.length, errors: errors.slice(0, MAX_LISTED_ERRORS), ignored_columns: ignored,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});

export default router;
