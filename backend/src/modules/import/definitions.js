/**
 * What can be imported from Excel, entity by entity.
 * Column: { key, label, aliases?, type?, required? (to create), match? (identifies the record, column must exist), values? (enum) }
 * Labels are the ones the app uses on screen and in its exports, so an exported list can be edited and imported back.
 * `save(client, data, ctx)` writes one row and returns 'created' | 'updated' | 'unchanged'; it throws RowError on a bad row.
 */

export class RowError extends Error {
  constructor(column, message) { super(message); this.column = column; }
}

const GENDERS = [
  { value: 'M', label: 'Male', aliases: ['Masculin', 'H', 'Homme', 'Garcon', 'Boy', 'Man'] },
  { value: 'F', label: 'Female', aliases: ['Féminin', 'Femme', 'Fille', 'Girl', 'Woman'] },
];
const STUDENT_STATUSES = [
  { value: 'active', label: 'Active', aliases: ['Actif', 'Active'] },
  { value: 'graduated', label: 'Graduated', aliases: ['Diplômé'] },
  { value: 'transferred', label: 'Transferred', aliases: ['Transféré'] },
  { value: 'expelled', label: 'Expelled', aliases: ['Exclu', 'Renvoyé'] },
];
const TEACHER_STATUSES = [
  { value: 'active', label: 'Active', aliases: ['Actif'] },
  { value: 'on_leave', label: 'On leave', aliases: ['En congé', 'Congé'] },
  { value: 'left', label: 'Left', aliases: ['Parti', 'Départ'] },
];
const CONTRACTS = [
  { value: 'permanent', label: 'Permanent', aliases: ['CDI', 'Titulaire'] },
  { value: 'part_time', label: 'Part-time', aliases: ['Temps partiel', 'Vacataire'] },
  { value: 'temporary', label: 'Temporary', aliases: ['CDD', 'Temporaire', 'Contractuel'] },
];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v }));
const RELATIONS = [
  { value: 'father', label: 'Father', aliases: ['Père', 'Pere'] },
  { value: 'mother', label: 'Mother', aliases: ['Mère', 'Mere'] },
  { value: 'guardian', label: 'Guardian', aliases: ['Tuteur', 'Tutrice'] },
  { value: 'other', label: 'Other', aliases: ['Autre'] },
];
const CATEGORIES = [
  { value: 'uniform', label: 'Uniforms', aliases: ['Uniform', 'Uniforme', 'Tenue'] },
  { value: 'books', label: 'Books', aliases: ['Livres', 'Manuels'] },
  { value: 'supplies', label: 'School supplies', aliases: ['Supplies', 'Fournitures'] },
  { value: 'documents', label: 'Documents' },
  { value: 'services', label: 'Services & fees', aliases: ['Services', 'Frais'] },
  { value: 'other', label: 'Other', aliases: ['Autre'] },
];

// Columns shared by several entities
const lastName = { key: 'last_name', label: 'Last name', aliases: ['Nom', 'Nom de famille', 'Surname'], required: true, max: 100 };
const firstName = { key: 'first_name', label: 'First name', aliases: ['Prénom', 'Prenom', 'Prénoms'], required: true, max: 100 };
const gender = { key: 'gender', label: 'Gender', aliases: ['Sexe', 'Genre'], type: 'enum', values: GENDERS };
const birthDate = { key: 'birth_date', label: 'Birth date', aliases: ['Date de naissance', 'Né le', 'Date of birth', 'DOB'], type: 'date' };
const phone = { key: 'phone', label: 'Phone', aliases: ['Téléphone', 'Tel', 'Tél', 'Mobile', 'Contact'], max: 30 };
const email = { key: 'email', label: 'Email', aliases: ['E-mail', 'Courriel', 'Mail'], type: 'email' };
const address = { key: 'address', label: 'Address', aliases: ['Adresse', 'Domicile', 'Quartier'] };
const academicYear = { key: 'academic_year', label: 'Academic year', aliases: ['Année scolaire', 'Annee', 'Year'], match: true,
  note: 'e.g. 2026-2027. Empty = the current year' };
const teacherRef = (key, label, aliases) => ({ key, label, aliases, note: 'Teacher email, employee number or full name' });

// ---------- Helpers ----------

const defined = (data) => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

function checkRequired(columns, data) {
  const missing = columns.find((c) => c.required && data[c.key] === undefined);
  if (missing) throw new RowError(missing.label, `${missing.label} is required for a new record`);
}

/**
 * Updates the record found by `where` with the filled cells, or inserts it.
 * IS DISTINCT FROM skips the write (and counts "unchanged") when nothing differs.
 */
async function upsert(client, table, where, data, columns) {
  const keys = Object.keys(where);
  const cond = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
  const { rows: [found] } = await client.query(`SELECT id FROM ${table} WHERE ${cond} FOR UPDATE`, Object.values(where));
  const fields = defined(data);
  for (const k of keys) delete fields[k];
  const cols = Object.keys(fields);

  if (found) {
    if (!cols.length) return { id: found.id, result: 'unchanged' };
    const set = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const diff = cols.map((c, i) => `${c} IS DISTINCT FROM $${i + 2}`).join(' OR ');
    const { rowCount } = await client.query(`UPDATE ${table} SET ${set} WHERE id = $1 AND (${diff})`, [found.id, ...Object.values(fields)]);
    return { id: found.id, result: rowCount ? 'updated' : 'unchanged' };
  }
  checkRequired(columns, { ...where, ...fields });
  const all = { ...where, ...fields };
  const names = Object.keys(all);
  const { rows: [created] } = await client.query(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(all));
  return { id: created.id, result: 'created' };
}

async function studentId(client, matricule, column) {
  const { rows: [s] } = await client.query('SELECT id FROM students WHERE upper(matricule) = upper($1)', [matricule]);
  if (!s) throw new RowError(column, `no student with matricule ${matricule}`);
  return s.id;
}

// A teacher is found by email, employee number, or full name (as the app exports it) when that name is unique
async function teacherId(client, ref, column) {
  if (ref === undefined) return undefined;
  const { rows } = await client.query(`
    SELECT id FROM teachers WHERE lower(email) = lower($1) OR upper(employee_number) = upper($1)
    UNION SELECT id FROM teachers WHERE lower(first_name || ' ' || last_name) = lower($1) OR lower(last_name || ' ' || first_name) = lower($1)
    LIMIT 2`, [ref]);
  if (!rows.length) throw new RowError(column, `no teacher with email, employee number or name ${ref}`);
  if (rows.length > 1) throw new RowError(column, `several teachers match ${ref}: use the email`);
  return rows[0].id;
}

async function classRow(client, name, year, column, lock = false) {
  const { rows: [c] } = await client.query(
    `SELECT * FROM classes WHERE lower(name) = lower($1) AND academic_year = $2${lock ? ' FOR UPDATE' : ''}`, [name, year]);
  if (!c) throw new RowError(column, `no class ${name} in ${year}`);
  return c;
}

const yearOf = (data, ctx) => {
  const year = data.academic_year ?? ctx.currentYear;
  if (!year) throw new RowError('Academic year', 'is required (no current academic year is set)');
  return year;
};

// ---------- Entities ----------

const studentColumns = [
  { key: 'matricule', label: 'Matricule', aliases: ['Matricule élève', 'Student ID', 'N° matricule', 'Numero'], required: true, match: true, max: 20, upper: true },
  lastName, firstName, gender, birthDate,
  { key: 'birth_place', label: 'Birth place', aliases: ['Lieu de naissance', 'Né à', 'Place of birth'], max: 100 },
  { key: 'nationality', label: 'Nationality', aliases: ['Nationalité'], max: 60 },
  phone, email, address,
  { key: 'emergency_contact_name', label: 'Emergency contact', aliases: ["Contact d'urgence", 'Personne à prévenir'], max: 150 },
  { key: 'emergency_contact_phone', label: 'Emergency phone', aliases: ["Téléphone d'urgence"], max: 30 },
  { key: 'status', label: 'Status', aliases: ['Statut'], type: 'enum', values: STUDENT_STATUSES },
  { key: 'admission_date', label: 'Admission date', aliases: ["Date d'admission", "Date d'entrée"], type: 'date' },
  { key: 'previous_school', label: 'Previous school', aliases: ['École précédente', 'Établissement précédent'], max: 150 },
  { key: 'blood_group', label: 'Blood group', aliases: ['Groupe sanguin'], type: 'enum', values: BLOOD_GROUPS },
  { key: 'allergies', label: 'Allergies' },
  { key: 'medical_notes', label: 'Medical notes', aliases: ['Notes médicales', 'Santé'] },
  { key: 'photo_url', label: 'Photo URL', aliases: ['Photo'] },
];

const teacherColumns = [
  { ...email, required: true, match: true },
  { key: 'employee_number', label: 'Employee no.', aliases: ['Employee number', 'Matricule', 'N° employé'], max: 20, upper: true },
  lastName, firstName, gender, birthDate, phone, address,
  { key: 'specialty', label: 'Specialty', aliases: ['Spécialité', 'Matière', 'Discipline'], max: 100 },
  { key: 'status', label: 'Status', aliases: ['Statut'], type: 'enum', values: TEACHER_STATUSES },
  { key: 'contract_type', label: 'Contract', aliases: ['Contrat', 'Type de contrat', 'Contract type'], type: 'enum', values: CONTRACTS },
  { key: 'hire_date', label: 'Hire date', aliases: ["Date d'embauche", 'Date de recrutement'], type: 'date' },
  { key: 'qualifications', label: 'Qualifications / diplomas', aliases: ['Qualifications', 'Diplômes'] },
  { key: 'salary', label: 'Monthly salary', aliases: ['Salary', 'Salaire', 'Salaire mensuel'], type: 'number', min: 0 },
  { key: 'hourly_rate', label: 'Hourly rate', aliases: ['Taux horaire'], type: 'number', min: 0 },
  { key: 'bank_account', label: 'Bank account', aliases: ['Compte bancaire', 'RIB'], max: 50 },
  { key: 'photo_url', label: 'Photo URL', aliases: ['Photo'] },
];

const courseColumns = [
  { key: 'code', label: 'Code', aliases: ['Code matière', 'Course code'], required: true, match: true, max: 20, upper: true },
  { key: 'name', label: 'Name', aliases: ['Nom', 'Matière', 'Intitulé', 'Course'], required: true, max: 100 },
  { key: 'coefficient', label: 'Coefficient', aliases: ['Coef', 'Coeff'], type: 'number', min: 0.01 },
  { key: 'hours_per_week', label: 'Hours/week', aliases: ['Hours per week', 'Heures par semaine', 'Volume horaire', 'Heures'], type: 'int', min: 1 },
  { key: 'description', label: 'Description' },
];

const classColumns = [
  { key: 'name', label: 'Name', aliases: ['Classe', 'Class', 'Nom', 'Nom de la classe'], required: true, match: true, max: 50 },
  academicYear,
  { key: 'level', label: 'Level', aliases: ['Niveau', 'Cycle'], required: true, max: 50 },
  { key: 'capacity', label: 'Capacity', aliases: ['Capacité', 'Effectif max', 'Places'], type: 'int', min: 1 },
  { key: 'tuition_fee', label: 'Tuition (FCFA)', aliases: ['Tuition', 'Tuition fee', 'Scolarité', 'Frais de scolarité'], type: 'int', min: 0 },
  teacherRef('homeroom_teacher', 'Homeroom teacher', ['Professeur principal', 'Titulaire']),
];

const classCourseColumns = [
  { key: 'class_name', label: 'Class', aliases: ['Classe', 'Class name'], required: true, match: true },
  academicYear,
  { key: 'course_code', label: 'Course code', aliases: ['Code matière', 'Code', 'Course'], required: true, match: true },
  teacherRef('teacher', 'Teacher', ['Enseignant', 'Professeur']),
];

const itemColumns = [
  { key: 'code', label: 'Code', aliases: ['Référence', 'Ref', 'SKU', 'Item code'], required: true, match: true, upper: true },
  { key: 'name', label: 'Name', aliases: ['Nom', 'Article', 'Désignation', 'Item'], required: true },
  { key: 'category', label: 'Category', aliases: ['Catégorie', 'Type'], type: 'enum', values: CATEGORIES, required: true },
  { key: 'price', label: 'Price (FCFA)', aliases: ['Price', 'Prix', 'Prix unitaire', 'Unit price'], type: 'int', min: 0, required: true },
  { key: 'stock', label: 'Stock', aliases: ['Quantité', 'Quantité en stock', 'Qty'], type: 'int', min: 0, note: 'Empty = not tracked (services, fees)' },
  { key: 'is_active', label: 'Active', aliases: ['Status', 'Statut', 'Actif', 'En vente', 'On sale'], type: 'bool' },
  { key: 'description', label: 'Description' },
];

const guardianColumns = [
  { key: 'matricule', label: 'Student matricule', aliases: ['Matricule', 'Matricule élève'], required: true, match: true },
  { ...lastName, label: 'Guardian last name', aliases: ['Nom du parent', 'Nom du tuteur', 'Last name', 'Nom'] },
  { ...firstName, required: false, label: 'Guardian first name', aliases: ['Prénom du parent', 'Prénom du tuteur', 'First name', 'Prénom'] },
  { ...phone, label: 'Guardian phone', aliases: ['Téléphone du parent', 'Phone', 'Téléphone', 'Tel'] },
  { ...email, label: 'Guardian email', aliases: ['Email du parent', 'Email', 'E-mail'] },
  { key: 'profession', label: 'Profession', aliases: ['Métier', 'Occupation'], max: 100 },
  { ...address, label: 'Guardian address', aliases: ['Adresse du parent', 'Address', 'Adresse'] },
  { key: 'relation', label: 'Relation', aliases: ['Lien', 'Lien de parenté', 'Relationship'], type: 'enum', values: RELATIONS },
  { key: 'is_primary', label: 'Primary contact', aliases: ['Principal', 'Contact principal', 'Primary'], type: 'bool' },
];

const registrationColumns = [
  { key: 'matricule', label: 'Matricule', aliases: ['Student matricule', 'Matricule élève'], required: true, match: true },
  { key: 'class_name', label: 'Class', aliases: ['Classe', 'Class name'], required: true, match: true },
  academicYear,
];

export const DEFINITIONS = {
  students: {
    label: 'Students', matchedBy: 'matricule', columns: studentColumns,
    example: { matricule: 'ELV-2026-001', last_name: 'Mbarga', first_name: 'Aline', gender: 'Female', birth_date: new Date(Date.UTC(2014, 2, 12)), phone: '+237 690 00 00 00', status: 'Active' },
    save: async (client, data) => (await upsert(client, 'students', { matricule: data.matricule }, data, studentColumns)).result,
  },
  guardians: {
    label: 'Parents / guardians', matchedBy: 'student matricule and guardian name or phone', columns: guardianColumns,
    example: { matricule: 'ELV-2026-001', last_name: 'Mbarga', first_name: 'Paul', phone: '+237 677 00 00 00', relation: 'Father', is_primary: 'Yes' },
    async save(client, data) {
      const student = await studentId(client, data.matricule, 'Student matricule');
      // Same guardian = already linked to this student with the same name or phone, else anyone with that phone (siblings)
      const { rows: [linked] } = await client.query(`
        SELECT g.id FROM guardians g JOIN student_guardians sg ON sg.guardian_id = g.id AND sg.student_id = $1
        WHERE ($2::text IS NOT NULL AND g.phone = $2) OR (lower(g.last_name) = lower($3) AND lower(coalesce(g.first_name, '')) = lower(coalesce($4, '')))
        LIMIT 1`, [student, data.phone ?? null, data.last_name, data.first_name ?? null]);
      let guardian = linked?.id;
      if (!guardian && data.phone) {
        guardian = (await client.query('SELECT id FROM guardians WHERE phone = $1 ORDER BY id LIMIT 1', [data.phone])).rows[0]?.id;
      }
      const fields = defined({ last_name: data.last_name, first_name: data.first_name, phone: data.phone, email: data.email, profession: data.profession, address: data.address });
      let result = 'unchanged';
      if (guardian) {
        const cols = Object.keys(fields);
        if (cols.length) {
          const { rowCount } = await client.query(
          `UPDATE guardians SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 AND (${cols.map((c, i) => `${c} IS DISTINCT FROM $${i + 2}`).join(' OR ')})`,
          [guardian, ...Object.values(fields)]);
          if (rowCount) result = 'updated';
        }
      } else {
        guardian = (await client.query(
          `INSERT INTO guardians (${Object.keys(fields).join(', ')}) VALUES (${Object.keys(fields).map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
          Object.values(fields))).rows[0].id;
        result = 'created';
      }
      // At most one primary guardian per student: demote the current one first
      if (data.is_primary) {
        await client.query('UPDATE student_guardians SET is_primary = false WHERE student_id = $1 AND guardian_id <> $2 AND is_primary', [student, guardian]);
      }
      const { rows: [link] } = await client.query(
        'SELECT relation, is_primary FROM student_guardians WHERE student_id = $1 AND guardian_id = $2 FOR UPDATE', [student, guardian]);
      const relation = data.relation ?? link?.relation ?? 'guardian';
      const isPrimary = data.is_primary ?? link?.is_primary ?? false;
      if (!link) {
        await client.query('INSERT INTO student_guardians (student_id, guardian_id, relation, is_primary) VALUES ($1, $2, $3, $4)', [student, guardian, relation, isPrimary]);
        if (result === 'unchanged') result = 'created';
      } else if (link.relation !== relation || link.is_primary !== isPrimary) {
        await client.query('UPDATE student_guardians SET relation = $3, is_primary = $4 WHERE student_id = $1 AND guardian_id = $2', [student, guardian, relation, isPrimary]);
        if (result === 'unchanged') result = 'updated';
      }
      return result;
    },
  },
  teachers: {
    label: 'Teachers', matchedBy: 'email', columns: teacherColumns,
    example: { email: 'j.essomba@school.cm', employee_number: 'ENS-014', last_name: 'Essomba', first_name: 'Jean', gender: 'Male', specialty: 'Mathematics', contract_type: 'Permanent', hire_date: new Date(Date.UTC(2022, 8, 1)) },
    save: async (client, data) => (await upsert(client, 'teachers', { email: data.email }, data, teacherColumns)).result,
  },
  courses: {
    label: 'Courses', matchedBy: 'code', columns: courseColumns,
    example: { code: 'MATH', name: 'Mathematics', coefficient: 4, hours_per_week: 5 },
    save: async (client, data) => (await upsert(client, 'courses', { code: data.code }, data, courseColumns)).result,
  },
  classes: {
    label: 'Classes', matchedBy: 'name and academic year', columns: classColumns,
    example: { name: '6e A', academic_year: '2026-2027', level: '6e', capacity: 45, tuition_fee: 85000 },
    async save(client, data, ctx) {
      const year = yearOf(data, ctx);
      const { rows: [same] } = await client.query('SELECT name FROM classes WHERE lower(name) = lower($1) AND academic_year = $2', [data.name, year]);
      const { homeroom_teacher, ...fields } = data;
      fields.homeroom_teacher_id = await teacherId(client, homeroom_teacher, 'Homeroom teacher');
      const { id, result } = await upsert(client, 'classes', { name: same?.name ?? data.name, academic_year: year }, fields, classColumns);
      // Same rule as the Classes page: a new fee also applies to registrations with no payment and no plan yet
      if (result === 'updated' && data.tuition_fee !== undefined) {
        const { rows } = await client.query(`
          UPDATE registrations r SET tuition_fee = $2
          WHERE r.class_id = $1 AND r.tuition_fee <> $2
            AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.registration_id = r.id AND p.voided_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM instalment_plans ip WHERE ip.registration_id = r.id)
          RETURNING r.id`, [id, data.tuition_fee]);
        for (const r of rows) await ctx.syncStatus(client, r.id);
      }
      return result;
    },
  },
  'class-courses': {
    label: 'Courses taught per class', matchedBy: 'class, academic year and course code', columns: classCourseColumns,
    example: { class_name: '6e A', academic_year: '2026-2027', course_code: 'MATH', teacher: 'j.essomba@school.cm' },
    async save(client, data, ctx) {
      const cls = await classRow(client, data.class_name, yearOf(data, ctx), 'Class');
      const { rows: [course] } = await client.query('SELECT id FROM courses WHERE upper(code) = upper($1)', [data.course_code]);
      if (!course) throw new RowError('Course code', `no course with code ${data.course_code}`);
      const teacher = await teacherId(client, data.teacher, 'Teacher');
      const { rows: [row] } = await client.query('SELECT teacher_id FROM class_courses WHERE class_id = $1 AND course_id = $2 FOR UPDATE', [cls.id, course.id]);
      if (!row) {
        await client.query('INSERT INTO class_courses (class_id, course_id, teacher_id) VALUES ($1, $2, $3)', [cls.id, course.id, teacher ?? null]);
        return 'created';
      }
      if (teacher == null || row.teacher_id === teacher) return 'unchanged';
      await client.query('UPDATE class_courses SET teacher_id = $3 WHERE class_id = $1 AND course_id = $2', [cls.id, course.id, teacher]);
      return 'updated';
    },
  },
  items: {
    label: 'Items for sale', matchedBy: 'code', columns: itemColumns,
    example: { code: 'UNI-SHIRT-M', name: 'School shirt (M)', category: 'Uniforms', price: 3500, stock: 120, is_active: 'Yes' },
    save: async (client, data) => (await upsert(client, 'items', { code: data.code }, data, itemColumns)).result,
  },
  registrations: {
    label: 'Registrations', matchedBy: 'student matricule and academic year', columns: registrationColumns,
    example: { matricule: 'ELV-2026-001', class_name: '6e A', academic_year: '2026-2027' },
    // Same rules as a registration made on screen: one class per year, capacity, fee copied from the class
    async save(client, data, ctx) {
      const student = await studentId(client, data.matricule, 'Matricule');
      const cls = await classRow(client, data.class_name, yearOf(data, ctx), 'Class', true);
      const { rows: [already] } = await client.query(`
        SELECT r.class_id, c.name FROM registrations r JOIN classes c ON c.id = r.class_id
        WHERE r.student_id = $1 AND r.academic_year = $2`, [student, cls.academic_year]);
      if (already) {
        if (already.class_id === cls.id) return 'unchanged';
        throw new RowError('Class', `already registered in ${already.name} for ${cls.academic_year} (change it on the Registrations page)`);
      }
      const { rows: [{ count }] } = await client.query(
        "SELECT count(*)::int FROM registrations WHERE class_id = $1 AND status <> 'cancelled'", [cls.id]);
      if (count >= cls.capacity) throw new RowError('Class', `${cls.name} is full (${cls.capacity} places)`);
      const { rows: [reg] } = await client.query(
        'INSERT INTO registrations (student_id, class_id, academic_year, tuition_fee) VALUES ($1, $2, $3, $4) RETURNING id',
        [student, cls.id, cls.academic_year, cls.tuition_fee]);
      await ctx.syncStatus(client, reg.id);
      return 'created';
    },
  },
};
