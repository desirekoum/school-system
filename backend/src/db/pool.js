import pg from 'pg';
import 'dotenv/config';

// Keep DATE columns as 'YYYY-MM-DD' strings: parsing them as local midnight shifts them
// by a day once serialized to UTC JSON on a UTC+1 server (Central Africa time).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

// One shared connection pool for the whole app (reuses TCP connections)
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const query = (text, params) => pool.query(text, params);
