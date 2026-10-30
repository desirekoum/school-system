<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import AppIcon from '../components/AppIcon.vue';
import { timetableApi, classesApi, teachersApi, academicYearsApi } from '../api/http';
import { useAuth } from '../composables/useAuth';
import { WEEKDAYS, dayName, toMinutes } from '../config/attendance';

/**
 * Weekly timetable of a class (a class belongs to one academic year), or of a teacher.
 * Slots are placed by their real times: top = minutes since the first hour × scale, so any schedule fits.
 */
const { user, can } = useAuth();
const route = useRoute();
const router = useRouter();
const editable = computed(() => can('academics:write'));
const isTeacher = computed(() => !!user.value?.teacher_id);

const years = ref([]);
const classes = ref([]);
const teachers = ref([]);
const slots = ref([]);
const now = ref(null);        // { date, time, weekday, slots } from /timetable/now (school time)
const loading = ref(false);
const error = ref('');

// Selection lives in the URL (?class_id= or ?teacher_id= / ?mine=1), so a timetable can be bookmarked
const year = ref('');
const mode = ref(route.query.teacher_id || route.query.mine || (isTeacher.value && !route.query.class_id) ? 'teacher' : 'class');
const classId = ref(route.query.class_id ? Number(route.query.class_id) : '');
const teacherId = ref(route.query.teacher_id ? Number(route.query.teacher_id) : '');

const yearClasses = computed(() => classes.value.filter((c) => c.academic_year === year.value));
const selectedClass = computed(() => classes.value.find((c) => c.id === classId.value));

onMounted(async () => {
  const [y, c, t] = await Promise.all([
    academicYearsApi.list(), classesApi.list(), can('staff:read') ? teachersApi.list({ status: 'active' }) : [],
  ]);
  years.value = y;
  classes.value = c;
  teachers.value = t;
  year.value = classes.value.find((x) => x.id === classId.value)?.academic_year ?? y.find((x) => x.is_current)?.name ?? y[0]?.name ?? '';
  if (mode.value === 'class' && !classId.value) classId.value = yearClasses.value[0]?.id ?? '';
  await Promise.all([load(), refreshNow()]);
});

// "Now" refreshes every minute so the red line and the live slot move with the clock
let timer;
onMounted(() => (timer = setInterval(refreshNow, 60000)));
onBeforeUnmount(() => clearInterval(timer));
async function refreshNow() {
  try { now.value = await timetableApi.now(); } catch { /* not critical */ }
}

async function load() {
  error.value = '';
  loading.value = true;
  try {
    if (mode.value === 'class') {
      slots.value = classId.value ? await timetableApi.list({ class_id: classId.value }) : [];
      router.replace({ query: classId.value ? { class_id: classId.value } : {} });
    } else if (teacherId.value) {
      slots.value = await timetableApi.list({ teacher_id: teacherId.value, academic_year: year.value });
      router.replace({ query: { teacher_id: teacherId.value } });
    } else {
      slots.value = isTeacher.value ? await timetableApi.list({ mine: 1, academic_year: year.value }) : [];
      router.replace({ query: isTeacher.value ? { mine: 1 } : {} });
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(year, (y, old) => {
  if (!old) return;
  if (mode.value === 'class') classId.value = yearClasses.value[0]?.id ?? '';
  load();
});
watch([mode, classId, teacherId], () => years.value.length && load());

// ---------- Grid geometry ----------
const PX_PER_MIN = 1.1;
const days = computed(() => {
  const used = new Set(slots.value.map((s) => s.weekday));
  return WEEKDAYS.filter((d) => d.value <= 5 || used.has(d.value));
});
const range = computed(() => {
  const starts = slots.value.map((s) => toMinutes(s.start_time));
  const ends = slots.value.map((s) => toMinutes(s.end_time));
  const from = Math.floor(Math.min(7 * 60 + 30, ...starts) / 60) * 60;
  const to = Math.ceil(Math.max(15 * 60 + 30, ...ends) / 60) * 60;
  return { from, to };
});
const hours = computed(() => {
  const list = [];
  for (let m = range.value.from; m < range.value.to; m += 60) list.push(m);
  return list;
});
const box = (s) => ({
  top: `${(toMinutes(s.start_time) - range.value.from) * PX_PER_MIN}px`,
  height: `${(toMinutes(s.end_time) - toMinutes(s.start_time)) * PX_PER_MIN - 3}px`,
});
const byDay = (d) => slots.value.filter((s) => s.weekday === d);
const isLive = (s) => now.value && s.weekday === now.value.weekday && s.start_time <= now.value.time && s.end_time > now.value.time
  && now.value.academic_year === s.academic_year;
const nowLine = computed(() => {
  if (!now.value) return null;
  const m = toMinutes(now.value.time);
  if (m < range.value.from || m > range.value.to) return null;
  return { weekday: now.value.weekday, top: `${(m - range.value.from) * PX_PER_MIN}px` };
});
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00`;

// Same color for the same course everywhere (hash of the code → one of 8 tones)
const tone = (code) => `tone-${[...(code ?? '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 8}`;

// Mobile: one day at a time
const mobileDay = ref(new Date().getDay() || 1);
const totalHours = computed(() => slots.value.reduce((a, s) => a + (toMinutes(s.end_time) - toMinutes(s.start_time)), 0) / 60);

// ---------- Edit ----------
const form = ref(null);
const formError = ref('');
const saving = ref(false);
const classCourses = ref([]);

async function openSlot(slot = null, weekday = 1) {
  if (!editable.value) return;
  formError.value = '';
  const cid = slot?.class_id ?? (mode.value === 'class' ? classId.value : '');
  form.value = slot
    ? { id: slot.id, class_id: slot.class_id, course_id: slot.course_id, weekday: slot.weekday, start_time: slot.start_time, end_time: slot.end_time, room: slot.room ?? '', teacher_id: slot.teacher_override ?? '' }
    : { class_id: cid, course_id: '', weekday, start_time: '07:30', end_time: '08:25', room: '', teacher_id: '' };
  await loadClassCourses();
}
async function loadClassCourses() {
  classCourses.value = form.value?.class_id ? await classesApi.courses(form.value.class_id) : [];
}
const defaultTeacher = computed(() => classCourses.value.find((c) => c.id === form.value?.course_id)?.teacher);

async function save() {
  saving.value = true;
  formError.value = '';
  try {
    const body = { ...form.value, teacher_id: form.value.teacher_id || null };
    await (form.value.id ? timetableApi.update(form.value.id, body) : timetableApi.create(body));
    form.value = null;
    await Promise.all([load(), refreshNow()]);
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}
async function remove() {
  if (!confirm('Delete this slot from the timetable? Attendance already taken is kept.')) return;
  try {
    await timetableApi.remove(form.value.id);
    form.value = null;
    await load();
  } catch (e) {
    formError.value = e.message;
  }
}
</script>

<template>
  <section>
    <PageHeader title="Timetable" subtitle="Weekly schedule of each class for an academic year, and what is being taught right now.">
      <button v-if="editable && mode === 'class' && classId" class="btn primary" @click="openSlot(null, mobileDay)"><AppIcon name="plus" />Add a slot</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <!-- What is happening now, school-wide (officials) or for this teacher -->
    <div v-if="now" class="card now-card">
      <div class="now-head">
        <span class="live-dot" aria-hidden="true" />
        <b>Now</b>
        <span class="muted small">{{ dayName(now.weekday) }} {{ now.time }} · school time</span>
      </div>
      <p v-if="!now.slots.length" class="muted small">No class is scheduled at this time.</p>
      <div v-else class="now-list">
        <RouterLink v-for="s in (isTeacher && !can('attendance:read') ? now.slots.filter((x) => x.teacher_id === user.teacher_id) : now.slots).slice(0, 12)"
                    :key="s.id" :to="{ query: { class_id: s.class_id } }" class="now-item" @click="mode = 'class'; classId = s.class_id">
          <b>{{ s.class_name }}</b>
          <span>{{ s.course_name }}</span>
          <span class="muted small">{{ s.start_time }}–{{ s.end_time }}<template v-if="s.teacher"> · {{ s.teacher }}</template><template v-if="s.room"> · {{ s.room }}</template></span>
        </RouterLink>
        <span v-if="now.slots.length > 12" class="muted small">+ {{ now.slots.length - 12 }} more</span>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="filters">
          <select v-model="year" aria-label="Academic year">
            <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}{{ y.is_current ? ' (current)' : '' }}</option>
          </select>
          <select v-if="can('staff:read') || isTeacher" v-model="mode" aria-label="Show">
            <option value="class">By class</option>
            <option value="teacher">{{ can('staff:read') ? 'By teacher' : 'My timetable' }}</option>
          </select>
          <select v-if="mode === 'class'" v-model="classId" aria-label="Class">
            <option value="" disabled>Choose a class</option>
            <option v-for="c in yearClasses" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select v-else-if="can('staff:read')" v-model="teacherId" aria-label="Teacher">
            <option value="">{{ isTeacher ? 'Me' : 'Choose a teacher' }}</option>
            <option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.last_name }} {{ t.first_name }}</option>
          </select>
        </div>
        <span class="muted small">
          <template v-if="selectedClass && mode === 'class'">{{ selectedClass.level }} · </template>{{ slots.length }} slots · {{ totalHours.toFixed(1).replace('.0', '') }} h/week
        </span>
      </div>

      <div class="day-tabs" role="tablist">
        <button v-for="d in days" :key="d.value" :class="['tab', { active: mobileDay === d.value }]" role="tab" @click="mobileDay = d.value">{{ d.short }}</button>
      </div>

      <div class="tt-wrap" :class="{ 'is-loading': loading }">
        <div class="tt" :style="{ '--days': days.length }">
          <div class="tt-corner" />
          <div v-for="d in days" :key="d.value" class="tt-dayhead" :class="{ today: now?.weekday === d.value, 'mobile-hidden': mobileDay !== d.value }">{{ d.label }}</div>

          <div class="tt-hours" :style="{ height: `${(range.to - range.from) * PX_PER_MIN}px` }">
            <span v-for="h in hours" :key="h" :style="{ top: `${(h - range.from) * PX_PER_MIN}px` }">{{ hhmm(h) }}</span>
          </div>
          <div v-for="d in days" :key="d.value" class="tt-day" :class="{ 'mobile-hidden': mobileDay !== d.value, clickable: editable && mode === 'class' }"
               :style="{ height: `${(range.to - range.from) * PX_PER_MIN}px` }"
               @click.self="editable && mode === 'class' && openSlot(null, d.value)">
            <i v-for="h in hours" :key="h" class="tt-line" :style="{ top: `${(h - range.from) * PX_PER_MIN}px` }" />
            <i v-if="nowLine && nowLine.weekday === d.value" class="tt-now" :style="{ top: nowLine.top }" />
            <button v-for="s in byDay(d.value)" :key="s.id" type="button" class="tt-slot" :class="[tone(s.course_code), { live: isLive(s), static: !editable }]"
                    :style="box(s)" :title="`${s.course_name} · ${s.start_time}–${s.end_time}`" @click="openSlot(s)">
              <b>{{ mode === 'class' ? s.course_name : s.class_name }}</b>
              <span>{{ s.start_time }}–{{ s.end_time }}</span>
              <span class="tt-meta">{{ mode === 'class' ? s.teacher ?? 'No teacher' : s.course_name }}<template v-if="s.room"> · {{ s.room }}</template></span>
            </button>
          </div>
        </div>
        <div v-if="!loading && !slots.length" class="empty">
          <AppIcon name="grid" size="32" />
          <p v-if="mode === 'class' && !classId">Choose a class.</p>
          <p v-else>No slot yet{{ editable && mode === 'class' ? ': click a day or "Add a slot".' : '.' }}</p>
        </div>
      </div>
    </div>

    <SlideOver v-if="form" :title="form.id ? 'Edit slot' : 'New slot'" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="slot-form" class="form-grid" @submit.prevent="save">
        <label class="field wide">Class
          <select v-model="form.class_id" required @change="form.course_id = ''; loadClassCourses()">
            <option v-for="c in yearClasses" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="field wide">Course
          <select v-model="form.course_id" required>
            <option value="" disabled>Choose a course</option>
            <option v-for="c in classCourses" :key="c.id" :value="c.id">{{ c.name }} ({{ c.hours_per_week }} h/week)</option>
          </select>
          <span v-if="form.class_id && !classCourses.length" class="muted small">No course in this class yet: add them on the class page.</span>
        </label>
        <label class="field wide">Day
          <select v-model="form.weekday" required>
            <option v-for="d in WEEKDAYS" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </label>
        <label class="field">Starts<input v-model="form.start_time" type="time" required /></label>
        <label class="field">Ends<input v-model="form.end_time" type="time" required /></label>
        <label class="field">Room<input v-model="form.room" maxlength="30" placeholder="e.g. Salle 12" /></label>
        <label v-if="can('staff:read')" class="field">Teacher
          <select v-model="form.teacher_id">
            <option value="">Course teacher{{ defaultTeacher ? ` (${defaultTeacher})` : '' }}</option>
            <option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.last_name }} {{ t.first_name }}</option>
          </select>
        </label>
      </form>
      <p class="muted small" style="margin-top: 1rem">A class, a teacher or a room can't be booked twice at the same time.</p>
      <template #footer>
        <button v-if="form.id" type="button" class="btn danger-ghost" style="margin-right: auto" @click="remove"><AppIcon name="trash" size="16" />Delete</button>
        <button type="button" class="btn secondary" @click="form = null">Cancel</button>
        <button type="submit" form="slot-form" class="btn primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
      </template>
    </SlideOver>
  </section>
</template>
