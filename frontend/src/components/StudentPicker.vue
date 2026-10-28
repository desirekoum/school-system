<script setup>
import { ref, watch } from 'vue';
import Avatar from './Avatar.vue';
import { studentsApi } from '../api/http';

/** Search-as-you-type student field (server-side search, 8 results). v-model = selected student or null. */
const model = defineModel({ type: Object, default: null });
const text = ref('');
const results = ref([]);
const open = ref(false);

let timer;
watch(text, (q) => {
  clearTimeout(timer);
  if (model.value || q.trim().length < 2) { results.value = []; return; }
  // Debounce: wait for a pause in typing before querying the API
  timer = setTimeout(async () => {
    results.value = (await studentsApi.list({ search: q, page: 1, pageSize: 8, status: 'active' })).data;
    open.value = true;
  }, 250);
});
function choose(s) {
  model.value = s;
  text.value = `${s.last_name} ${s.first_name} (${s.matricule})`;
  open.value = false;
}
// Delay so a click on a result lands before the list disappears
const close = () => setTimeout(() => (open.value = false), 150);
function clear() {
  model.value = null;
  text.value = '';
}
</script>

<template>
  <div class="picker">
    <input v-model="text" type="search" placeholder="Type a name or matricule…" :readonly="!!model" @focus="open = results.length > 0" @blur="close" />
    <button v-if="model" type="button" class="picker-clear" aria-label="Change student" @click="clear">×</button>
    <ul v-if="open && results.length" class="picker-list">
      <li v-for="s in results" :key="s.id" @mousedown.prevent="choose(s)">
        <Avatar :name="`${s.first_name} ${s.last_name}`" :src="s.photo_url" :size="26" />
        <span><b>{{ s.last_name }} {{ s.first_name }}</b> <span class="muted small">{{ s.matricule }}</span></span>
      </li>
    </ul>
  </div>
</template>
