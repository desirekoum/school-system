import { t } from '../i18n';

// Grading helpers shared by grade entry, class results and report cards (scores out of 20)
export const PASS_MARK = 10;

// French-system "mentions" (translated: "Très bien" = "Very good")
const MENTIONS = [[16, 'vg'], [14, 'g'], [12, 'fg'], [10, 'p'], [0, 'f']];
export const mention = (avg) => (avg == null ? '—' : t(`options.mention.${MENTIONS.find(([min]) => avg >= min)[1]}`));

// CSS class for coloring a score: green from 10, red below, strong green from 14
export const scoreTone = (v) => (v == null ? '' : v >= 14 ? 'score-high' : v >= PASS_MARK ? 'score-pass' : 'score-fail');

export const fmt = (v) => (v == null || v === '' ? '—' : Number(v).toFixed(2));

export const examLabel = (trimester, number) => t('grades.examLabel', { trimester, number });

/** Flattens a year's trimesters into [{ id, trimester, number, label, exam_date }] in order. */
export const flattenExams = (year) =>
  (year?.trimesters ?? []).flatMap((t) => (t.exams ?? []).map((e) => ({ ...e, trimester: t.number, label: examLabel(t.number, e.number) })));

// 1st 2nd 3rd 4th / 1er 2e 3e 4e
export const ordinal = (n) => (n == null ? '—' : t('grades.ordinal', { n, suffix: t(`grades.ordinalSuffix.${n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'few' : 'other'}`) }));
