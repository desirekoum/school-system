/**
 * Fills the database with realistic sample data for a Central African secondary school
 * (French-speaking system: 6e → Terminale, salaries in FCFA, local names, cities and phone formats).
 *
 *   npm run populate              # refuses if data already exists
 *   npm run populate -- --reset   # wipes all tables first
 *
 * Also creates the academic year (3 trimesters × 2 exams), a full year of grades, and the finances:
 * tuition fee per class, payments (cash, mobile money, transfers, cheques) and instalment plans.
 * Uses a seeded random generator, so every run produces the same data set
 * (payments dated after today are simply not recorded yet).
 */
import { pool } from './pool.js';
import { splitInTrimesters } from '../modules/academic-years/academic-years.service.js';

const RESET = process.argv.includes('--reset');

// ---------- Seeded PRNG (mulberry32): reproducible "random" data ----------
let seed = 20262027;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
// Weighted pick: [[value, weight], ...]
const weighted = (pairs) => {
  let r = rand() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[0][0];
};
// Normal distribution (Box-Muller) for realistic grade spreads
const normal = (mean, sd) => mean + sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const randomDate = (fromYear, toYear) => isoDate(int(fromYear, toYear), int(1, 12), int(1, 28));
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

// ---------- Reference data by country ----------
// Phone formats follow each country's mobile numbering plan.
const COUNTRIES = {
  CM: {
    name: 'Camerounaise', weight: 55,
    cities: ['Yaoundé', 'Douala', 'Bafoussam', 'Garoua', 'Bamenda', 'Ngaoundéré', 'Bertoua', 'Ebolowa', 'Kribi', 'Maroua', 'Dschang', 'Nkongsamba'],
    phone: () => `+237 6${pick(['5', '7', '8', '9'])}${int(0, 9)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
    lastNames: ['Mbarga', 'Atangana', 'Essomba', 'Nkoulou', 'Ngono', 'Abena', 'Fotso', 'Kamga', 'Tchoupo', 'Nana', 'Tchinda', 'Djoumessi',
      'Mvondo', 'Owona', 'Biya', 'Eto\'o', 'Manga', 'Ndongo', 'Onana', 'Zambo', 'Ekotto', 'Ngando', 'Ebanda', 'Moukoko', 'Kotto', 'Tagne',
      'Nguimfack', 'Wamba', 'Simo', 'Talla', 'Kenfack', 'Tchakounté', 'Fopa', 'Nzeyimana', 'Bello', 'Hamadou', 'Oumarou', 'Aboubakar', 'Bouba'],
    streets: ['Quartier Bastos', 'Mvog-Ada', 'Biyem-Assi', 'Akwa', 'Bonamoussadi', 'Deïdo', 'Ngoa-Ekellé', 'Essos', 'Nkolbisson', 'Makepe', 'Logpom', 'Tsinga'],
  },
  GA: {
    name: 'Gabonaise', weight: 15,
    cities: ['Libreville', 'Port-Gentil', 'Franceville', 'Oyem', 'Moanda', 'Lambaréné', 'Mouila'],
    phone: () => `+241 0${pick(['6', '7'])} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
    lastNames: ['Ondo', 'Mba', 'Nzé', 'Obame', 'Ndong', 'Nguema', 'Mintsa', 'Ella', 'Moussavou', 'Mouketou', 'Boussougou', 'Mabika', 'Ngoua', 'Oyane'],
    streets: ['Louis', 'Glass', 'Nzeng-Ayong', 'Akébé', 'Owendo', 'Lalala', 'Batterie IV', 'Sotega'],
  },
  CG: {
    name: 'Congolaise', weight: 15,
    cities: ['Brazzaville', 'Pointe-Noire', 'Dolisie', 'Nkayi', 'Owando', 'Ouesso'],
    phone: () => `+242 0${pick(['4', '5', '6'])} ${int(100, 999)} ${int(10, 99)} ${int(10, 99)}`,
    lastNames: ['Mabiala', 'Ngoma', 'Loemba', 'Kibangou', 'Massamba', 'Mavoungou', 'Nkounkou', 'Makosso', 'Malonga', 'Bouanga', 'Okemba', 'Ibara', 'Ngouabi'],
    streets: ['Bacongo', 'Poto-Poto', 'Moungali', 'Ouenzé', 'Talangaï', 'Makélékélé', 'Tié-Tié', 'Lumumba'],
  },
  CF: {
    name: 'Centrafricaine', weight: 7,
    cities: ['Bangui', 'Bimbo', 'Berbérati', 'Bambari', 'Bouar'],
    phone: () => `+236 7${int(0, 7)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
    lastNames: ['Yakété', 'Ngaïkoïsset', 'Kossi', 'Gbado', 'Nzapayeké', 'Ndoubabé', 'Zanga', 'Yangongo', 'Gbazi', 'Mbolo'],
    streets: ['Boy-Rabe', 'Lakouanga', 'Fatima', 'Galabadja', 'Ngaragba'],
  },
  TD: {
    name: 'Tchadienne', weight: 5,
    cities: ['N\'Djamena', 'Moundou', 'Sarh', 'Abéché'],
    phone: () => `+235 6${int(0, 9)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
    lastNames: ['Mahamat', 'Abakar', 'Haroun', 'Idriss', 'Saleh', 'Adoum', 'Brahim', 'Djibrine', 'Nadjingar', 'Ngarlejy'],
    streets: ['Moursal', 'Chagoua', 'Farcha', 'Klemat', 'Paris-Congo'],
  },
  GQ: {
    name: 'Équato-guinéenne', weight: 3,
    cities: ['Malabo', 'Bata', 'Ebebiyín'],
    phone: () => `+240 222 ${int(100, 999)} ${int(100, 999)}`,
    lastNames: ['Obiang', 'Nsue', 'Mangue', 'Esono', 'Ondo', 'Mba'],
    streets: ['Ela Nguema', 'Los Ángeles', 'Caracolas', 'Semu'],
  },
};
const COUNTRY_PAIRS = Object.entries(COUNTRIES).map(([code, c]) => [code, c.weight]);

const FIRST_NAMES = {
  M: ['Jean-Pierre', 'Brice', 'Ghislain', 'Rodrigue', 'Junior', 'Dieudonné', 'Christian', 'Arnaud', 'Patrick', 'Serge', 'Hervé', 'Landry',
    'Franck', 'Yannick', 'Cédric', 'Stéphane', 'Boris', 'Wilfried', 'Steve', 'Joël', 'Emmanuel', 'Samuel', 'Daniel', 'Paul', 'Thierry',
    'Moussa', 'Hamadou', 'Oumarou', 'Ibrahim', 'Abdoulaye', 'Issa', 'Rodrigue', 'Kevin', 'Loïc', 'Ulrich', 'Aristide', 'Fabrice', 'Martial'],
  F: ['Marie-Claire', 'Armelle', 'Grâce', 'Prisca', 'Merveille', 'Nadège', 'Sandrine', 'Christelle', 'Larissa', 'Murielle', 'Josiane',
    'Carine', 'Brenda', 'Laure', 'Estelle', 'Danielle', 'Rachel', 'Ornella', 'Michelle', 'Gisèle', 'Viviane', 'Sylvie', 'Patricia',
    'Aïssatou', 'Fadimatou', 'Hadja', 'Mariam', 'Ramatou', 'Zénabou', 'Clarisse', 'Chancelle', 'Exaucée', 'Bénédicte', 'Raïssa', 'Linda'],
};

const LEVELS = ['6e', '5e', '4e', '3e', '2nde', '1ère', 'Tle'];
const SECTIONS = ['A', 'B', 'C'];
const ACADEMIC_YEAR = '2026-2027';
const START_YEAR = 2026;
// Yearly tuition in FCFA, higher in exam classes (3e: BEPC, Tle: Baccalauréat)
const TUITION = { '6e': 120000, '5e': 125000, '4e': 135000, '3e': 150000, '2nde': 165000, '1ère': 180000, 'Tle': 200000 };
const CASHIERS = ['Mme Ngo Bassa (Économat)', 'M. Ndzi Paul (Caisse)', 'Mme Abessolo Rose (Économat)'];

// [code, name, coefficient, hours/week, levels it applies to (null = all), teacher specialty]
const COURSES = [
  ['MATH', 'Mathématiques', 4, 5, null, 'Mathématiques'],
  ['FR', 'Français', 4, 5, null, 'Lettres modernes'],
  ['ANG', 'Anglais', 3, 4, null, 'Anglais'],
  ['HG', 'Histoire-Géographie', 2, 3, null, 'Histoire-Géographie'],
  ['ECM', 'Éducation civique et morale', 1, 1, null, 'Histoire-Géographie'],
  ['SVT', 'Sciences de la vie et de la terre', 3, 3, null, 'SVT'],
  ['PC', 'Physique-Chimie', 3, 3, ['4e', '3e', '2nde', '1ère', 'Tle'], 'Physique-Chimie'],
  ['ESP', 'Espagnol', 2, 2, ['4e', '3e', '2nde', '1ère', 'Tle'], 'Langues'],
  ['ALL', 'Allemand', 2, 2, ['4e', '3e', '2nde', '1ère', 'Tle'], 'Langues'],
  ['INFO', 'Informatique', 2, 2, null, 'Informatique'],
  ['PHILO', 'Philosophie', 3, 4, ['1ère', 'Tle'], 'Philosophie'],
  ['EPS', 'Éducation physique et sportive', 1, 2, null, 'EPS'],
  ['ESF', 'Économie sociale et familiale', 1, 1, ['6e', '5e'], 'Économie'],
  ['LCN', 'Langues et cultures nationales', 1, 2, ['6e', '5e', '4e', '3e'], 'Langues'],
];

const PREVIOUS_SCHOOLS = ['École publique de Mvog-Mbi', 'École catholique Sainte-Anne', 'Groupe scolaire Les Lauréats', 'École primaire de Nkol-Eton',
  'Collège Vogt', 'Collège Libermann', 'Lycée Léon Mba', 'École Saint-Joseph', 'École publique de Poto-Poto', 'Complexe scolaire La Gaieté'];
const PROFESSIONS = {
  M: ['Commerçant', 'Enseignant', 'Fonctionnaire', 'Agriculteur', 'Infirmier', 'Chauffeur', 'Comptable', 'Ingénieur', 'Mécanicien',
    'Médecin', 'Policier', 'Banquier', 'Entrepreneur', 'Pasteur', 'Militaire', 'Transporteur', 'Menuisier'],
  F: ['Commerçante', 'Enseignante', 'Fonctionnaire', 'Agricultrice', 'Infirmière', 'Comptable', 'Couturière', 'Médecin', 'Banquière',
    'Entrepreneure', 'Ménagère', 'Coiffeuse', 'Sage-femme', 'Secrétaire', 'Vendeuse au marché'],
};
const ALLERGIES = ['Arachides', 'Pénicilline', 'Poussière', 'Fruits de mer', 'Lait', 'Piqûres d\'insectes'];
const MEDICAL = ['Drépanocytose (suivi régulier)', 'Asthme léger', 'Paludisme récurrent', 'Porte des lunettes', 'Épilepsie (traitement en cours)'];
const QUALIFICATIONS = ['Licence', 'Master', 'DIPES I (ENS)', 'DIPES II (ENS)', 'CAPES', 'Doctorat'];

// Blood group distribution roughly matching sub-Saharan populations
const BLOOD = [['O+', 47], ['A+', 23], ['B+', 20], ['AB+', 4], ['O-', 3], ['A-', 1.5], ['B-', 1], ['AB-', 0.5]];

// ---------- Generators ----------
function person(gender = pick(['M', 'F'])) {
  const countryCode = weighted(COUNTRY_PAIRS);
  const c = COUNTRIES[countryCode];
  return {
    gender,
    first_name: pick(FIRST_NAMES[gender]),
    last_name: pick(c.lastNames),
    country: c,
    city: pick(c.cities),
    phone: c.phone(),
  };
}
const address = (p) => `${pick(p.country.streets)}, ${p.city}`;

/** Multi-row INSERT in chunks (one round-trip per chunk instead of one per row). */
async function insertMany(client, table, rows, returning = 'id') {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values = [];
    const tuples = chunk.map((r, ri) => `(${cols.map((c, ci) => { values.push(r[c]); return `$${ri * cols.length + ci + 1}`; }).join(',')})`);
    const { rows: res } = await client.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')}${returning ? ` RETURNING ${returning}` : ''}`, values);
    out.push(...res);
  }
  return out;
}

async function populate() {
  const client = await pool.connect();
  try {
    const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM students');
    if (n > 0 && !RESET) {
      console.error(`The database already has ${n} students. Run "npm run populate -- --reset" to wipe it and reseed.`);
      process.exitCode = 1;
      return;
    }

    await client.query('BEGIN');
    if (RESET) {
      // RESTART IDENTITY resets SERIAL counters; CASCADE empties dependent tables too
      await client.query(`TRUNCATE payments, instalments, instalment_plans, grades, exams, trimesters, registrations, class_courses, student_guardians, guardians,
                          classes, academic_years, courses, students, teachers RESTART IDENTITY CASCADE`);
    }

    // --- Teachers: enough to cover every course in every class ---
    const SPECIALTY_COUNT = { 'Mathématiques': 8, 'Lettres modernes': 8, 'Anglais': 6, 'Histoire-Géographie': 6, 'SVT': 5, 'Physique-Chimie': 5,
      'Langues': 5, 'Informatique': 3, 'Philosophie': 2, 'EPS': 3, 'Économie': 1 };
    const teacherRows = [];
    for (const [specialty, count] of Object.entries(SPECIALTY_COUNT)) {
      for (let i = 0; i < count; i++) {
        const p = person();
        const contract = weighted([['permanent', 60], ['part_time', 25], ['temporary', 15]]);
        const n = teacherRows.length + 1;
        teacherRows.push({
          employee_number: `ENS-${String(n).padStart(3, '0')}`,
          first_name: p.first_name,
          last_name: p.last_name,
          gender: p.gender,
          birth_date: randomDate(1965, 1997),
          email: `${slug(p.first_name)}.${slug(p.last_name)}${n}@lycee-excellence.cm`,
          phone: p.phone,
          address: address(p),
          specialty,
          qualifications: `${pick(QUALIFICATIONS)} en ${specialty}`,
          hire_date: randomDate(2005, 2025),
          contract_type: contract,
          // Monthly salary in FCFA; part-timers and temporaries are paid by the hour
          salary: contract === 'permanent' ? int(18, 45) * 10000 : null,
          hourly_rate: contract === 'permanent' ? null : int(5, 12) * 500,
          // First teacher of each specialty stays active so every course keeps a teacher
          status: i === 0 ? 'active' : weighted([['active', 92], ['on_leave', 5], ['left', 3]]),
          bank_account: chance(0.8) ? `CM21 ${int(10000, 99999)} ${int(10000, 99999)} ${int(10000000000, 99999999999)} ${int(10, 99)}` : null,
        });
      }
    }
    const teachers = (await insertMany(client, 'teachers', teacherRows, 'id, specialty, status'))
      .filter((t) => t.status === 'active');
    const bySpecialty = {};
    for (const t of teachers) (bySpecialty[t.specialty] ??= []).push(t);

    // --- Courses ---
    const courseRows = COURSES.map(([code, name, coefficient, hours_per_week]) => ({ code, name, coefficient, hours_per_week, description: `Programme officiel de ${name.toLowerCase()}.` }));
    const courseIds = (await insertMany(client, 'courses', courseRows)).map((r) => r.id);

    // --- Academic year: 3 trimesters × 2 exams (exam dates near the end of each half-trimester) ---
    const { rows: [year] } = await client.query(
      `INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ($1, $2, $3, true)
       ON CONFLICT (name) DO UPDATE SET is_current = true RETURNING id`,
      [ACADEMIC_YEAR, `${START_YEAR}-09-01`, `${START_YEAR + 1}-06-30`]);
    await client.query('UPDATE academic_years SET is_current = (id = $1)', [year.id]);
    await client.query('DELETE FROM trimesters WHERE academic_year_id = $1', [year.id]);
    const examIds = [];
    for (const t of splitInTrimesters(`${START_YEAR}-09-01`, `${START_YEAR + 1}-06-30`)) {
      const { rows: [tri] } = await client.query(
        'INSERT INTO trimesters (academic_year_id, number, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id',
        [year.id, t.number, t.start_date, t.end_date]);
      const mid = new Date((new Date(t.start_date).getTime() + new Date(t.end_date).getTime()) / 2);
      for (const [n, date] of [[1, new Date(mid.getTime() - 7 * 86400000)], [2, new Date(new Date(t.end_date).getTime() - 10 * 86400000)]]) {
        const { rows: [exam] } = await client.query(
          'INSERT INTO exams (trimester_id, number, exam_date) VALUES ($1, $2, $3) RETURNING id', [tri.id, n, date.toISOString().slice(0, 10)]);
        examIds.push(exam.id);
      }
    }

    // --- Classes: 7 levels × 3 sections, large classes as is common in the region ---
    const classRows = [];
    for (const level of LEVELS) {
      for (const section of SECTIONS) {
        classRows.push({ name: `${level} ${section}`, level, academic_year: ACADEMIC_YEAR, capacity: int(10, 12) * 5, tuition_fee: TUITION[level] });
      }
    }
    const classes = await insertMany(client, 'classes', classRows, 'id, level, capacity, tuition_fee');

    // --- Class ↔ course assignments, spreading each specialty's teachers across classes ---
    const cursor = {};
    const nextTeacher = (specialty) => {
      const list = bySpecialty[specialty] ?? [];
      if (!list.length) return null;
      cursor[specialty] = ((cursor[specialty] ?? -1) + 1) % list.length;
      return list[cursor[specialty]].id;
    };
    const ccRows = [];
    for (const cls of classes) {
      COURSES.forEach(([, , , , levels, specialty], i) => {
        if (levels && !levels.includes(cls.level)) return;
        ccRows.push({ class_id: cls.id, course_id: courseIds[i], teacher_id: nextTeacher(specialty) });
      });
    }
    await insertMany(client, 'class_courses', ccRows, null);

    // Homeroom teacher per class (distinct teachers)
    const homerooms = [...teachers].sort(() => rand() - 0.5);
    for (const [i, cls] of classes.entries()) {
      await client.query('UPDATE classes SET homeroom_teacher_id = $1 WHERE id = $2', [homerooms[i % homerooms.length].id, cls.id]);
    }

    // --- Families: shared guardians so siblings are linked to the same parents ---
    const studentRows = [];
    const families = []; // per student: index of the family
    const familyList = [];
    let matricule = 1;
    for (const [ci, cls] of classes.entries()) {
      const levelIndex = LEVELS.indexOf(cls.level);
      const fill = int(Math.round(cls.capacity * 0.75), cls.capacity); // 75–100% full
      for (let s = 0; s < fill; s++) {
        // 25% of students join an existing family (sibling)
        const sibling = familyList.length && chance(0.25);
        const family = sibling ? pick(familyList) : null;
        const p = person();
        const lastName = family ? family.lastName : p.last_name;
        const fam = family ?? { lastName, country: p.country, city: p.city, address: address(p), idx: familyList.length };
        if (!family) familyList.push(fam);
        // Typical age: 11 in 6e, +1 per level, with some repeating a year
        const firstName = pick(FIRST_NAMES[p.gender]);
        const age = 11 + levelIndex + (chance(0.2) ? 1 : 0) + (chance(0.05) ? 1 : 0);
        studentRows.push({
          matricule: `${String(START_YEAR).slice(2)}${fam.country === COUNTRIES.CM ? 'CM' : 'ET'}${String(matricule++).padStart(4, '0')}`,
          first_name: firstName,
          last_name: lastName,
          gender: p.gender,
          birth_date: isoDate(START_YEAR - age, int(1, 12), int(1, 28)),
          birth_place: chance(0.8) ? fam.city : pick(fam.country.cities),
          nationality: fam.country.name,
          email: chance(0.3) ? `${slug(firstName)}.${slug(lastName)}${matricule}@gmail.com` : null,
          phone: levelIndex >= 3 && chance(0.5) ? fam.country.phone() : null,
          address: fam.address,
          blood_group: chance(0.85) ? weighted(BLOOD) : null,
          allergies: chance(0.08) ? pick(ALLERGIES) : null,
          medical_notes: chance(0.06) ? pick(MEDICAL) : null,
          previous_school: chance(0.7) ? pick(PREVIOUS_SCHOOLS) : null,
          admission_date: isoDate(START_YEAR - int(0, levelIndex), 9, int(1, 15)),
          status: 'active',
          emergency_contact_name: chance(0.6) ? `${pick(FIRST_NAMES[pick(['M', 'F'])])} ${pick(fam.country.lastNames)}` : null,
          emergency_contact_phone: null,
          _class: ci,
        });
        families.push(fam.idx);
      }
    }
    for (const s of studentRows) if (s.emergency_contact_name) s.emergency_contact_phone = COUNTRIES.CM.phone();
    const classOf = studentRows.map((s) => s._class);
    studentRows.forEach((s) => delete s._class);
    const studentIds = (await insertMany(client, 'students', studentRows)).map((r) => r.id);

    // Guardians: father and/or mother (or a tutor) per family
    const guardianRows = [];
    const familyGuardians = familyList.map((fam) => {
      const list = [];
      const add = (gender, relation) => {
        const p = person(gender);
        guardianRows.push({
          first_name: p.first_name,
          last_name: relation === 'mother' ? p.last_name : fam.lastName,
          phone: fam.country.phone(),
          email: chance(0.35) ? `${slug(p.first_name)}.${slug(fam.lastName)}${guardianRows.length}@yahoo.fr` : null,
          profession: pick(PROFESSIONS[p.gender]),
          address: fam.address,
        });
        list.push({ idx: guardianRows.length - 1, relation });
      };
      const shape = weighted([['both', 55], ['father', 18], ['mother', 20], ['tutor', 7]]);
      if (shape === 'both' || shape === 'father') add('M', 'father');
      if (shape === 'both' || shape === 'mother') add('F', 'mother');
      if (shape === 'tutor') add(pick(['M', 'F']), 'guardian');
      return list;
    });
    const guardianIds = (await insertMany(client, 'guardians', guardianRows)).map((r) => r.id);

    const sgRows = [];
    studentIds.forEach((sid, i) => {
      familyGuardians[families[i]].forEach((g, gi) => {
        sgRows.push({ student_id: sid, guardian_id: guardianIds[g.idx], relation: g.relation, is_primary: gi === 0 });
      });
    });
    await insertMany(client, 'student_guardians', sgRows, null);

    // --- Registrations: one per student in their class; the class fee is copied onto it ---
    const regRows = studentIds.map((sid, i) => ({
      student_id: sid,
      class_id: classes[classOf[i]].id,
      academic_year: ACADEMIC_YEAR,
      tuition_fee: classes[classOf[i]].tuition_fee,
      status: chance(0.02) ? 'cancelled' : 'pending', // confirmed below once fully paid
      registered_at: `${START_YEAR}-${pick(['07', '08', '09'])}-${String(int(1, 28)).padStart(2, '0')}T${String(int(8, 16)).padStart(2, '0')}:00:00Z`,
    }));

    // --- Finances: who paid what, when, how ---
    const today = new Date().toISOString().slice(0, 10);
    const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
    const method = () => weighted([['cash', 40], ['mobile_money', 42], ['bank_transfer', 13], ['cheque', 5]]);
    const reference = (m) => ({
      cash: null,
      mobile_money: `${pick(['OM', 'MOMO', 'AIRTEL'])}-${int(1000000000, 9999999999)}`,
      bank_transfer: `VIR-${int(100000, 999999)}`,
      cheque: `CHQ ${int(1000000, 9999999)}`,
    })[m];
    const due = [`${START_YEAR}-09-15`, `${START_YEAR + 1}-01-15`, `${START_YEAR + 1}-04-15`];
    const payRows = [];  // { reg, amount, paid_at, ... }
    const planOf = [];   // per registration: null | { status, instalments }
    const pay = (reg, amount, date, extra = {}) => {
      if (amount <= 0 || date > today) return 0; // not paid yet
      const m = method();
      payRows.push({ reg, amount, method: m, reference: reference(m), paid_at: date, received_by: pick(CASHIERS), ...extra });
      return amount;
    };
    regRows.forEach((r, i) => {
      planOf[i] = null;
      if (r.status === 'cancelled') return;
      const fee = r.tuition_fee;
      const day0 = addDays(r.registered_at.slice(0, 10), int(0, 10));
      const round = (x) => Math.round(x / 500) * 500;
      const scenario = weighted([['full', 45], ['plan', 35], ['requested', 5], ['partial', 10], ['none', 5]]);
      if (scenario === 'full') {
        if (chance(0.15)) { const first = round(fee * 0.5); pay(i, first, day0); pay(i, fee - first, addDays(day0, int(15, 45))); }
        else pay(i, fee, day0);
        if (chance(0.03)) pay(i, round(fee * 0.2), day0, { voided_at: `${day0}T17:00:00Z`, void_reason: 'Erreur de saisie (montant)' });
      } else if (scenario === 'plan' || scenario === 'requested') {
        const amounts = [round(fee * 0.4), round(fee * 0.3)];
        amounts.push(fee - amounts[0] - amounts[1]);
        planOf[i] = {
          status: scenario === 'plan' ? 'approved' : 'requested',
          reason: pick(['Difficultés financières passagères', 'Famille nombreuse', 'Revenus agricoles saisonniers', 'Parent fonctionnaire (salaire mensuel)', null]),
          instalments: amounts.map((amount, n) => ({ number: n + 1, due_date: due[n], amount })),
        };
        if (scenario === 'requested') { if (chance(0.5)) pay(i, round(fee * 0.2), day0); return; }
        const behaviour = weighted([['on_time', 70], ['late', 18], ['stopped', 12]]);
        amounts.forEach((amount, n) => {
          if (behaviour === 'stopped' && n > 0) return;
          const date = n === 0 ? day0 : addDays(due[n], behaviour === 'late' ? int(10, 40) : int(-12, 3));
          // "stopped" families paid only part of the first instalment
          pay(i, behaviour === 'stopped' ? round(amount * pick([0, 0.5, 0.75])) : amount, date);
        });
      } else if (scenario === 'partial') {
        pay(i, round(fee * (0.2 + rand() * 0.6)), day0);
      }
    });

    const paidOf = new Array(regRows.length).fill(0);
    for (const p of payRows) if (!p.voided_at) paidOf[p.reg] += p.amount;
    regRows.forEach((r, i) => { if (r.status !== 'cancelled' && paidOf[i] >= r.tuition_fee) r.status = 'confirmed'; });
    const regIds = (await insertMany(client, 'registrations', regRows)).map((r) => r.id);

    // Instalment plans and their schedules
    const planRegs = planOf.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    const planIds = (await insertMany(client, 'instalment_plans', planRegs.map((i) => ({
      registration_id: regIds[i], status: planOf[i].status, reason: planOf[i].reason,
      requested_at: regRows[i].registered_at, decided_at: planOf[i].status === 'approved' ? addDays(regRows[i].registered_at.slice(0, 10), int(1, 5)) : null,
    })))).map((r) => r.id);
    await insertMany(client, 'instalments', planRegs.flatMap((i, k) =>
      planOf[i].instalments.map((inst) => ({ plan_id: planIds[k], ...inst }))), null);

    // Payments in date order, so receipt numbers are chronological
    payRows.sort((a, b) => a.paid_at.localeCompare(b.paid_at));
    await insertMany(client, 'payments', payRows.map(({ reg, ...p }, n) => ({
      registration_id: regIds[reg],
      receipt_number: `REC-${p.paid_at.slice(0, 4)}-${String(n + 1).padStart(6, '0')}`,
      ...p,
      voided_at: p.voided_at ?? null,
      void_reason: p.void_reason ?? null,
    })), null);
    await client.query('SELECT setval($1, $2)', ['receipt_seq', payRows.length || 1]);

    // --- Grades on /20 for every exam of the year: each student has a base level,
    //     a strength/weakness per course, and some noise per exam ---
    const coursesByClass = {};
    for (const cc of ccRows) (coursesByClass[cc.class_id] ??= []).push(cc.course_id);
    const gradeRows = [];
    studentIds.forEach((sid, i) => {
      if (regRows[i].status === 'cancelled') return;
      const classId = regRows[i].class_id;
      const level = normal(11, 2.8);
      for (const courseId of coursesByClass[classId]) {
        const affinity = normal(0, 2);
        examIds.forEach((examId, e) => {
          const progress = (e - 2.5) * normal(0.15, 0.2); // some improve over the year, some decline
          const raw = level + affinity + progress + normal(0, 1.8);
          const score = Math.round(Math.min(20, Math.max(0, raw)) * 4) / 4; // quarter points
          gradeRows.push({ exam_id: examId, class_id: classId, course_id: courseId, student_id: sid, score });
        });
      }
    });
    await insertMany(client, 'grades', gradeRows, null);

    // A few former students (graduated / transferred) with no current registration
    const formerRows = Array.from({ length: 40 }, (_, i) => {
      const p = person();
      return {
        matricule: `${String(START_YEAR - 1).slice(2)}CM${String(9000 + i).padStart(4, '0')}`,
        first_name: p.first_name, last_name: p.last_name, gender: p.gender,
        birth_date: randomDate(START_YEAR - 20, START_YEAR - 17), birth_place: p.city, nationality: p.country.name,
        address: address(p), admission_date: isoDate(START_YEAR - int(4, 7), 9, int(1, 15)),
        status: weighted([['graduated', 70], ['transferred', 25], ['expelled', 5]]),
      };
    });
    await insertMany(client, 'students', formerRows, null);

    await client.query('COMMIT');
    console.log(`Done: ${teacherRows.length} teachers, ${courseRows.length} courses, ${classes.length} classes, ` +
      `${studentRows.length + formerRows.length} students, ${guardianRows.length} guardians, ${regRows.length} registrations, ${gradeRows.length} grades, ` +
      `${planIds.length} instalment plans, ${payRows.length} payments.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

populate().catch((e) => { console.error(e); process.exit(1); });
