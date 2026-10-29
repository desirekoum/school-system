/**
 * Role-based access control (RBAC): a role is a named set of permissions.
 * Permissions are checked on the server for every request; the frontend only uses them to hide what you can't do.
 * Defined in code (not in the database) so every change goes through review and version control.
 */
export const PERMISSIONS = {
  'students:read': 'View students and guardians',
  'students:write': 'Create and edit students and guardians',
  'staff:read': 'View teachers (including salary data)',
  'staff:write': 'Create and edit teachers',
  'academics:read': 'View academic years, classes and courses',
  'academics:write': 'Manage academic years, classes, courses and assignments',
  'registrations:read': 'View registrations',
  'registrations:write': 'Register students, change registration status',
  'grades:read': 'View grades, results and report cards',
  'grades:write': 'Enter grades (teachers: only their own courses)',
  'finance:read': 'View tuition accounts, payments and receipts',
  'payments:write': 'Record tuition payments',
  'payments:void': 'Void tuition payments',
  'plans:request': 'Request instalment plans',
  'plans:approve': 'Approve or reject instalment plans',
  'items:read': 'View the catalog of items for sale',
  'items:write': 'Manage the catalog and stock',
  'sales:read': 'View sales',
  'sales:write': 'Record sales',
  'sales:void': 'Void sales',
  'expenses:read': 'View expenses',
  'expenses:write': 'Record expenses and purchases',
  'expenses:void': 'Void expenses',
  'reports:read': 'View financial reports',
  'users:manage': 'Manage user accounts and roles',
};

export const ROLES = {
  admin: {
    label: 'System administrator',
    description: 'Super user: every permission, manages user accounts and roles.',
    permissions: ['*'],
  },
  principal: {
    label: 'Principal',
    description: 'Runs the school: oversees academics, approves instalment plans, reads all reports.',
    permissions: ['students:read', 'staff:read', 'academics:read', 'academics:write', 'registrations:read',
      'grades:read', 'finance:read', 'plans:approve', 'items:read', 'sales:read', 'expenses:read', 'reports:read'],
  },
  registrar: {
    label: 'Registrar',
    description: 'Admissions office: student records, guardians and registrations.',
    permissions: ['students:read', 'students:write', 'staff:read', 'academics:read', 'registrations:read',
      'registrations:write', 'grades:read', 'finance:read', 'plans:request'],
  },
  bursar: {
    label: 'Bursar',
    description: 'Finance manager: payments, plans, catalog, sales, expenses, voids and reports.',
    permissions: ['students:read', 'academics:read', 'registrations:read', 'finance:read', 'payments:write',
      'payments:void', 'plans:request', 'plans:approve', 'items:read', 'items:write', 'sales:read', 'sales:write',
      'sales:void', 'expenses:read', 'expenses:write', 'expenses:void', 'reports:read'],
  },
  cashier: {
    label: 'Cashier',
    description: 'Front desk: takes tuition payments and sells items. Cannot void or see reports.',
    permissions: ['students:read', 'academics:read', 'registrations:read', 'finance:read', 'payments:write',
      'items:read', 'sales:read', 'sales:write'],
  },
  teacher: {
    label: 'Teacher',
    description: 'Enters grades for the courses they teach; reads classes and results.',
    permissions: ['students:read', 'academics:read', 'grades:read', 'grades:write'],
  },
};

export const permissionsOf = (role) => {
  const perms = ROLES[role]?.permissions ?? [];
  return perms.includes('*') ? Object.keys(PERMISSIONS) : perms;
};

export const can = (user, perm) => !!user && (ROLES[user.role]?.permissions.includes('*') || permissionsOf(user.role).includes(perm));
