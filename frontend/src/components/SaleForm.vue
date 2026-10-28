<script setup>
import { ref, computed, onMounted } from 'vue';
import AppIcon from './AppIcon.vue';
import StudentPicker from './StudentPicker.vue';
import { itemsApi, salesApi } from '../api/http';
import { money, METHODS, ITEM_CATEGORIES, label, today } from '../config/finance';

/** Point-of-sale form: buyer, cart of items, payment. Emits `saved` with the created sale. */
const emit = defineEmits(['saved', 'cancel']);

const items = ref([]);
const student = ref(null);
const walkIn = ref(false);
const buyerName = ref('');
const cart = ref([]); // [{ item, quantity }]
const pickId = ref('');
const pay = ref({ method: 'cash', reference: '', sold_at: today(), received_by: '' });
const error = ref('');
const saving = ref(false);

onMounted(async () => (items.value = await itemsApi.list({ is_active: true })));

// Items grouped by category for the <optgroup>s; out-of-stock items are shown but disabled
const groups = computed(() => ITEM_CATEGORIES.map((c) => ({ ...c, items: items.value.filter((i) => i.category === c.value) })).filter((g) => g.items.length));
const inCart = (id) => cart.value.find((l) => l.item.id === id);
const maxQty = (item) => item.stock ?? 999;

function add() {
  const item = items.value.find((i) => i.id === Number(pickId.value));
  if (!item) return;
  const line = inCart(item.id);
  if (line) line.quantity = Math.min(line.quantity + 1, maxQty(item));
  else cart.value.push({ item, quantity: 1 });
  pickId.value = '';
}
const total = computed(() => cart.value.reduce((s, l) => s + l.item.price * (Number(l.quantity) || 0), 0));
const canSubmit = computed(() => cart.value.length && (walkIn.value ? buyerName.value.trim() : student.value) && !saving.value);

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    const sale = await salesApi.create({
      student_id: walkIn.value ? null : student.value?.id,
      buyer_name: walkIn.value ? buyerName.value : null,
      lines: cart.value.map((l) => ({ item_id: l.item.id, quantity: Number(l.quantity) })),
      ...pay.value,
    });
    emit('saved', sale);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
defineExpose({ canSubmit, saving, total });
</script>

<template>
  <form id="sale-form" @submit.prevent="submit">
    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="segmented">
      <button type="button" :class="{ active: !walkIn }" @click="walkIn = false">Student</button>
      <button type="button" :class="{ active: walkIn }" @click="walkIn = true">Other buyer</button>
    </div>
    <label v-if="!walkIn" class="field"><span>Student<b class="req">*</b></span><StudentPicker v-model="student" /></label>
    <label v-else class="field"><span>Buyer name<b class="req">*</b></span><input v-model="buyerName" placeholder="e.g. parent's name" /></label>

    <h3 class="sub-title">Items</h3>
    <div class="row-actions add-line">
      <select v-model="pickId" aria-label="Item" @change="add">
        <option value="">Add an item…</option>
        <optgroup v-for="g in groups" :key="g.value" :label="g.label">
          <option v-for="i in g.items" :key="i.id" :value="i.id" :disabled="i.stock === 0">
            {{ i.name }} · {{ money(i.price) }}{{ i.stock === 0 ? ' · out of stock' : i.stock != null ? ` · ${i.stock} left` : '' }}
          </option>
        </optgroup>
      </select>
    </div>
    <table v-if="cart.length" class="table compact cart">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th><th /></tr></thead>
      <tbody>
        <tr v-for="(l, n) in cart" :key="l.item.id">
          <td class="wrap">{{ l.item.name }}<div class="muted small">{{ money(l.item.price) }} · {{ label(ITEM_CATEGORIES, l.item.category) }}</div></td>
          <td class="num"><input v-model.number="l.quantity" type="number" min="1" :max="maxQty(l.item)" step="1" class="qty-input" required /></td>
          <td class="num strong">{{ money(l.item.price * (Number(l.quantity) || 0)) }}</td>
          <td class="right"><button type="button" class="icon-btn danger" title="Remove" @click="cart.splice(n, 1)"><AppIcon name="trash" size="16" /></button></td>
        </tr>
      </tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="num">{{ money(total) }}</td><td /></tr></tfoot>
    </table>
    <p v-else class="muted small">The cart is empty.</p>

    <h3 class="sub-title">Payment</h3>
    <div class="form-grid">
      <label class="field"><span>Method</span>
        <select v-model="pay.method"><option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option></select></label>
      <label class="field"><span>Reference<b v-if="pay.method !== 'cash'" class="req">*</b></span>
        <input v-model="pay.reference" :required="pay.method !== 'cash'" :placeholder="pay.method === 'cash' ? 'Optional' : 'Transaction ID / cheque number'" /></label>
      <label class="field"><span>Date</span><input v-model="pay.sold_at" type="date" :max="today()" required /></label>
      <label class="field"><span>Received by</span><input v-model="pay.received_by" placeholder="Cashier name" /></label>
    </div>
  </form>
</template>
