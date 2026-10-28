<script setup>
import { ref, computed, onMounted } from 'vue';
import { studentsApi, guardiansApi } from '../api/http';
import { GENDERS, STUDENT_STATUSES, RELATIONS } from '../config/options';

const props = defineProps({ id: String });

const student = ref(null);
const guardians = ref([]);
const allGuardians = ref([]);
const mode = ref('new'); // 'new' = create a guardian, 'existing' = link one (e.g. a sibling's parent)
const emptyForm = () => ({ guardian_id: '', first_name: '', last_name: '', phone: '', email: '', profession: '', address: '', relation: 'father', is_primary: false });
const form = ref(emptyForm());
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
    form.value = emptyForm();
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
    <RouterLink to="/students">← Students</RouterLink>
    <h1>{{ student.last_name }} {{ student.first_name }} <small>{{ student.matricule }} · {{ label(STUDENT_STATUSES, student.status) }}</small></h1>
    <p v-if="error" class="error">{{ error }}</p>

    <dl class="card info">
      <div><dt>Gender</dt><dd>{{ label(GENDERS, student.gender) }}</dd></div>
      <div><dt>Born</dt><dd>{{ date(student.birth_date) }} {{ student.birth_place && `in ${student.birth_place}` }}</dd></div>
      <div><dt>Nationality</dt><dd>{{ student.nationality ?? '—' }}</dd></div>
      <div><dt>Phone / email</dt><dd>{{ student.phone ?? '—' }} · {{ student.email ?? '—' }}</dd></div>
      <div><dt>Address</dt><dd>{{ student.address ?? '—' }}</dd></div>
      <div><dt>Emergency contact</dt><dd>{{ student.emergency_contact_name ?? '—' }} {{ student.emergency_contact_phone }}</dd></div>
      <div><dt>Admitted</dt><dd>{{ date(student.admission_date) }}</dd></div>
      <div><dt>Previous school</dt><dd>{{ student.previous_school ?? '—' }}</dd></div>
      <div><dt>Blood group</dt><dd>{{ student.blood_group ?? '—' }}</dd></div>
      <div><dt>Allergies</dt><dd>{{ student.allergies ?? '—' }}</dd></div>
      <div><dt>Medical notes</dt><dd>{{ student.medical_notes ?? '—' }}</dd></div>
    </dl>

    <h2>Guardians</h2>
    <table class="card">
      <thead><tr><th>Name</th><th>Relation</th><th>Phone</th><th>Email</th><th>Profession</th><th></th></tr></thead>
      <tbody>
        <tr v-for="g in guardians" :key="g.id">
          <td>{{ g.first_name }} {{ g.last_name }} <span v-if="g.is_primary" class="badge confirmed">primary</span></td>
          <td>{{ label(RELATIONS, g.relation) }}</td><td>{{ g.phone ?? '—' }}</td><td>{{ g.email ?? '—' }}</td><td>{{ g.profession ?? '—' }}</td>
          <td class="actions"><button class="danger" @click="removeGuardian(g)">Unlink</button></td>
        </tr>
        <tr v-if="!guardians.length"><td colspan="6">No guardian yet.</td></tr>
      </tbody>
    </table>

    <form class="card form-wrap" @submit.prevent="addGuardian">
      <div class="row">
        <label class="row"><input v-model="mode" type="radio" value="new" /> New guardian</label>
        <label class="row"><input v-model="mode" type="radio" value="existing" /> Existing guardian</label>
      </div>
      <fieldset class="form">
        <template v-if="mode === 'new'">
          <label><span>Last name *</span><input v-model="form.last_name" required /></label>
          <label><span>First name</span><input v-model="form.first_name" /></label>
          <label><span>Phone</span><input v-model="form.phone" /></label>
          <label><span>Email</span><input v-model="form.email" type="email" /></label>
          <label><span>Profession</span><input v-model="form.profession" /></label>
          <label><span>Address</span><input v-model="form.address" /></label>
        </template>
        <label v-else>
          <span>Guardian *</span>
          <select v-model="form.guardian_id" required>
            <option value="">Choose…</option>
            <option v-for="g in linkable" :key="g.id" :value="g.id">{{ g.first_name }} {{ g.last_name }} {{ g.phone && `(${g.phone})` }}</option>
          </select>
        </label>
        <label><span>Relation</span>
          <select v-model="form.relation"><option v-for="r in RELATIONS" :key="r.value" :value="r.value">{{ r.label }}</option></select>
        </label>
        <label class="row"><input v-model="form.is_primary" type="checkbox" /> Primary guardian</label>
      </fieldset>
      <button type="submit">Add guardian</button>
    </form>
  </section>
</template>
