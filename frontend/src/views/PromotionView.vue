<script setup>
import { ref, computed, onMounted } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import Avatar from '../components/Avatar.vue';
import PageHeader from '../components/PageHeader.vue';
import { classesApi } from '../api/http';
import { scoreTone, fmt } from '../config/grading';
import { t } from '../i18n';

/**
 * End-of-year promotion of a class: each student is proposed "moves up" (year average ≥ pass mark)
 * or "repeats"; the principal/office can change any decision and target class, then apply.
 * Applying registers the students for the next academic year in one transaction (all or nothing).
 */
const props = defineProps({ id: String });
const p = ref(null);           // preview from the API
const rows = ref([]);          // editable decisions
const year = ref(undefined);
const error = ref('');
const result = ref(null);
const busy = ref(false);

async function load() {
  error.value = '';
  try {
    p.value = await classesApi.promotion(props.id, year.value);
    year.value = p.value.academic_year ?? undefined;
    rows.value = p.value.students.map((s) => ({ ...s }));
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(load);

const last = computed(() => p.value && !p.value.next_level);
const open = computed(() => rows.value.filter((r) => !r.already_in));
const count = (d) => open.value.filter((r) => r.decision === d).length;
const targetsOf = (r) => (r.decision === 'promote' ? p.value.targets.promote : r.decision === 'repeat' ? p.value.targets.repeat : []);
const missing = computed(() => open.value.filter((r) => r.decision !== 'leave' && !targetsOf(r).some((c) => c.id === r.class_id)));
// Seats each target class would have after applying (enrolled + chosen here)
const seats = computed(() => {
  const m = new Map();
  for (const r of open.value) if (r.decision !== 'leave' && r.class_id) m.set(r.class_id, (m.get(r.class_id) ?? 0) + 1);
  return m;
});
const full = (c) => c.enrolled + (seats.value.get(c.id) ?? 0) > c.capacity;

function decide(r, d) {
  r.decision = d;
  const list = targetsOf(r);
  if (!list.some((c) => c.id === r.class_id)) r.class_id = list[0]?.id ?? null;
}
// One target for every student with the same decision (e.g. all "moves up" go to 5e B)
function setAll(decision, classId) {
  for (const r of open.value) if (r.decision === decision) r.class_id = classId;
}

async function apply() {
  if (!confirm(t('promotion.confirm', { up: count('promote'), repeat: count('repeat'), leave: count('leave'), year: p.value.academic_year }))) return;
  busy.value = true;
  error.value = '';
  try {
    result.value = await classesApi.promote(props.id, {
      academic_year: p.value.academic_year,
      decisions: rows.value.map((r) => ({ student_id: r.id, decision: r.decision, class_id: r.class_id })),
    });
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
const leaveLabel = computed(() => (last.value ? t('promotion.graduates') : t('promotion.leaves')));
</script>

<template>
  <section v-if="p">
    <PageHeader :title="t('promotion.title', { name: p.class.name })" :subtitle="t('promotion.subtitle', { from: p.class.academic_year, mark: p.pass_mark })"
      :back="{ to: `/classes/${id}?tab=results`, label: p.class.name }">
      <label v-if="p.years.length > 1" class="inline-field"><span class="muted small">{{ t('promotion.toYear') }}</span>
        <select v-model="year" @change="load"><option v-for="y in p.years" :key="y" :value="y">{{ y }}</option></select>
      </label>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="result" class="alert success"><AppIcon name="check" />
      {{ t('promotion.done', { up: result.promoted, repeat: result.repeating, year: result.academic_year }) }}
    </div>

    <div v-if="!p.academic_year" class="card empty">
      <p>{{ t('promotion.noYear', { from: p.class.academic_year }) }}</p>
      <RouterLink to="/academic-years" class="btn secondary">{{ t('nav.academicYears') }}</RouterLink>
    </div>

    <template v-else>
      <div class="stats">
        <div class="card stat"><span class="stat-icon"><AppIcon name="award" size="22" /></span>
          <div><p class="muted small">{{ last ? leaveLabel : t('promotion.movesUpTo', { level: p.next_level }) }}</p><p class="stat-value">{{ last ? count('leave') : count('promote') }}</p></div></div>
        <div class="card stat"><span class="stat-icon"><AppIcon name="pencil" size="22" /></span>
          <div><p class="muted small">{{ t('promotion.repeatsIn', { level: p.class.level }) }}</p><p class="stat-value">{{ count('repeat') }}</p></div></div>
        <div class="card stat"><span class="stat-icon"><AppIcon name="students" size="22" /></span>
          <div><p class="muted small">{{ t('promotion.alreadyDone') }}</p><p class="stat-value">{{ rows.length - open.length }} <small>/ {{ rows.length }}</small></p></div></div>
      </div>

      <div v-if="!p.targets.promote.length && !last || !p.targets.repeat.length" class="alert">
        <AppIcon name="alert" />{{ t('promotion.missingClasses', { year: p.academic_year, levels: [!last && !p.targets.promote.length ? p.next_level : null, !p.targets.repeat.length ? p.class.level : null].filter(Boolean).join(', ') }) }}
      </div>

      <div class="card">
        <div class="card-header">
          <h2>{{ p.class.name }} → {{ p.academic_year }}</h2>
          <div class="row-actions no-print">
            <label v-if="p.targets.promote.length > 1" class="inline-field"><span class="muted small">{{ t('promotion.allUpTo') }}</span>
              <select @change="setAll('promote', Number($event.target.value))"><option value="">—</option><option v-for="c in p.targets.promote" :key="c.id" :value="c.id">{{ c.name }}</option></select>
            </label>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t('grades.rank') }}</th>
                <th>{{ t('common.student') }}</th>
                <th class="num">{{ t('promotion.yearAvg') }}</th>
                <th>{{ t('promotion.decision') }}</th>
                <th>{{ t('promotion.newClass') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id" :class="{ muted: r.already_in }">
                <td><span class="rank" :class="{ top: r.rank && r.rank <= 3 }">{{ r.rank ?? '—' }}</span></td>
                <td>
                  <RouterLink :to="`/students/${r.id}`" class="identity">
                    <Avatar :name="`${r.first_name} ${r.last_name}`" :src="r.photo_url" :size="30" />
                    <div><div class="strong">{{ r.last_name }} {{ r.first_name }}</div><div class="muted small">{{ r.matricule }}</div></div>
                  </RouterLink>
                </td>
                <td class="num"><b :class="scoreTone(r.year_avg)">{{ fmt(r.year_avg) }}</b></td>
                <td v-if="r.already_in" colspan="2" class="muted small">{{ t('promotion.alreadyIn', { name: r.already_in }) }}</td>
                <template v-else>
                  <td>
                    <div class="segmented decision" style="margin: 0">
                      <button v-if="!last" type="button" :class="{ active: r.decision === 'promote' }" @click="decide(r, 'promote')">{{ t('promotion.up') }}</button>
                      <button type="button" :class="{ active: r.decision === 'repeat' }" @click="decide(r, 'repeat')">{{ t('promotion.repeat') }}</button>
                      <button type="button" :class="{ active: r.decision === 'leave' }" @click="decide(r, 'leave')">{{ leaveLabel }}</button>
                    </div>
                    <span v-if="r.decision !== (r.passed ? (last ? 'leave' : 'promote') : 'repeat')" class="badge warning override">{{ t('promotion.override') }}</span>
                  </td>
                  <td>
                    <select v-if="r.decision !== 'leave'" v-model="r.class_id" :aria-label="t('promotion.newClass')" :class="{ invalid: !r.class_id }">
                      <option v-for="c in targetsOf(r)" :key="c.id" :value="c.id">{{ c.name }} · {{ c.enrolled + (seats.get(c.id) ?? 0) }}/{{ c.capacity }}{{ full(c) ? ' ⚠' : '' }}</option>
                    </select>
                    <span v-else class="muted small">—</span>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
          <div v-if="!rows.length" class="empty"><p>{{ t('grades.noStudent') }}</p></div>
        </div>
        <div class="card-foot promo-foot">
          <span class="muted small">{{ t('promotion.foot') }}</span>
          <button class="btn primary" :disabled="busy || !open.length || missing.length > 0" @click="apply">
            <AppIcon name="check" />{{ t('promotion.apply', { n: open.length - count('leave') }) }}
          </button>
        </div>
      </div>
    </template>
  </section>
  <div v-else-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
  <div v-else class="card empty">{{ t('common.loading') }}</div>
</template>

<style scoped>
.decision button { padding: .3rem .6rem; font-size: .8rem; }
.override { margin-left: .4rem; }
tr.muted td { color: var(--muted); }
select.invalid { border-color: var(--danger); }
.promo-foot { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
</style>
