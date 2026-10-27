export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Maps PostgreSQL error codes to HTTP statuses
const PG_ERRORS = { '23505': [409, 'Already exists'], '23503': [409, 'Referenced record missing or in use'], '23514': [400, 'Invalid value'], '22P02': [400, 'Invalid input'] };

export function errorHandler(err, req, res, _next) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  const pgErr = PG_ERRORS[err.code];
  if (pgErr) return res.status(pgErr[0]).json({ error: pgErr[1], detail: err.detail });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
