import { crudRouter } from '../crud.js';

export default crudRouter({
  table: 'guardians',
  fields: ['first_name', 'last_name', 'phone', 'email', 'profession', 'address'],
  required: ['last_name'],
  orderBy: 'last_name, first_name',
  searchColumns: ['first_name', 'last_name', 'phone', 'email'],
});
