import { ref, onMounted } from 'vue';

/**
 * Composable = reusable stateful logic (Composition API).
 * Wraps list/create/update/remove with loading + error state.
 */
export function useCrud(api) {
  const items = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function run(fn) {
    loading.value = true;
    error.value = '';
    try {
      return await fn();
    } catch (e) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  const load = () => run(async () => { items.value = await api.list(); });
  const save = (data) => run(() => (data.id ? api.update(data.id, data) : api.create(data))).then(load);
  const remove = (id) => run(() => api.remove(id)).then(load);

  onMounted(load);
  return { items, loading, error, load, save, remove };
}
