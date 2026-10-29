/**
 * Fills the database with realistic sample data for a Central African secondary school
 * (French-speaking system: 6e → Terminale, salaries in FCFA, local names, cities and phone formats).
 *
 *   npm run populate              # refuses if data already exists
 *   npm run populate -- --reset   # wipes all tables first
 *
 * Also creates the academic year (3 trimesters × 2 exams), a full year of grades, and the finances:
 * tuition fee per class, payments (cash, mobile money, transfers, cheques), instalment plans,
 * the school shop (items, stock, sales to students) and the year's expenses,
 * and one demo account per role (see DEMO_PASSWORD below: change it before any real use).
 * Uses a seeded random generator, so every run produces the same data set
 * (payments dated after today are simply not recorded yet).
 */
import { pool } from './pool.js';
import { splitInTrimesters } from '../modules/academic-years/academic-years.service.js';
import { hashPassword } from '../modules/auth/crypto.js';

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
// School shop: [code, name, category, price, tracked stock?, active]
const ITEMS = [
  ['UNI-COMP', 'Uniforme complet (chemise + pantalon/jupe)', 'uniform', 15000, true, true],
  ['UNI-POLO', "Polo de l'établissement", 'uniform', 4500, true, true],
  ['UNI-SPORT', 'Tenue de sport', 'uniform', 6000, true, true],
  ['UNI-OLD', 'Ancien polo (modèle 2024)', 'uniform', 3000, true, false],
  ['DOC-CARTE', 'Carte scolaire', 'documents', 1500, false, true],
  ['DOC-CARNET', 'Carnet de correspondance', 'documents', 1000, true, true],
  ['BK-MATH', 'Manuel de mathématiques (collège)', 'books', 5500, true, true],
  ['BK-FR', 'Manuel de français (collège)', 'books', 5000, true, true],
  ['BK-ANG', 'English for Africa (collège)', 'books', 4800, true, true],
  ['BK-PC', 'Physique-Chimie (lycée)', 'books', 7500, true, true],
  ['BK-PHILO', 'Philosophie Terminale', 'books', 6500, true, true],
  ['SUP-CAH', 'Lot de 10 cahiers 200 pages', 'supplies', 3500, true, true],
  ['SUP-KIT', 'Kit de géométrie', 'supplies', 1500, true, true],
  ['SUP-BLOUSE', 'Blouse de laboratoire', 'supplies', 4000, true, true],
  ['SRV-ASSUR', 'Assurance scolaire', 'services', 2500, false, true],
  ['SRV-EXAM', "Frais d'examen blanc", 'services', 3000, false, true],
  ['SRV-PHOTO', "Photos d'identité (lot de 4)", 'services', 1000, false, true],
];
const SUPPLIERS = { uniform: 'Couture Moderne SARL', books: 'Librairie des Peuples Noirs', documents: 'Imprimerie Saint-Paul', supplies: 'Papeterie Le Bon Élève' };
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
      await client.query(`TRUNCATE auth_events, sessions, auth_challenges, users, sale_items, sales, expenses, items, payments, instalments, instalment_plans, grades, exams, trimesters, registrations, class_courses, student_guardians, guardians,
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
    // Confirmed once fully paid, or once the first instalment of an approved plan is paid
    regRows.forEach((r, i) => {
      const due = planOf[i]?.status === 'approved' ? planOf[i].instalments[0].amount : r.tuition_fee;
      if (r.status !== 'cancelled' && paidOf[i] >= due) r.status = 'confirmed';
    });
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

    // --- School shop: catalog, purchases (expenses that add stock), sales to students ---
    const itemRows = ITEMS.map(([code, name, category, price, tracked, is_active]) => ({ code, name, category, price, stock: tracked ? 0 : null, is_active }));
    const itemIds = (await insertMany(client, 'items', itemRows)).map((r) => r.id);
    const byCode = Object.fromEntries(ITEMS.map(([code], k) => [code, k]));
    const stock = itemRows.map((r) => r.stock);
    const expRows = [];
    const buy = (k, quantity, date) => {
      if (date > today) return;
      const [, name, category, price] = ITEMS[k];
      expRows.push({ category: 'stock', description: `Achat stock : ${name}`, supplier: SUPPLIERS[category] ?? 'Fournisseur divers',
        item: k, quantity, unit_price: Math.round(price * 0.65 / 50) * 50, spent_at: date, method: pick(['bank_transfer', 'cheque', 'cash']), approved_by: 'Le Principal' });
      if (stock[k] !== null) stock[k] += quantity;
    };
    // Main restock before the start of the year, a second one for uniforms in October
    const RESTOCK = { 'UNI-COMP': 380, 'UNI-POLO': 520, 'UNI-SPORT': 480, 'UNI-OLD': 40, 'DOC-CARNET': 900, 'BK-MATH': 260, 'BK-FR': 240,
      'BK-ANG': 230, 'BK-PC': 160, 'BK-PHILO': 70, 'SUP-CAH': 520, 'SUP-KIT': 300, 'SUP-BLOUSE': 120 };
    for (const [code, q] of Object.entries(RESTOCK)) buy(byCode[code], q, `${START_YEAR}-07-${String(int(2, 12)).padStart(2, '0')}`);
    for (const code of ['UNI-COMP', 'UNI-POLO', 'SUP-CAH']) buy(byCode[code], int(8, 14) * 10, `${START_YEAR}-10-${String(int(5, 12)).padStart(2, '0')}`);

    const saleRows = [];   // { student, buyer_name, sold_at, lines: [[k, qty]] }
    const sell = (student, buyer_name, date, wanted) => {
      if (date > today) return;
      const lines = [];
      for (const [k, q] of wanted) {
        if (!ITEMS[k][5]) continue;
        if (stock[k] !== null && stock[k] < q) continue; // out of stock: not sold
        if (stock[k] !== null) stock[k] -= q;
        lines.push([k, q]);
      }
      if (!lines.length) return;
      const m = method();
      saleRows.push({ student, buyer_name, sold_at: date, method: m, reference: reference(m), received_by: pick(CASHIERS), lines });
    };
    const ex = (code) => byCode[code];
    regRows.forEach((r, i) => {
      if (r.status === 'cancelled') return;
      const day0 = addDays(r.registered_at.slice(0, 10), int(0, 10));
      const levelIndex = LEVELS.indexOf(classes[classOf[i]].level);
      const first = [[ex('DOC-CARTE'), 1]];
      if (chance(0.85)) first.push([ex('SRV-ASSUR'), 1]);
      if (chance(0.7)) first.push([ex('DOC-CARNET'), 1]);
      if (chance(0.35)) first.push([ex('UNI-COMP'), 1]);
      if (chance(0.55)) first.push([ex('UNI-POLO'), int(1, 2)]);
      if (chance(0.4)) first.push([ex('UNI-SPORT'), 1]);
      sell(i, null, day0, first);
      const second = [];
      if (levelIndex <= 3 && chance(0.3)) second.push([ex(pick(['BK-MATH', 'BK-FR', 'BK-ANG'])), 1]);
      if (levelIndex >= 4 && chance(0.25)) second.push([ex('BK-PC'), 1]);
      if (levelIndex === 6 && chance(0.4)) second.push([ex('BK-PHILO'), 1]);
      if (chance(0.3)) second.push([ex('SUP-CAH'), int(1, 2)]);
      if (chance(0.2)) second.push([ex('SUP-KIT'), 1]);
      if (levelIndex >= 4 && chance(0.15)) second.push([ex('SUP-BLOUSE'), 1]);
      if (chance(0.15)) second.push([ex('SRV-PHOTO'), 1]);
      if (second.length) sell(i, null, addDays(day0, int(3, 40)), second);
      // Mock exams for the exam classes (3e: BEPC, Tle: Baccalauréat)
      if ((levelIndex === 3 || levelIndex === 6) && chance(0.8)) sell(i, null, `${START_YEAR}-10-${String(int(13, 24)).padStart(2, '0')}`, [[ex('SRV-EXAM'), 1]]);
    });
    for (let n = 0; n < 25; n++) {
      const p = person();
      sell(null, `${p.first_name} ${p.last_name} (parent)`, `${START_YEAR}-${pick(['08', '09', '10'])}-${String(int(1, 28)).padStart(2, '0')}`,
        [[ex(pick(['UNI-POLO', 'UNI-SPORT', 'SUP-CAH', 'UNI-COMP'])), int(1, 3)]]);
    }
    saleRows.sort((a, b) => a.sold_at.localeCompare(b.sold_at));
    const saleIds = (await insertMany(client, 'sales', saleRows.map((x, n) => ({
      receipt_number: `VNT-${x.sold_at.slice(0, 4)}-${String(n + 1).padStart(6, '0')}`,
      student_id: x.student === null ? null : studentIds[x.student], buyer_name: x.buyer_name, academic_year: ACADEMIC_YEAR,
      sold_at: x.sold_at, method: x.method, reference: x.reference, received_by: x.received_by,
    })))).map((r) => r.id);
    await insertMany(client, 'sale_items', saleRows.flatMap((x, n) =>
      x.lines.map(([k, quantity]) => ({ sale_id: saleIds[n], item_id: itemIds[k], quantity, unit_price: ITEMS[k][3] }))), null);
    await client.query('SELECT setval($1, $2)', ['sale_seq', saleRows.length || 1]);

    // --- Running costs of the year ---
    const monthsSoFar = [];
    for (let d = new Date(Date.UTC(START_YEAR, 6, 1)); d.toISOString().slice(0, 10) <= today && d.getUTCFullYear() <= START_YEAR + 1; d.setUTCMonth(d.getUTCMonth() + 1)) {
      monthsSoFar.push(d.toISOString().slice(0, 7));
    }
    const dd = (n) => String(n).padStart(2, '0');
    const spend = (category, description, supplier, quantity, unit_price, date, method = 'bank_transfer') => {
      if (date <= today) expRows.push({ category, description, supplier, item: null, quantity, unit_price, spent_at: date, method, approved_by: pick(['Le Principal', 'L\'Économe']) });
    };
    for (const m of monthsSoFar) {
      spend('utilities', `Électricité ${m}`, 'ENEO', 1, int(85, 140) * 1000, `${m}-${dd(int(5, 10))}`);
      spend('utilities', `Eau ${m}`, 'CAMWATER', 1, int(25, 45) * 1000, `${m}-${dd(int(5, 10))}`);
      spend('utilities', `Internet fibre ${m}`, 'CAMTEL', 1, 60000, `${m}-02`);
      spend('transport', `Carburant groupe électrogène ${m}`, 'Tradex', int(150, 260), 840, `${m}-${dd(int(12, 20))}`, 'cash');
      spend('supplies', `Craies, marqueurs et rames de papier ${m}`, 'Papeterie Le Bon Élève', 1, int(60, 120) * 1000, `${m}-${dd(int(1, 6))}`, 'cash');
    }
    spend('furniture', 'Tables-bancs pour les salles de 6e', 'Menuiserie Ebène', 40, 35000, `${START_YEAR}-08-05`);
    spend('furniture', 'Armoires métalliques (secrétariat)', 'Bureau Pro Douala', 3, 95000, `${START_YEAR}-08-12`);
    spend('equipment', 'Ordinateurs pour la salle informatique', 'Infotech Cameroun', 5, 350000, `${START_YEAR}-08-20`, 'cheque');
    spend('equipment', 'Vidéoprojecteur', 'Infotech Cameroun', 1, 280000, `${START_YEAR}-09-03`, 'cheque');
    spend('maintenance', 'Peinture des salles du bâtiment B', 'BTP Services', 1, 450000, `${START_YEAR}-07-22`);
    spend('maintenance', 'Réparation de la toiture (préau)', 'BTP Services', 1, 320000, `${START_YEAR}-10-02`);
    spend('maintenance', 'Plomberie des sanitaires', 'Plombier M. Atangana', 1, 85000, `${START_YEAR}-09-18`, 'cash');
    spend('events', 'Cérémonie de rentrée solennelle', 'Traiteur La Saveur', 1, 250000, `${START_YEAR}-09-12`);
    spend('events', 'Journée sportive inter-classes', 'Divers', 1, 180000, `${START_YEAR}-10-17`, 'cash');
    expRows.sort((a, b) => a.spent_at.localeCompare(b.spent_at));
    await insertMany(client, 'expenses', expRows.map(({ item, ...e }, n) => ({
      voucher_number: `DEP-${e.spent_at.slice(0, 4)}-${String(n + 1).padStart(6, '0')}`,
      academic_year: ACADEMIC_YEAR, item_id: item === null ? null : itemIds[item],
      reference: e.method === 'cash' ? null : e.method === 'cheque' ? `CHQ ${int(1000000, 9999999)}` : `VIR-${int(100000, 999999)}`,
      ...e,
    })), null);
    await client.query('SELECT setval($1, $2)', ['expense_seq', expRows.length || 1]);
    // Final stock = purchases − sales, computed above while simulating the year
    await client.query(`UPDATE items i SET stock = u.stock FROM unnest($1::int[], $2::int[]) AS u(id, stock) WHERE i.id = u.id`,
      [itemIds, stock.map((x) => x ?? null)]);

    // --- Demo accounts: one per role. Codes are printed in the API console until SMTP/SMS are configured ---
    const DEMO_PASSWORD = 'SchoolDoc2026';
    const hash = await hashPassword(DEMO_PASSWORD);
    const teacher = teachers.find((t) => ccRows.some((cc) => cc.teacher_id === t.id));
    const { rows: [tRow] } = await client.query('SELECT first_name, last_name, email FROM teachers WHERE id = $1', [teacher.id]);
    const userRows = [
      { username: 'admin', full_name: 'Administrateur Système', role: 'admin', email: 'admin@schooldoc.cm', mfa_method: 'email' },
      { username: 'principal', full_name: 'Dr Jeanne Mballa', role: 'principal', email: 'principal@schooldoc.cm', mfa_method: 'email' },
      { username: 'registrar', full_name: 'Paul Nkodo', role: 'registrar', email: 'scolarite@schooldoc.cm', mfa_method: 'email' },
      { username: 'bursar', full_name: 'Aïcha Bello', role: 'bursar', email: 'econome@schooldoc.cm', phone: '+237699000004', mfa_method: 'sms' },
      { username: 'cashier', full_name: 'Éric Fouda', role: 'cashier', phone: '+237677000005', mfa_method: 'sms' },
      { username: 'teacher', full_name: `${tRow.first_name} ${tRow.last_name}`, role: 'teacher', email: tRow.email, teacher_id: teacher.id, mfa_method: 'totp' },
    ].map((u) => ({ email: null, phone: null, teacher_id: null, ...u, password_hash: hash, must_change_password: false }));
    await insertMany(client, 'users', userRows, null);

    await client.query('COMMIT');
    console.log(`\nDemo accounts (password "${DEMO_PASSWORD}", second factor shown in the API console in development):`);
    for (const u of userRows) console.log(`  ${u.username.padEnd(10)} ${u.role.padEnd(10)} ${u.mfa_method}`);
    console.log(`\nDone: ${teacherRows.length} teachers, ${courseRows.length} courses, ${classes.length} classes, ` +
      `${studentRows.length + formerRows.length} students, ${guardianRows.length} guardians, ${regRows.length} registrations, ${gradeRows.length} grades, ` +
      `${planIds.length} instalment plans, ${payRows.length} payments, ${itemRows.length} items, ${saleRows.length} sales, ${expRows.length} expenses.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

populate().catch((e) => { console.error(e); process.exit(1); });
