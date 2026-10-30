<script setup>
import { ref, onMounted } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import { salesApi } from '../api/http';
import { money, methodLabel } from '../config/finance';
import logo from '../assets/logo.png';
import { t, fmtDate } from '../i18n';

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
const date = (d) => fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' });
const print = () => window.print();
</script>

<template>
  <section>
    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <template v-else-if="s">
      <div class="row-actions no-print" style="margin-bottom: 1rem; justify-content: flex-end">
        <RouterLink to="/finances/sales" class="btn secondary">{{ t('nav.sales') }}</RouterLink>
        <button class="btn primary" @click="print"><AppIcon name="printer" />{{ t('common.print') }}</button>
      </div>

      <article class="card receipt">
        <header class="receipt-head">
          <div class="brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></div>
          <div class="right">
            <p class="receipt-title">{{ t('receipts.salesReceipt') }}</p>
            <p class="mono strong">{{ s.receipt_number }}</p>
            <p class="muted small">{{ date(s.sold_at) }}</p>
          </div>
        </header>

        <p v-if="s.voided_at" class="void-stamp">{{ t('receipts.voidedStamp', { reason: s.void_reason }) }}</p>

        <dl class="info">
          <div><dt>{{ t('finance.buyer') }}</dt><dd>{{ s.student ?? s.buyer_name }}</dd></div>
          <div v-if="s.matricule"><dt>{{ t('fields.matricule') }}</dt><dd>{{ s.matricule }}{{ s.class_name ? ` · ${s.class_name}` : '' }}</dd></div>
          <div><dt>{{ t('common.method') }}</dt><dd>{{ methodLabel(s.method) }}</dd></div>
          <div><dt>{{ t('common.reference') }}</dt><dd>{{ s.reference ?? '—' }}</dd></div>
        </dl>

        <table class="table compact" style="margin-top: 1.25rem">
          <thead><tr><th>{{ t('finance.item') }}</th><th class="num">{{ t('receipts.unitPrice') }}</th><th class="num">{{ t('finance.qty') }}</th><th class="num">{{ t('common.amount') }}</th></tr></thead>
          <tbody>
            <tr v-for="l in s.lines" :key="l.id">
              <td>{{ l.name }}<div class="muted small mono">{{ l.code }}</div></td>
              <td class="num">{{ money(l.unit_price) }}</td><td class="num">{{ l.quantity }}</td><td class="num">{{ money(l.amount) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="receipt-amount"><span>{{ t('receipts.totalPaid') }}</span><b>{{ money(s.total) }}</b></div>

        <footer class="receipt-foot">
          <div><span class="muted small">{{ t('finance.receivedBy') }}</span><p>{{ s.received_by ?? '—' }}</p></div>
          <div class="signature"><span class="muted small">{{ t('receipts.signature') }}</span></div>
        </footer>
      </article>
    </template>
    <div v-else class="card empty">{{ t('common.loading') }}</div>
  </section>
</template>
