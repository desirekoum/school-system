import { crudRouter } from '../crud.js';

export default crudRouter({
  table: 'courses',
  fields: ['code', 'name', 'description', 'coefficient', 'hours_per_week'],
  required: ['code', 'name'],
  orderBy: 'name',
  searchColumns: ['code', 'name', 'description'],
});
