import { t, fmtDate } from '../i18n';
import { translated } from './options';

// Weekdays use ISO numbers (1 = Monday), like the API
export const WEEKDAYS = translated('weekday', [1, 2, 3, 4, 5, 6, 7])
  .map((d) => Object.defineProperty(d, 'short', { get: () => t(`options.weekdayShort.${d.value}`) }));
export const dayName = (n) => WEEKDAYS.find((d) => d.value === n)?.label ?? '';

export const ATTENDANCE_STATUSES = translated('attendance', ['present', 'absent', 'late', 'excused'])
  .map((s) => Object.defineProperty(s, 'short', { get: () => t(`options.attendanceShort.${s.value}`) }));
export const statusLabel = (v) => ATTENDANCE_STATUSES.find((s) => s.value === v)?.label ?? v;

export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// 'YYYY-MM-DD' ± n days, computed in UTC so no time zone shifts the date
export const shiftDate = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const longDate = (iso) => fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });

// Attended = present or late; colors for rates
export const rateTone = (rate) => (rate == null ? 'neutral' : rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'danger');
