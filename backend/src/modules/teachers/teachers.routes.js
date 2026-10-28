import { crudRouter } from '../crud.js';

export default crudRouter({
  table: 'teachers',
  fields: [
    'employee_number', 'first_name', 'last_name', 'birth_date', 'gender', 'email', 'phone', 'address',
    'photo_url', 'specialty', 'qualifications', 'hire_date', 'contract_type', 'salary', 'hourly_rate',
    'status', 'bank_account',
  ],
  required: ['first_name', 'last_name', 'email'],
  orderBy: 'last_name, first_name',
});
