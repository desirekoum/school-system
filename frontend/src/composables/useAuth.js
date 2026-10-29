import { ref, computed } from 'vue';
import { authApi } from '../api/http';

/**
 * Signed-in user, shared by the whole app (module-level state = a tiny store, no Pinia needed).
 * The session itself lives in an httpOnly cookie: JavaScript never sees the token.
 * `can()` only hides what the role can't do; the API enforces every permission anyway.
 */
const user = ref(null);
let loading = null;

export function useAuth() {
  // Asked once per page load; concurrent callers share the same request
  const fetchMe = (force = false) => {
    if (!loading || force) loading = authApi.me().then((u) => (user.value = u)).catch(() => (user.value = null));
    return loading;
  };
  const setUser = (u) => { user.value = u; loading = Promise.resolve(u); };
  const can = (perm) => !!user.value?.permissions.includes(perm);
  async function logout() {
    try { await authApi.logout(); } finally { setUser(null); }
  }
  return { user, signedIn: computed(() => !!user.value), fetchMe, setUser, can, logout };
}
