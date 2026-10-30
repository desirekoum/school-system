import { t } from '../i18n';

// Select options shared by forms and detail views (values match the DB enums/checks).
// `label` is a getter: it is translated each time it is read, so the lists follow a language switch.
export const translated = (group, values) => values.map((value) => ({ value, get label() { return t(`options.${group}.${value}`); } }));

export const GENDERS = translated('gender', ['M', 'F']);
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => ({ value: g, label: g }));
export const STUDENT_STATUSES = translated('studentStatus', ['active', 'graduated', 'transferred', 'expelled']);
export const TEACHER_STATUSES = translated('teacherStatus', ['active', 'on_leave', 'left']);
export const CONTRACT_TYPES = translated('contract', ['permanent', 'part_time', 'temporary']);
export const RELATIONS = translated('relation', ['father', 'mother', 'guardian', 'other']);
