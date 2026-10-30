<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from './AppIcon.vue';
import Avatar from './Avatar.vue';
import { useAuth } from '../composables/useAuth';

// Profile button of the top bar with its dropdown: who is signed in, change password, sign out
const { user, logout } = useAuth();
const router = useRouter();
const route = useRoute();
const open = ref(false);
const root = ref(null);

// Closes on a click outside, on Escape and on every navigation
const onClick = (e) => { if (!root.value?.contains(e.target)) open.value = false; };
const onKey = (e) => { if (e.key === 'Escape') open.value = false; };
onMounted(() => { document.addEventListener('click', onClick); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); });
watch(() => route.fullPath, () => (open.value = false));

async function signOut() {
  await logout();
  router.replace('/login');
}
</script>

<template>
  <div v-if="user" ref="root" class="user-menu">
    <button type="button" class="user-trigger" :aria-expanded="open" aria-haspopup="menu" @click="open = !open">
      <Avatar :name="user.full_name" :size="34" />
      <span class="user-meta">
        <span class="user-name">{{ user.full_name }}</span>
        <span class="user-role">{{ user.role_label }}</span>
      </span>
      <AppIcon name="chevronDown" size="16" class="user-chevron" />
    </button>
    <Transition name="pop">
      <div v-if="open" class="user-dropdown" role="menu">
        <div class="user-dropdown-head">
          <Avatar :name="user.full_name" :size="40" />
          <div>
            <p class="strong">{{ user.full_name }}</p>
            <p class="muted small mono">{{ user.username }}</p>
            <span class="pill">{{ user.role_label }}</span>
          </div>
        </div>
        <RouterLink to="/change-password" class="user-dropdown-item" role="menuitem"><AppIcon name="key" size="16" />Change password</RouterLink>
        <button type="button" class="user-dropdown-item danger" role="menuitem" @click="signOut"><AppIcon name="logout" size="16" />Sign out</button>
      </div>
    </Transition>
  </div>
</template>
