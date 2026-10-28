// Select options shared by forms and detail views (values match the DB enums/checks)
const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));

export const GENDERS = opts([['M', 'Male'], ['F', 'Female']]);
export const BLOOD_GROUPS = opts(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => [g, g]));
export const STUDENT_STATUSES = opts([['active', 'Active'], ['graduated', 'Graduated'], ['transferred', 'Transferred'], ['expelled', 'Expelled']]);
export const TEACHER_STATUSES = opts([['active', 'Active'], ['on_leave', 'On leave'], ['left', 'Left']]);
export const CONTRACT_TYPES = opts([['permanent', 'Permanent'], ['part_time', 'Part-time'], ['temporary', 'Temporary']]);
export const RELATIONS = opts([['father', 'Father'], ['mother', 'Mother'], ['guardian', 'Guardian'], ['other', 'Other']]);
