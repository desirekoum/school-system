<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import AppIcon from './AppIcon.vue';
import Avatar from './Avatar.vue';
import { classesApi } from '../api/http';
import { PASS_MARK, scoreTone, fmt } from '../config/grading';

/** Grade entry for one class: pick an exam and a course, type the scores (/20), save the column. */
const props = defineProps({
  classId: { type: [String, Number], required: true },
  exams: { type: Array, required: true },   // flattened: [{ id, label }]
  courses: { type: Array, required: true }, // courses taught in the class
});
const emit = defineEmits(['saved']);

const examId = ref(props.exams[0]?.id ?? '');
const courseId = ref(props.courses[0]?.id ?? '');
const rows = ref([]);       // [{ id, name, matricule, score, comment, original }]
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');

const asText = (v) => (v == null ? '' : String(v));
const isValid = (v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 20);
const isDirty = (r) => asText(r.score) !== r.original.score || (r.comment ?? '') !== r.original.comment;

const dirtyRows = computed(() => rows.value.filter(isDirty));
const invalidCount = computed(() => rows.value.filter((r) => !isValid(asText(r.score))).length);

// Live stats on what is typed, before saving
const stats = computed(() => {
  const scores = rows.value.map((r) => asText(r.score)).filter((v) => v !== '' && isValid(v)).map(Number);
  if (!scores.length) return null;
  return {
    count: scores.length,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    pass: Math.round((scores.filter((s) => s >= PASS_MARK).length / scores.length) * 100),
  };
});

async function load() {
  if (!examId.value || !courseId.value) return;
  loading.value = true;
  error.value = '';
  notice.value = '';
  try {
    const data = await classesApi.gradebook(props.classId, { exam_id: examId.value, course_id: courseId.value });
    rows.value = data.map((s) => ({
      ...s,
      name: `${s.last_name} ${s.first_name}`,
      score: asText(s.score),
      comment: s.comment ?? '',
      original: { score: asText(s.score), comment: s.comment ?? '' },
    }));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

// Switching exam/course with unsaved changes asks first, then reverts the select if cancelled
let reverting = false;
watch([examId, courseId], (now, before) => {
  if (reverting) { reverting = false; return; }
  if (before && dirtyRows.value.length && !confirm('You have unsaved grades. Discard them?')) {
    reverting = true; // the revert below re-triggers this watcher: skip that run
    [examId.value, courseId.value] = before;
    return;
  }
  load();
}, { immediate: true });

async function save() {
  if (invalidCount.value) return;
  saving.value = true;
  error.value = '';
  try {
    const grades = dirtyRows.value.map((r) => ({ student_id: r.id, score: r.score === '' ? null : Number(r.score), comment: r.comment }));
    const res = await classesApi.saveGradebook(props.classId, { exam_id: examId.value, course_id: courseId.value, grades });
    notice.value = `${res.saved} grade${res.saved === 1 ? '' : 's'} saved${res.deleted ? `, ${res.deleted} removed` : ''}.`;
    rows.value.forEach((r) => (r.original = { score: asText(r.score), comment: r.comment ?? '' }));
    emit('saved');
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

// Enter jumps to the next student's score, like a spreadsheet
const inputs = ref([]);
async function next(i) {
  await nextTick();
  inputs.value[i + 1]?.focus();
  inputs.value[i + 1]?.select();
}
</script>

<template>
  <div class="card">
    <div class="toolbar">
      <div class="filters">
        <select v-model="examId" aria-label="Exam">
          <option v-for="e in exams" :key="e.id" :value="e.id">{{ e.label }}</option>
        </select>
        <select v-model="courseId" aria-label="Course">
          <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.name }} (coef. {{ Number(c.coefficient) }})</option>
        </select>
      </div>
      <span v-if="stats" class="muted small">
        {{ stats.count }}/{{ rows.length }} graded · average <b :class="scoreTone(stats.avg)">{{ fmt(stats.avg) }}</b> · {{ stats.pass }}% ≥ {{ PASS_MARK }}
      </span>
    </div>

    <div v-if="error" class="alert" style="margin: 1rem 1.25rem 0"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="!courses.length" class="empty"><p>No course is assigned to this class yet. Assign courses in the Overview tab.</p></div>

    <div v-else class="table-wrap" :class="{ 'is-loading': loading }">
      <table class="table">
        <thead><tr><th>#</th><th>Student</th><th class="num">Score / 20</th><th>Comment</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.id">
            <td class="muted">{{ i + 1 }}</td>
            <td>
              <div class="identity">
                <Avatar :name="r.name" :src="r.photo_url" :size="30" />
                <div><div class="strong">{{ r.name }}</div><div class="muted small">{{ r.matricule }}</div></div>
              </div>
            </td>
            <td class="num">
              <input :ref="(el) => (inputs[i] = el)" v-model="r.score" type="number" min="0" max="20" step="0.25" inputmode="decimal"
                     class="grade-input" :class="{ invalid: !isValid(asText(r.score)), dirty: isDirty(r) }"
                     :aria-label="`Score for ${r.name}`" @keydown.enter.prevent="next(i)" />
            </td>
            <td><input v-model="r.comment" class="comment-input" maxlength="200" placeholder="Optional" /></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && !rows.length" class="empty"><p>No student registered in this class.</p></div>
    </div>

    <div class="save-bar">
      <span class="muted small">
        <template v-if="invalidCount"><b class="score-fail">{{ invalidCount }} invalid score{{ invalidCount > 1 ? 's' : '' }}</b>: use a number between 0 and 20.</template>
        <template v-else-if="dirtyRows.length">{{ dirtyRows.length }} unsaved change{{ dirtyRows.length > 1 ? 's' : '' }}. Leave a score empty to remove it.</template>
        <template v-else-if="notice"><AppIcon name="check" size="14" /> {{ notice }}</template>
        <template v-else>Tip: press Enter to move to the next student.</template>
      </span>
      <button class="btn primary" :disabled="saving || !dirtyRows.length || invalidCount > 0" @click="save">
        <AppIcon name="save" size="16" />{{ saving ? 'Saving…' : 'Save grades' }}
      </button>
    </div>
  </div>
</template>
