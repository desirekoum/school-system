<script setup>
import { ref, onMounted } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import { salesApi } from '../api/http';
import { money, methodLabel } from '../config/finance';
import logo from '../assets/logo.png';

/** Printable sales receipt. */
const props = defineProps({ id: String });
const s = ref(null);
const error = ref('');
onMounted(async () => {
  try {
    s.value = await salesApi.get(props.id);
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
    <template v-else-if="s">
      <div class="row-actions no-print" style="margin-bottom: 1rem; justify-content: flex-end">
        <RouterLink to="/finances/sales" class="btn secondary">Sales</RouterLink>
        <button class="btn primary" @click="print"><AppIcon name="printer" />Print</button>
      </div>

      <article class="card receipt">
        <header class="receipt-head">
          <div class="brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></div>
          <div class="right">
            <p class="receipt-title">Sales receipt</p>
            <p class="mono strong">{{ s.receipt_number }}</p>
            <p class="muted small">{{ date(s.sold_at) }}</p>
          </div>
        </header>

        <p v-if="s.voided_at" class="void-stamp">VOIDED · {{ s.void_reason }}</p>

        <dl class="info">
          <div><dt>Buyer</dt><dd>{{ s.student ?? s.buyer_name }}</dd></div>
          <div v-if="s.matricule"><dt>Matricule</dt><dd>{{ s.matricule }}{{ s.class_name ? ` · ${s.class_name}` : '' }}</dd></div>
          <div><dt>Method</dt><dd>{{ methodLabel(s.method) }}</dd></div>
          <div><dt>Reference</dt><dd>{{ s.reference ?? '—' }}</dd></div>
        </dl>

        <table class="table compact" style="margin-top: 1.25rem">
          <thead><tr><th>Item</th><th class="num">Unit price</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
          <tbody>
            <tr v-for="l in s.lines" :key="l.id">
              <td>{{ l.name }}<div class="muted small mono">{{ l.code }}</div></td>
              <td class="num">{{ money(l.unit_price) }}</td><td class="num">{{ l.quantity }}</td><td class="num">{{ money(l.amount) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="receipt-amount"><span>Total paid</span><b>{{ money(s.total) }}</b></div>

        <footer class="receipt-foot">
          <div><span class="muted small">Received by</span><p>{{ s.received_by ?? '—' }}</p></div>
          <div class="signature"><span class="muted small">Signature &amp; stamp</span></div>
        </footer>
      </article>
    </template>
    <div v-else class="card empty">Loading…</div>
  </section>
</template>
