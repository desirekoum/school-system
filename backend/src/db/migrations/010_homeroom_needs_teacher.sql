-- Like a teacher account, a homeroom teacher account must be linked to its teacher record
ALTER TABLE users ADD CONSTRAINT users_homeroom_teacher_check CHECK (role <> 'homeroom' OR teacher_id IS NOT NULL);
