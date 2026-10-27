import { crudRouter } from '../crud.js';

export default crudRouter({
  table: 'teachers',
  fields: ['first_name', 'last_name', 'email', 'phone', 'specialty', 'hire_date'],
  required: ['first_name', 'last_name', 'email'],
  orderBy: 'last_name, first_name',
});
