-- A registration is confirmed once the tuition is fully paid, OR once the first instalment
-- of an APPROVED instalment plan is paid. `confirmable` carries that rule for the whole app.
-- CREATE OR REPLACE VIEW can only add columns at the end, so fee/paid/balance stay first.
CREATE OR REPLACE VIEW registration_balances AS
SELECT r.id AS registration_id,
       r.tuition_fee AS fee,
       COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL), 0)::int AS paid,
       (r.tuition_fee - COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL), 0))::int AS balance,
       (COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL), 0) >= LEAST(r.tuition_fee, COALESCE((
          SELECT i.amount FROM instalment_plans ip JOIN instalments i ON i.plan_id = ip.id AND i.number = 1
          WHERE ip.registration_id = r.id AND ip.status = 'approved'), r.tuition_fee))) AS confirmable
FROM registrations r
LEFT JOIN payments p ON p.registration_id = r.id
GROUP BY r.id;

-- Apply the new rule to existing registrations
UPDATE registrations r
SET status = (CASE WHEN rb.confirmable THEN 'confirmed' ELSE 'pending' END)::registration_status
FROM registration_balances rb
WHERE rb.registration_id = r.id AND r.status <> 'cancelled';
