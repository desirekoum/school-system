<script setup>
import { ref, computed, onMounted } from 'vue';
import { studentsApi, guardiansApi } from '../api/http';
import { GENDERS, STUDENT_STATUSES, RELATIONS } from '../config/options';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import StatusBadge from '../components/StatusBadge.vue';
import Avatar from '../components/Avatar.vue';
import AppIcon from '../components/AppIcon.vue';
import ReportCard from '../components/ReportCard.vue';

const props = defineProps({ id: String });

const student = ref(null);
const guardians = ref([]);
const allGuardians = ref([]);
const mode = ref('new'); // 'new' = create a guardian, 'existing' = link one (e.g. a sibling's parent)
const emptyForm = () => ({ guardian_id: '', first_name: '', last_name: '', phone: '', email: '', profession: '', address: '', relation: 'father', is_primary: false });
const form = ref(null); // null = panel closed
const error = ref('');

const label = (list, v) => list.find((o) => o.value === v)?.label ?? v ?? '—';
const date = (d) => (d ? new Date(d).toLocaleDateString() : '—');

// Guardians not already linked to this student
const linkable = computed(() => allGuardians.value.filter((g) => !guardians.value.some((x) => x.id === g.id)));

async function load() {
  [student.value, guardians.value, allGuardians.value] = await Promise.all([
    studentsApi.get(props.id), studentsApi.guardians(props.id), guardiansApi.list(),
  ]);
}
onMounted(load);

async function addGuardian() {
  error.value = '';
  const { guardian_id, relation, is_primary, ...fields } = form.value;
  const payload = mode.value === 'existing' ? { guardian_id, relation, is_primary } : { ...fields, relation, is_primary };
  try {
    await studentsApi.addGuardian(props.id, payload);
    form.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function removeGuardian(g) {
  if (!confirm(`Unlink ${g.last_name}?`)) return;
  await studentsApi.removeGuardian(props.id, g.id);
  await load();
}
</script>

<template>
  <section v-if="student">
    <PageHeader title="Student profile" :back="{ to: '/students', label: 'Students' }" />

    <div class="profile card">
      <Avatar :name="`${student.first_name} ${student.last_name}`" :src="student.photo_url" :size="72" />
      <div class="profile-main">
        <h2>{{ student.first_name }} {{ student.last_name }}</h2>
        <p class="muted">Matricule {{ student.matricule }} · Admitted {{ date(student.admission_date) }}</p>
      </div>
      <StatusBadge :value="student.status" :label="label(STUDENT_STATUSES, student.status)" />
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h2>Personal information</h2></div>
        <dl class="info">
          <div><dt>Gender</dt><dd>{{ label(GENDERS, student.gender) }}</dd></div>
          <div><dt>Date of birth</dt><dd>{{ date(student.birth_date) }}</dd></div>
          <div><dt>Place of birth</dt><dd>{{ student.birth_place ?? '—' }}</dd></div>
          <div><dt>Nationality</dt><dd>{{ student.nationality ?? '—' }}</dd></div>
          <div><dt>Phone</dt><dd>{{ student.phone ?? '—' }}</dd></div>
          <div><dt>Email</dt><dd>{{ student.email ?? '—' }}</dd></div>
          <div class="wide"><dt>Address</dt><dd>{{ student.address ?? '—' }}</dd></div>
          <div><dt>Emergency contact</dt><dd>{{ student.emergency_contact_name ?? '—' }}</dd></div>
          <div><dt>Emergency phone</dt><dd>{{ student.emergency_contact_phone ?? '—' }}</dd></div>
          <div class="wide"><dt>Previous school</dt><dd>{{ student.previous_school ?? '—' }}</dd></div>
        </dl>
      </div>

      <div class="card">
        <div class="card-header"><h2>Health</h2></div>
        <dl class="info">
          <div><dt>Blood group</dt><dd>{{ student.blood_group ?? '—' }}</dd></div>
          <div class="wide"><dt>Allergies</dt><dd>{{ student.allergies ?? '—' }}</dd></div>
          <div class="wide"><dt>Medical notes</dt><dd>{{ student.medical_notes ?? '—' }}</dd></div>
        </dl>
      </div>
    </div>

    <ReportCard :student-id="id" />

    <div class="card">
      <div class="card-header">
        <h2>Guardians</h2>
        <button class="btn secondary sm" @click="form = emptyForm()"><AppIcon name="plus" size="14" />Add guardian</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Name</th><th>Relation</th><th>Phone</th><th>Email</th><th>Profession</th><th></th></tr></thead>
          <tbody>
            <tr v-for="g in guardians" :key="g.id">
              <td>
                <div class="identity">
                  <Avatar :name="`${g.first_name ?? ''} ${g.last_name}`" />
                  <div><div class="strong">{{ g.first_name }} {{ g.last_name }}</div>
                    <span v-if="g.is_primary" class="badge info">Primary</span></div>
                </div>
              </td>
              <td>{{ label(RELATIONS, g.relation) }}</td><td>{{ g.phone ?? '—' }}</td><td>{{ g.email ?? '—' }}</td><td>{{ g.profession ?? '—' }}</td>
              <td class="right"><button class="icon-btn danger" title="Unlink" @click="removeGuardian(g)"><AppIcon name="trash" size="16" /></button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!guardians.length" class="empty"><p>No guardian yet.</p></div>
      </div>
    </div>

    <SlideOver v-if="form" title="Add guardian" @close="form = null">
      <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
      <div class="segmented">
        <button type="button" :class="{ active: mode === 'new' }" @click="mode = 'new'">New guardian</button>
        <button type="button" :class="{ active: mode === 'existing' }" @click="mode = 'existing'"><AppIcon name="link" size="14" />Existing guardian</button>
      </div>
      <form id="guardian-form" class="form-grid" @submit.prevent="addGuardian">
        <template v-if="mode === 'new'">
          <label class="field"><span>Last name<b class="req">*</b></span><input v-model="form.last_name" required /></label>
          <label class="field"><span>First name</span><input v-model="form.first_name" /></label>
          <label class="field"><span>Phone</span><input v-model="form.phone" /></label>
          <label class="field"><span>Email</span><input v-model="form.email" type="email" /></label>
          <label class="field"><span>Profession</span><input v-model="form.profession" /></label>
          <label class="field"><span>Address</span><input v-model="form.address" /></label>
        </template>
        <label v-else class="field wide">
          <span>Guardian<b class="req">*</b></span>
          <select v-model="form.guardian_id" required>
            <option value="">Choose…</option>
            <option v-for="g in linkable" :key="g.id" :value="g.id">{{ g.first_name }} {{ g.last_name }} {{ g.phone && `(${g.phone})` }}</option>
          </select>
        </label>
        <label class="field"><span>Relation</span>
          <select v-model="form.relation"><option v-for="r in RELATIONS" :key="r.value" :value="r.value">{{ r.label }}</option></select>
        </label>
        <label class="check"><input v-model="form.is_primary" type="checkbox" /> Primary guardian</label>
      </form>
      <template #footer>
        <button class="btn secondary" @click="form = null">Cancel</button>
        <button type="submit" form="guardian-form" class="btn primary">Add guardian</button>
      </template>
    </SlideOver>
  </section>
</template>
