<script setup>
import { ref, onMounted } from 'vue';
import AppIcon from './AppIcon.vue';
import StatusBadge from './StatusBadge.vue';
import SlideOver from './SlideOver.vue';
import AccountPanel from './AccountPanel.vue';
import { financesApi } from '../api/http';
import { money, PAYMENT_STATUSES, label } from '../config/finance';

/** Tuition accounts of a student (one per registration / academic year). */
const props = defineProps({ studentId: { type: [String, Number], required: true } });
const accounts = ref([]);
const open = ref(null);
const load = async () => (accounts.value = await financesApi.accounts({ student_id: props.studentId }));
onMounted(load);
</script>

<template>
  <div class="card">
    <div class="card-header"><h2>Tuition</h2></div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Year</th><th>Class</th><th class="num">Tuition</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th /></tr></thead>
        <tbody>
          <tr v-for="a in accounts" :key="a.id">
            <td>{{ a.academic_year }}</td><td>{{ a.class_name }}</td>
            <td class="num">{{ money(a.fee) }}</td><td class="num">{{ money(a.paid) }}</td>
            <td class="num"><b :class="{ 'score-fail': a.balance > 0 }">{{ money(a.balance) }}</b>
              <div v-if="a.overdue" class="small score-fail">{{ money(a.overdue) }} overdue</div></td>
            <td><StatusBadge :value="a.status === 'cancelled' ? 'cancelled' : a.payment_status" :label="a.status === 'cancelled' ? undefined : label(PAYMENT_STATUSES, a.payment_status)" /></td>
            <td class="right"><button class="btn secondary sm" @click="open = a.id"><AppIcon name="wallet" size="14" />Account</button></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!accounts.length" class="empty"><p>No registration, so no tuition yet.</p></div>
    </div>
    <SlideOver v-if="open" title="Tuition account" @close="open = null">
      <AccountPanel :registration-id="open" @changed="load" />
    </SlideOver>
  </div>
</template>
