<script setup>
import { ref, onMounted } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import { financesApi } from '../api/http';
import { money, methodLabel } from '../config/finance';
import logo from '../assets/logo.png';

/** Printable payment receipt (opened in a new tab from the account panel or the journal). */
const props = defineProps({ id: String });
const p = ref(null);
const error = ref('');
onMounted(async () => {
  try {
    p.value = await financesApi.payment(props.id);
  } catch (e) {
    error.value = e.message;
  }
});
const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const print = () => window.print();
</script>

<template>
  <section>
    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <template v-else-if="p">
      <div class="row-actions no-print" style="margin-bottom: 1rem; justify-content: flex-end">
        <RouterLink to="/finances/payments" class="btn secondary">Payments</RouterLink>
        <button class="btn primary" @click="print"><AppIcon name="printer" />Print</button>
      </div>

      <article class="card receipt" :class="{ voided: p.voided_at }">
        <header class="receipt-head">
          <div class="brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></div>
          <div class="right">
            <p class="receipt-title">Payment receipt</p>
            <p class="mono strong">{{ p.receipt_number }}</p>
            <p class="muted small">{{ date(p.paid_at) }}</p>
          </div>
        </header>

        <p v-if="p.voided_at" class="void-stamp">VOIDED · {{ p.void_reason }}</p>

        <dl class="info">
          <div><dt>Student</dt><dd>{{ p.last_name }} {{ p.first_name }}</dd></div>
          <div><dt>Matricule</dt><dd>{{ p.matricule }}</dd></div>
          <div><dt>Class</dt><dd>{{ p.class_name }}</dd></div>
          <div><dt>Academic year</dt><dd>{{ p.academic_year }}</dd></div>
          <div><dt>Method</dt><dd>{{ methodLabel(p.method) }}</dd></div>
          <div><dt>Reference</dt><dd>{{ p.reference ?? '—' }}</dd></div>
        </dl>

        <div class="receipt-amount">
          <span>Amount received</span>
          <b>{{ money(p.amount) }}</b>
        </div>

        <table class="table compact">
          <tbody>
            <tr><td>Tuition fee</td><td class="num">{{ money(p.fee) }}</td></tr>
            <tr><td>Total paid to date</td><td class="num">{{ money(p.total_paid) }}</td></tr>
            <tr><td class="strong">Remaining balance</td><td class="num strong">{{ money(p.balance) }}</td></tr>
          </tbody>
        </table>

        <footer class="receipt-foot">
          <div><span class="muted small">Received by</span><p>{{ p.received_by ?? '—' }}</p></div>
          <div class="signature"><span class="muted small">Signature &amp; stamp</span></div>
        </footer>
        <p v-if="p.notes" class="muted small">Note: {{ p.notes }}</p>
      </article>
    </template>
    <div v-else class="card empty">Loading…</div>
  </section>
</template>
