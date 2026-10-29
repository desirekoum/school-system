<script setup>
import { ref, computed, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import StatusBadge from './StatusBadge.vue';
import { financesApi } from '../api/http';
import { money, METHODS, methodLabel, PAYMENT_STATUSES, PLAN_STATUSES, label, schedule, today } from '../config/finance';
import { useAuth } from '../composables/useAuth';

const { can } = useAuth();

/**
 * Tuition account of one registration: balance, payment entry, instalment plan, payment history.
 * Emits `changed` after any write so the parent list can refresh.
 */
const props = defineProps({ registrationId: { type: [Number, String], required: true } });
const emit = defineEmits(['changed']);

const acc = ref(null);
const error = ref('');
const notice = ref(null); // { text, receiptId }
const busy = ref(false);

async function load() {
  error.value = '';
  try {
    acc.value = await financesApi.account(props.registrationId);
  } catch (e) {
    error.value = e.message;
  }
}

async function run(fn, success) {
  busy.value = true;
  error.value = '';
  try {
    const out = await fn();
    notice.value = success ? success(out) : null;
    await load();
    emit('changed');
    return true;
  } catch (e) {
    error.value = e.message;
    return false;
  } finally {
    busy.value = false;
  }
}

const open = computed(() => acc.value && acc.value.status !== 'cancelled' && acc.value.balance > 0);
const pct = computed(() => (acc.value?.fee ? Math.min(100, Math.round((acc.value.paid / acc.value.fee) * 100)) : 100));
// End of the school year from its name ("2026-2027" → 2027-06-30), used to space instalments
const yearEnd = computed(() => (acc.value ? `${acc.value.academic_year.slice(5)}-06-30` : undefined));

// ---------- Payment ----------
// Suggested amount: what is due now on an approved plan (overdue + next instalment), else the balance
const suggested = computed(() => {
  const a = acc.value;
  if (!a) return 0;
  const next = a.plan?.status === 'approved' && a.plan.instalments.find((i) => i.status !== 'paid' && i.status !== 'overdue');
  return Math.min(a.balance, a.overdue + (next ? next.amount - next.paid : 0)) || a.balance;
});
const blankPayment = () => ({ amount: suggested.value, method: 'cash', reference: '', paid_at: today(), received_by: '', notes: '' });
const payment = ref(null);
watch(acc, (a, before) => { if (!before || before.id !== a.id || !payment.value) payment.value = blankPayment(); });

const pay = () => run(
  () => financesApi.pay({ ...payment.value, registration_id: props.registrationId, amount: Number(payment.value.amount) }),
  (p) => { payment.value = null; return { text: `Payment of ${money(p.amount)} recorded · receipt ${p.receipt_number}.`, receiptId: p.id }; },
);
const voidPayment = (p) => {
  const reason = prompt(`Void receipt ${p.receipt_number} (${money(p.amount)})? Give a reason:`);
  if (reason?.trim()) run(() => financesApi.voidPayment(p.id, reason), () => ({ text: `Receipt ${p.receipt_number} voided.` }));
};

// ---------- Instalment plan ----------
const planForm = ref(null); // { count, instalments, reason }
function openPlanForm() {
  const existing = acc.value.plan;
  const instalments = existing ? existing.instalments.map(({ due_date, amount }) => ({ due_date, amount })) : schedule(acc.value.fee, 3, yearEnd.value);
  planForm.value = { count: instalments.length, instalments, reason: existing?.reason ?? '' };
}
const resplit = () => (planForm.value.instalments = schedule(acc.value.fee, planForm.value.count, yearEnd.value));
const planTotal = computed(() => planForm.value?.instalments.reduce((s, i) => s + Number(i.amount || 0), 0) ?? 0);

const submitPlan = () => run(
  () => financesApi.requestPlan(props.registrationId, {
    reason: planForm.value.reason,
    instalments: planForm.value.instalments.map((i) => ({ due_date: i.due_date, amount: Number(i.amount) })),
  }),
  () => { planForm.value = null; return { text: 'Instalment plan requested. It applies once approved.' }; },
);
const decide = (approve) => run(
  () => (approve ? financesApi.approvePlan(acc.value.plan.id) : financesApi.rejectPlan(acc.value.plan.id)),
  () => ({ text: approve ? 'Instalment plan approved.' : 'Instalment plan rejected.' }),
);
const removePlan = () => confirm('Remove this instalment plan?') && run(() => financesApi.removePlan(props.registrationId));

const receiptUrl = (id) => `/finances/receipts/${id}`;

// Declared last: the immediate run uses planForm, which must already exist
watch(() => props.registrationId, () => { notice.value = null; planForm.value = null; load(); }, { immediate: true });
</script>

<template>
  <div v-if="error && !acc" class="alert"><AppIcon name="alert" />{{ error }}</div>
  <div v-else-if="!acc" class="empty">Loading…</div>

  <div v-else class="account">
    <div class="account-head">
      <div>
        <RouterLink :to="`/students/${acc.student_id}`" class="strong link">{{ acc.student }}</RouterLink>
        <p class="muted small">{{ acc.matricule }} · {{ acc.class_name }} · {{ acc.academic_year }}</p>
      </div>
      <StatusBadge :value="acc.status" :label="acc.status === 'pending' ? 'Awaiting payment' : undefined" />
    </div>

    <div class="money-grid">
      <div><span class="muted small">Tuition</span><b>{{ money(acc.fee) }}</b></div>
      <div><span class="muted small">Paid</span><b class="score-pass">{{ money(acc.paid) }}</b></div>
      <div><span class="muted small">Balance</span><b :class="{ 'score-fail': acc.balance > 0 }">{{ money(acc.balance) }}</b></div>
    </div>
    <div class="progress" :title="`${pct}% paid`"><span class="paid-bar" :style="{ width: pct + '%' }" /></div>
    <p class="muted small" style="margin-top: .4rem">
      {{ pct }}% paid · <StatusBadge :value="acc.payment_status" :label="label(PAYMENT_STATUSES, acc.payment_status)" />
      <template v-if="acc.overdue"> · <b class="score-fail">{{ money(acc.overdue) }} overdue</b></template>
    </p>

    <div v-if="error" class="alert" style="margin-top: 1rem"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="notice" class="alert success" style="margin-top: 1rem">
      <AppIcon name="check" />{{ notice.text }}
      <a v-if="notice.receiptId" :href="receiptUrl(notice.receiptId)" target="_blank" class="link" style="margin-left: auto">Print receipt</a>
    </div>

    <!-- Record a payment -->
    <section v-if="open" class="account-section">
      <h3>Record a payment</h3>
      <button v-if="!payment && can('payments:write')" class="btn primary sm" @click="payment = blankPayment()"><AppIcon name="plus" size="14" />New payment</button>
      <form v-else class="form-grid" @submit.prevent="pay">
        <label class="field"><span>Amount (FCFA)<b class="req">*</b></span>
          <input v-model.number="payment.amount" type="number" min="1" :max="acc.balance" step="1" required /></label>
        <label class="field"><span>Date<b class="req">*</b></span>
          <input v-model="payment.paid_at" type="date" :max="today()" required /></label>
        <label class="field"><span>Method</span>
          <select v-model="payment.method"><option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option></select></label>
        <label class="field"><span>Reference<b v-if="payment.method !== 'cash'" class="req">*</b></span>
          <input v-model="payment.reference" :required="payment.method !== 'cash'"
                 :placeholder="{ mobile_money: 'Transaction ID', bank_transfer: 'Transfer reference', cheque: 'Cheque number' }[payment.method] ?? 'Optional'" /></label>
        <label class="field"><span>Received by</span><input v-model="payment.received_by" placeholder="Cashier name" /></label>
        <label class="field"><span>Notes</span><input v-model="payment.notes" /></label>
        <div class="wide row-actions">
          <button type="submit" class="btn primary" :disabled="busy"><AppIcon name="save" size="16" />Record {{ money(Number(payment.amount) || 0) }}</button>
          <button type="button" class="btn secondary" @click="payment.amount = acc.balance">Pay full balance</button>
        </div>
      </form>
    </section>

    <!-- Instalment plan -->
    <section class="account-section">
      <div class="section-head">
        <h3>Instalment plan</h3>
        <div v-if="acc.plan && !planForm" class="row-actions">
          <StatusBadge :value="acc.plan.status" :label="label(PLAN_STATUSES, acc.plan.status)" />
          <template v-if="acc.plan.status === 'requested' && can('plans:approve')">
            <button class="btn success sm" :disabled="busy" @click="decide(true)"><AppIcon name="check" size="14" />Approve</button>
            <button class="btn secondary sm" :disabled="busy" @click="decide(false)"><AppIcon name="ban" size="14" />Reject</button>
          </template>
        </div>
      </div>

      <template v-if="!planForm">
        <template v-if="acc.plan">
          <p v-if="acc.plan.reason" class="muted small">Reason: {{ acc.plan.reason }}</p>
          <table class="table compact">
            <thead><tr><th>#</th><th>Due</th><th class="num">Amount</th><th class="num">Paid</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="i in acc.plan.instalments" :key="i.id">
                <td>{{ i.number }}</td><td>{{ new Date(i.due_date).toLocaleDateString() }}</td>
                <td class="num">{{ money(i.amount) }}</td><td class="num">{{ money(i.paid) }}</td>
                <td><StatusBadge :value="acc.plan.status === 'approved' ? i.status : 'upcoming'" :label="acc.plan.status === 'approved' ? undefined : 'not active'" /></td>
              </tr>
            </tbody>
          </table>
          <div v-if="open && can('plans:request')" class="row-actions" style="margin-top: .75rem">
            <button class="btn secondary sm" @click="openPlanForm"><AppIcon name="edit" size="14" />{{ acc.plan.status === 'rejected' ? 'New request' : 'Change plan' }}</button>
            <button class="icon-btn danger" title="Remove plan" @click="removePlan"><AppIcon name="trash" size="16" /></button>
          </div>
        </template>
        <template v-else-if="open">
          <p class="muted small">The family pays the full tuition at once, unless an instalment plan is requested and approved.</p>
          <button v-if="can('plans:request')" class="btn secondary sm" @click="openPlanForm"><AppIcon name="calendar" size="14" />Request an instalment plan</button>
        </template>
        <p v-else class="muted small">No instalment plan.</p>
      </template>

      <form v-else @submit.prevent="submitPlan">
        <div class="form-grid">
          <label class="field"><span>Number of instalments</span>
            <select v-model.number="planForm.count" @change="resplit"><option v-for="n in [2, 3, 4, 5, 6]" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="field"><span>Reason</span><input v-model="planForm.reason" placeholder="Optional" /></label>
        </div>
        <table class="table compact" style="margin-top: .75rem">
          <thead><tr><th>#</th><th>Due date</th><th class="num">Amount (FCFA)</th></tr></thead>
          <tbody>
            <tr v-for="(i, n) in planForm.instalments" :key="n">
              <td>{{ n + 1 }}</td>
              <td><input v-model="i.due_date" type="date" required /></td>
              <td class="num"><input v-model.number="i.amount" type="number" min="1" step="1" required class="amount-input" /></td>
            </tr>
          </tbody>
          <tfoot><tr><td colspan="2">Total</td>
            <td class="num" :class="planTotal === acc.fee ? 'score-pass' : 'score-fail'">{{ money(planTotal) }} / {{ money(acc.fee) }}</td></tr></tfoot>
        </table>
        <div class="row-actions" style="margin-top: .75rem">
          <button type="submit" class="btn primary sm" :disabled="busy || planTotal !== acc.fee">Submit request</button>
          <button type="button" class="btn secondary sm" @click="planForm = null">Cancel</button>
        </div>
      </form>
    </section>

    <!-- History -->
    <section class="account-section">
      <h3>Payments</h3>
      <p v-if="!acc.payments.length" class="muted small">No payment yet.</p>
      <table v-else class="table compact">
        <thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th class="num">Amount</th><th /></tr></thead>
        <tbody>
          <tr v-for="p in acc.payments" :key="p.id" :class="{ voided: p.voided_at }">
            <td><span class="mono">{{ p.receipt_number }}</span><div v-if="p.voided_at" class="muted small">Voided: {{ p.void_reason }}</div></td>
            <td>{{ new Date(p.paid_at).toLocaleDateString() }}</td>
            <td>{{ methodLabel(p.method) }}<div v-if="p.reference" class="muted small">{{ p.reference }}</div></td>
            <td class="num strong">{{ money(p.amount) }}</td>
            <td class="right">
              <div class="row-actions">
                <a :href="receiptUrl(p.id)" target="_blank" class="icon-btn" title="Print receipt"><AppIcon name="printer" size="16" /></a>
                <button v-if="!p.voided_at && can('payments:void')" class="icon-btn danger" title="Void payment" @click="voidPayment(p)"><AppIcon name="ban" size="16" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
