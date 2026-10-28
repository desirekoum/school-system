import { HttpError } from '../../middleware/errors.js';
import { tx, recordPayment, requestPlan, syncStatus } from '../finances/finances.service.js';

/**
 * Registers a student in a class inside a transaction.
 * SELECT ... FOR UPDATE locks the class row so two concurrent registrations
 * cannot both pass the capacity check (avoids a race condition).
 *
 * The class tuition fee is copied onto the registration. The registration stays "pending"
 * until the fee is fully paid; an optional first `payment` and instalment `plan` can be
 * recorded in the same transaction (all or nothing).
 */
export async function register({ student_id, class_id, payment, plan }) {
  if (!student_id || !class_id) throw new HttpError(400, 'Missing: student_id, class_id');
  try {
    return await tx(async (client) => {
      const { rows: [cls] } = await client.query('SELECT * FROM classes WHERE id = $1 FOR UPDATE', [class_id]);
      if (!cls) throw new HttpError(404, 'Class not found');

      const { rowCount: already } = await client.query(
        'SELECT 1 FROM registrations WHERE student_id = $1 AND academic_year = $2', [student_id, cls.academic_year]);
      if (already) throw new HttpError(409, 'Student already registered for this academic year');

      const { rows: [{ count }] } = await client.query(
        "SELECT count(*)::int FROM registrations WHERE class_id = $1 AND status <> 'cancelled'", [class_id]);
      if (count >= cls.capacity) throw new HttpError(409, 'Class is full');

      const { rows: [reg] } = await client.query(
        `INSERT INTO registrations (student_id, class_id, academic_year, tuition_fee)
         VALUES ($1, $2, $3, $4) RETURNING *`, [student_id, class_id, cls.academic_year, cls.tuition_fee]);

      if (plan?.instalments) await requestPlan(client, reg.id, plan);
      if (payment?.amount) await recordPayment(client, { ...payment, registration_id: reg.id });
      await syncStatus(client, reg.id); // a free class (fee 0) is confirmed right away
      const { rows: [saved] } = await client.query('SELECT * FROM registrations WHERE id = $1', [reg.id]);
      return saved;
    });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Student already registered for this academic year');
    throw e;
  }
}

/**
 * Status changes: cancelling is always allowed. Otherwise the status follows the payments
 * (confirmed = fully paid), so "confirmed" is refused while a balance remains.
 */
export async function setStatus(id, status) {
  return tx(async (client) => {
    const { rows: [reg] } = await client.query('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [id]);
    if (!reg) throw new HttpError(404, 'Not found');
    if (status === 'cancelled') {
      await client.query("UPDATE registrations SET status = 'cancelled' WHERE id = $1", [id]);
    } else {
      const { rows: [{ balance }] } = await client.query(
        'SELECT balance FROM registration_balances WHERE registration_id = $1', [id]);
      if (status === 'confirmed' && balance > 0) {
        throw new HttpError(409, `A registration is complete only once the tuition is paid: ${balance} FCFA remaining`);
      }
      if (status === 'pending' && balance <= 0) throw new HttpError(409, 'Tuition is fully paid: the registration is confirmed');
      await client.query('UPDATE registrations SET status = $2 WHERE id = $1', [id, status]);
    }
    const { rows: [saved] } = await client.query('SELECT * FROM registrations WHERE id = $1', [id]);
    return saved;
  });
}
