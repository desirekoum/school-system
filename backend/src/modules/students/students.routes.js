import { crudRouter } from '../crud.js';

export default crudRouter({
  table: 'students',
  fields: ['matricule', 'first_name', 'last_name', 'birth_date', 'gender', 'email', 'phone', 'address', 'guardian_name', 'guardian_phone'],
  required: ['matricule', 'first_name', 'last_name'],
  orderBy: 'last_name, first_name',
});
