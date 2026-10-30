// Weekdays use ISO numbers (1 = Monday), like the API
export const WEEKDAYS = [
  { value: 1, label: 'Monday', short: 'Mon' }, { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' }, { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' }, { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
];
export const dayName = (n) => WEEKDAYS.find((d) => d.value === n)?.label ?? '';

export const ATTENDANCE_STATUSES = [
  { value: 'present', label: 'Present', short: 'P' },
  { value: 'absent', label: 'Absent', short: 'A' },
  { value: 'late', label: 'Late', short: 'L' },
  { value: 'excused', label: 'Excused', short: 'E' },
];
export const statusLabel = (v) => ATTENDANCE_STATUSES.find((s) => s.value === v)?.label ?? v;

export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// 'YYYY-MM-DD' ± n days, computed in UTC so no time zone shifts the date
export const shiftDate = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// Attended = present or late; colors for rates
export const rateTone = (rate) => (rate == null ? 'neutral' : rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'danger');
