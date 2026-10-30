<script setup>
import { ref, computed, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import AppIcon from '../components/AppIcon.vue';
import Avatar from '../components/Avatar.vue';
import { attendanceApi } from '../api/http';
import { ATTENDANCE_STATUSES, longDate } from '../config/attendance';

// Roll call of one class session: everyone starts "present", the teacher only taps the exceptions
const props = defineProps({ slotId: String, date: String });

const sheet = ref(null);
const marks = ref({});      // student_id → { status, minutes_late, note }
const error = ref('');
const notice = ref('');
const saving = ref(false);
const filter = ref('');
const openNote = ref(null);

async function load() {
  error.value = '';
  try {
    sheet.value = await attendanceApi.sheet(props.slotId, props.date);
    marks.value = Object.fromEntries(sheet.value.students.map((s) => [s.student_id, {
      status: s.status ?? 'present', minutes_late: s.minutes_late ?? '', note: s.note ?? '',
    }]));
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(load);

const readonly = computed(() => !sheet.value?.can_edit);
const counts = computed(() => {
  const c = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const m of Object.values(marks.value)) c[m.status]++;
  return c;
});
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return (sheet.value?.students ?? []).filter((s) => !q || `${s.last_name} ${s.first_name} ${s.matricule}`.toLowerCase().includes(q));
});

function set(id, status) {
  if (readonly.value) return;
  marks.value[id].status = status;
  if (status !== 'late') marks.value[id].minutes_late = '';
  notice.value = '';
}
function allPresent() {
  for (const m of Object.values(marks.value)) { m.status = 'present'; m.minutes_late = ''; }
}

// Why the sheet is read-only (shown to a teacher outside the allowed window)
const lockReason = computed(() => {
  const s = sheet.value;
  if (!s || s.can_edit) return '';
  if (!s.mine) return 'Read only: only the teacher of this class or the school office can change it.';
  if (s.window === 'upcoming') return `Attendance opens ${s.open_before} minutes before the class starts (${s.slot.start_time}).`;
  return `Attendance closed ${s.close_after} minutes after the class ended. Ask the school office for a correction.`;
});

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const records = Object.entries(marks.value).map(([id, m]) => ({
      student_id: Number(id), status: m.status, minutes_late: m.status === 'late' && m.minutes_late ? Number(m.minutes_late) : null, note: m.note || null,
    }));
    await attendanceApi.save(props.slotId, props.date, records);
    await load();
    notice.value = `Saved: ${counts.value.absent} absent, ${counts.value.late} late out of ${records.length} students.`;
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="sheet-page">
    <PageHeader v-if="sheet" :back="{ to: { path: '/attendance', query: { date } }, label: 'Attendance' }" :title="`${sheet.slot.class_name} · ${sheet.slot.course_name}`"
                :subtitle="`${longDate(date)} · ${sheet.slot.start_time}–${sheet.slot.end_time}${sheet.slot.teacher ? ` · ${sheet.slot.teacher}` : ''}${sheet.slot.room ? ` · ${sheet.slot.room}` : ''}`">
      <button v-if="!readonly" class="btn secondary" @click="allPresent"><AppIcon name="check" />Everyone present</button>
    </PageHeader>

    <div v-if="error" class="alert" role="alert"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="notice" class="alert success"><AppIcon name="check" />{{ notice }}</div>

    <template v-if="sheet">
      <div v-if="lockReason" class="alert info"><AppIcon name="lock" />{{ lockReason }}</div>
      <p v-else-if="!sheet.session" class="muted small">Not taken yet: everyone is marked present, tap the students who are absent, late or excused.</p>
      <p v-else class="muted small">Taken{{ sheet.session.taken_by ? ` by ${sheet.session.taken_by}` : '' }}, last saved {{ new Date(sheet.session.updated_at).toLocaleString() }}.</p>

      <div class="att-totals">
        <div v-for="s in ATTENDANCE_STATUSES" :key="s.value" :class="['att-total', s.value]"><b>{{ counts[s.value] }}</b><span>{{ s.label }}</span></div>
      </div>

      <div class="card">
        <div class="toolbar">
          <label class="search">
            <AppIcon name="search" size="16" />
            <input v-model="filter" type="search" placeholder="Find a student…" />
          </label>
          <span class="muted small">{{ sheet.students.length }} students</span>
        </div>
        <ul class="roll">
          <li v-for="(s, i) in shown" :key="s.student_id" :class="['roll-row', marks[s.student_id].status]">
            <span class="roll-no muted small">{{ i + 1 }}</span>
            <Avatar :name="`${s.first_name} ${s.last_name}`" :src="s.photo_url" :size="34" />
            <div class="roll-name">
              <RouterLink :to="`/students/${s.student_id}`" class="strong">{{ s.last_name }} {{ s.first_name }}</RouterLink>
              <span class="muted small mono">{{ s.matricule }}</span>
            </div>
            <div class="roll-actions">
              <div class="seg" role="radiogroup" :aria-label="`Status of ${s.first_name} ${s.last_name}`">
                <button v-for="st in ATTENDANCE_STATUSES" :key="st.value" type="button" role="radio"
                        :aria-checked="marks[s.student_id].status === st.value" :title="st.label" :disabled="readonly"
                        :class="['seg-btn', st.value, { on: marks[s.student_id].status === st.value }]" @click="set(s.student_id, st.value)">
                  <span class="seg-short">{{ st.short }}</span><span class="seg-long">{{ st.label }}</span>
                </button>
              </div>
              <input v-if="marks[s.student_id].status === 'late'" v-model="marks[s.student_id].minutes_late" class="late-input" type="number" min="1" max="599"
                     placeholder="min" aria-label="Minutes late" :disabled="readonly" />
              <button v-if="!readonly || marks[s.student_id].note" type="button" class="icon-btn" :class="{ 'has-note': marks[s.student_id].note }" title="Note"
                      @click="openNote = openNote === s.student_id ? null : s.student_id"><AppIcon name="pencil" size="16" /></button>
            </div>
            <input v-if="openNote === s.student_id" v-model="marks[s.student_id].note" class="roll-note" maxlength="200" placeholder="Note (e.g. medical certificate)" :disabled="readonly" />
          </li>
        </ul>
        <div v-if="!sheet.students.length" class="empty"><AppIcon name="students" size="32" /><p>No student registered in this class.</p></div>
      </div>

      <div v-if="!readonly && sheet.students.length" class="sticky-save">
        <span class="muted small">{{ counts.absent }} absent · {{ counts.late }} late · {{ counts.excused }} excused</span>
        <button class="btn primary" :disabled="saving" @click="save"><AppIcon name="save" />{{ saving ? 'Saving…' : sheet.session ? 'Save changes' : 'Save attendance' }}</button>
      </div>
    </template>
  </section>
</template>
