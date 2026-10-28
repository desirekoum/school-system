import { ref, reactive, watch, onMounted } from 'vue';

export const PAGE_SIZES = [10, 25, 50, 100];
const STORAGE_KEY = 'schooldoc.pageSize';

// Remembered page size (per browser); storage can throw in private mode, so guard it
function storedPageSize() {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return PAGE_SIZES.includes(n) ? n : 50;
  } catch {
    return 50;
  }
}

/**
 * Server-side paginated list with search and filters.
 * `fetcher(params)` must return { data, total, totalPages, ... } (see api/http.js).
 * Changing search, filters or page size goes back to page 1.
 */
export function usePaginatedList(fetcher, { filters: initialFilters = {}, debounce = 300 } = {}) {
  const items = ref([]);
  const total = ref(0);
  const totalPages = ref(1);
  const meta = ref({}); // whole response, for extras such as per-status counts
  const page = ref(1);
  const pageSize = ref(storedPageSize());
  const search = ref('');
  const filters = reactive({ ...initialFilters });
  const loading = ref(false);
  const error = ref('');

  // Each request gets a number; a slow older response must not overwrite a newer one (race condition)
  let requestId = 0;

  async function load() {
    const id = ++requestId;
    loading.value = true;
    error.value = '';
    try {
      const res = await fetcher({ page: page.value, pageSize: pageSize.value, search: search.value || undefined, ...filters });
      if (id !== requestId) return;
      // e.g. the last row of the last page was deleted: step back to the new last page
      if (!res.data.length && res.total > 0 && page.value > res.totalPages) {
        page.value = res.totalPages;
        return;
      }
      items.value = res.data;
      total.value = res.total;
      totalPages.value = res.totalPages;
      meta.value = res;
    } catch (e) {
      if (id === requestId) error.value = e.message;
    } finally {
      if (id === requestId) loading.value = false;
    }
  }

  function backToFirstPage() {
    if (page.value === 1) load();
    else page.value = 1; // the page watcher reloads
  }

  watch(page, load);
  watch(pageSize, (size) => {
    try { localStorage.setItem(STORAGE_KEY, String(size)); } catch { /* storage unavailable */ }
    backToFirstPage();
  });
  watch(filters, backToFirstPage);

  // Debounce: wait until the user stops typing before hitting the API
  let timer;
  watch(search, () => {
    clearTimeout(timer);
    timer = setTimeout(backToFirstPage, debounce);
  });

  onMounted(load);
  return { items, total, totalPages, meta, page, pageSize, search, filters, loading, error, load };
}
