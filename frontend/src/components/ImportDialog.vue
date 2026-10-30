<script setup>
import { ref, computed } from 'vue';
import SlideOver from './SlideOver.vue';
import AppIcon from './AppIcon.vue';
import { importApi } from '../api/http';
import { t } from '../i18n';

/**
 * Excel import in 3 steps: download the template → choose the file → check, then import.
 * "Check" is a dry run: the server validates every row and saves nothing, so errors are fixed before anything changes.
 * The import itself is all or nothing (one database transaction).
 */
const props = defineProps({
  imports: { type: Array, required: true },   // [{ entity, label }]
});
const emit = defineEmits(['close', 'done']);

const entity = ref(props.imports[0].entity);
const file = ref(null);
const report = ref(null);     // last server answer
const busy = ref('');         // '', 'template', 'check', 'import'
const error = ref('');
const dragging = ref(false);
const input = ref(null);

const checked = computed(() => report.value?.dry_run && !report.value.error_count);
const done = computed(() => report.value?.saved);

function reset() {
  report.value = null;
  error.value = '';
}
function choose(f) {
  if (!f) return;
  if (!/\.xlsx$/i.test(f.name)) {
    error.value = t('imports.notXlsx');
    return;
  }
  file.value = f;
  reset();
}
const onDrop = (e) => { dragging.value = false; choose(e.dataTransfer.files[0]); };
const changeEntity = () => { reset(); };

async function template() {
  busy.value = 'template';
  error.value = '';
  try {
    await importApi.template(entity.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = '';
  }
}

async function run(dryRun) {
  busy.value = dryRun ? 'check' : 'import';
  error.value = '';
  try {
    report.value = await importApi.run(entity.value, file.value, dryRun);
    if (report.value.saved) emit('done');
  } catch (e) {
    report.value = null;
    error.value = e.message;
  } finally {
    busy.value = '';
  }
}

</script>

<template>
  <SlideOver :title="t('imports.title')" @close="emit('close')">
    <div class="import-steps">
      <label v-if="imports.length > 1" class="field">{{ t('imports.what') }}
        <select v-model="entity" @change="changeEntity">
          <option v-for="i in imports" :key="i.entity" :value="i.entity">{{ i.label }}</option>
        </select>
      </label>

      <div class="import-step">
        <span class="step-no">1</span>
        <div>
          <p class="strong">{{ t('imports.step1') }}</p>
          <p class="muted small">{{ t('imports.step1Help') }}</p>
          <button type="button" class="btn secondary sm" :disabled="busy === 'template'" @click="template">
            <AppIcon name="download" size="16" />{{ busy === 'template' ? t('imports.preparing') : t('imports.download') }}
          </button>
        </div>
      </div>

      <div class="import-step">
        <span class="step-no">2</span>
        <div class="grow">
          <p class="strong">{{ t('imports.step2') }}</p>
          <div class="dropzone" :class="{ over: dragging, filled: file }" role="button" tabindex="0"
               @click="input.click()" @keydown.enter.prevent="input.click()" @keydown.space.prevent="input.click()"
               @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
            <AppIcon :name="file ? 'sheet' : 'upload'" size="24" />
            <span v-if="file"><b>{{ file.name }}</b><span class="muted small"> · {{ Math.ceil(file.size / 1024) }} KB · {{ t('imports.clickToChange') }}</span></span>
            <i18n-t v-else keypath="imports.drop" tag="span" scope="global"><template #browse><b>{{ t('imports.browse') }}</b></template></i18n-t>
          </div>
          <input ref="input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
                 @change="choose($event.target.files[0]); $event.target.value = ''" />
        </div>
      </div>

      <div class="import-step">
        <span class="step-no">3</span>
        <div>
          <p class="strong">{{ t('imports.step3') }}</p>
          <p class="muted small">{{ t('imports.step3Help') }}</p>
        </div>
      </div>

      <div v-if="error" class="alert" role="alert"><AppIcon name="alert" />{{ error }}</div>

      <div v-if="report" class="import-report" aria-live="polite">
        <div v-if="done" class="alert success"><AppIcon name="check" />{{ t('imports.complete', { n: report.total }) }}</div>
        <div v-else-if="report.error_count" class="alert"><AppIcon name="alert" />{{ t('imports.errorsFound', report.error_count) }}</div>
        <div v-else class="alert success"><AppIcon name="check" />{{ t('imports.allValid', { n: report.total }) }}</div>

        <div class="report-counts">
          <div><b>{{ report.created }}</b><span>{{ done ? t('imports.created') : t('imports.toCreate') }}</span></div>
          <div><b>{{ report.updated }}</b><span>{{ done ? t('imports.updated') : t('imports.toUpdate') }}</span></div>
          <div><b>{{ report.unchanged }}</b><span>{{ t('imports.unchanged') }}</span></div>
          <div :class="{ bad: report.error_count }"><b>{{ report.error_count }}</b><span>{{ t('imports.errors') }}</span></div>
        </div>

        <p v-if="report.ignored_columns.length" class="muted small">
          {{ t('imports.ignored', { list: report.ignored_columns.join(', ') }) }}
        </p>

        <div v-if="report.errors.length" class="table-wrap report-errors">
          <table class="table compact">
            <thead><tr><th>{{ t('imports.row') }}</th><th>{{ t('imports.column') }}</th><th>{{ t('imports.problem') }}</th></tr></thead>
            <tbody>
              <tr v-for="(e, i) in report.errors" :key="i">
                <td class="mono">{{ e.row }}</td>
                <td>{{ e.column ?? '—' }}</td>
                <td class="wrap">{{ e.message }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="report.error_count > report.errors.length" class="muted small">{{ t('imports.more', { n: report.error_count - report.errors.length }) }}</p>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn secondary" @click="emit('close')">{{ done ? t('common.close') : t('common.cancel') }}</button>
      <button v-if="!done" type="button" class="btn secondary" :disabled="!file || !!busy" @click="run(true)">
        {{ busy === 'check' ? t('imports.checking') : t('imports.check') }}
      </button>
      <button v-if="!done" type="button" class="btn primary" :disabled="!checked || !!busy" @click="run(false)">
        <AppIcon name="upload" size="16" />{{ busy === 'import' ? t('imports.importing') : t('common.import') }}
      </button>
    </template>
  </SlideOver>
</template>
