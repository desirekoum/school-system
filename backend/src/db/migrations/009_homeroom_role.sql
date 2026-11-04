-- Homeroom teacher (professeur principal): a teacher account that can also print its own class's report cards.
-- Alone in its file: a new enum value can't be used in the transaction that adds it.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'homeroom';
