// Grading helpers shared by grade entry, class results and report cards (scores out of 20)
export const PASS_MARK = 10;

// French-system "mentions"
const MENTIONS = [
  [16, 'Très bien'],
  [14, 'Bien'],
  [12, 'Assez bien'],
  [10, 'Passable'],
  [0, 'Insuffisant'],
];
export const mention = (avg) => (avg == null ? '—' : MENTIONS.find(([min]) => avg >= min)[1]);

// CSS class for coloring a score: green from 10, red below, strong green from 14
export const scoreTone = (v) => (v == null ? '' : v >= 14 ? 'score-high' : v >= PASS_MARK ? 'score-pass' : 'score-fail');

export const fmt = (v) => (v == null || v === '' ? '—' : Number(v).toFixed(2));

export const examLabel = (trimester, number) => `T${trimester} · Exam ${number}`;

/** Flattens a year's trimesters into [{ id, trimester, number, label, exam_date }] in order. */
export const flattenExams = (year) =>
  (year?.trimesters ?? []).flatMap((t) => (t.exams ?? []).map((e) => ({ ...e, trimester: t.number, label: examLabel(t.number, e.number) })));

export const ordinal = (n) => (n == null ? '—' : n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
