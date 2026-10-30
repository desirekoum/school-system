<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import AppIcon from './AppIcon.vue';

// "Export" button with a format choice; the parent does the export in @export(format)
defineProps({ busy: Boolean });
const emit = defineEmits(['export']);
const open = ref(false);
const root = ref(null);

const onClick = (e) => { if (!root.value?.contains(e.target)) open.value = false; };
const onKey = (e) => { if (e.key === 'Escape') open.value = false; };
onMounted(() => { document.addEventListener('click', onClick); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); });

function pick(format) {
  open.value = false;
  emit('export', format);
}
</script>

<template>
  <div ref="root" class="menu-wrap">
    <button type="button" class="btn secondary" :disabled="busy" :aria-expanded="open" aria-haspopup="menu" @click="open = !open">
      <AppIcon name="download" />{{ busy ? 'Exporting…' : 'Export' }}<AppIcon name="chevronDown" size="14" />
    </button>
    <Transition name="pop">
      <div v-if="open" class="user-dropdown menu-dropdown" role="menu">
        <button type="button" class="user-dropdown-item" role="menuitem" @click="pick('xlsx')">
          <AppIcon name="sheet" size="16" /><span>Excel <span class="muted small">.xlsx</span></span>
        </button>
        <button type="button" class="user-dropdown-item" role="menuitem" @click="pick('csv')">
          <AppIcon name="receipt" size="16" /><span>CSV <span class="muted small">.csv</span></span>
        </button>
      </div>
    </Transition>
  </div>
</template>
