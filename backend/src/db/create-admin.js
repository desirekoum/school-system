/**
 * Creates (or resets) a system administrator account from the command line — the first account of a new install.
 *
 *   npm run create-admin -- <username> <email> ["Full name"]
 *
 * Prints a temporary password; the second factor is a code sent to the email address.
 */
import { pool } from './pool.js';
import { hashPassword, temporaryPassword } from '../modules/auth/crypto.js';

const [username, email, fullName = 'System Administrator'] = process.argv.slice(2);
if (!username || !email) {
  console.error('Usage: npm run create-admin -- <username> <email> ["Full name"]');
  process.exit(1);
}

const password = temporaryPassword();
try {
  // UPSERT: running it again for the same username resets that admin (lost password, locked account)
  await pool.query(`
    INSERT INTO users (username, full_name, email, role, mfa_method, password_hash, must_change_password)
    VALUES ($1, $2, $3, 'admin', 'email', $4, true)
    ON CONFLICT (username) DO UPDATE SET role = 'admin', email = EXCLUDED.email, mfa_method = 'email', is_active = true,
      password_hash = EXCLUDED.password_hash, must_change_password = true, failed_attempts = 0, locked_until = NULL`,
    [username.toLowerCase(), fullName, email, await hashPassword(password)]);
  await pool.query("INSERT INTO auth_events (username, event, detail) VALUES ($1, 'admin_created', 'command line')", [username.toLowerCase()]);
  console.log(`Administrator "${username.toLowerCase()}" ready. Temporary password: ${password}`);
  console.log('It must be changed at the first sign-in.');
} finally {
  await pool.end();
}
