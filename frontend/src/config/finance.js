import { translated } from './options';

// Amounts are whole FCFA (XAF has no cents). Intl formats "150 000 FCFA" with French grouping.
const fcfa = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const money = (n) => (n == null ? '—' : `${fcfa.format(n)} FCFA`);
export const compact = (n) => (n >= 1e6 ? `${fcfa.format(Math.round(n / 1e5) / 10)} M` : n >= 1e3 ? `${fcfa.format(Math.round(n / 1e3))} k` : fcfa.format(n ?? 0));

export const METHODS = translated('method', ['cash', 'mobile_money', 'bank_transfer', 'cheque']);
export const methodLabel = (v) => METHODS.find((m) => m.value === v)?.label ?? v;

export const PAYMENT_STATUSES = translated('payment', ['unpaid', 'partial', 'paid']);
export const PLAN_STATUSES = translated('plan', ['requested', 'approved', 'rejected']);
export const label = (list, v) => list.find((x) => x.value === v)?.label ?? v;

const today = () => new Date().toISOString().slice(0, 10);
export { today };

/**
 * Default schedule for n instalments: equal parts rounded to 500 FCFA (the last one takes the
 * remainder), the first due today, then evenly spaced until `until` (end of the school year).
 */
export function schedule(fee, n, until) {
  const part = Math.floor(fee / n / 500) * 500 || Math.floor(fee / n);
  const start = Date.parse(today());
  const end = Math.max(Date.parse(until ?? today()), start + (n - 1) * 30 * 86400000);
  const step = (end - start) / Math.max(1, n - 1) / 1.25; // finish well before the end of the year
  return Array.from({ length: n }, (_, i) => ({
    due_date: new Date(start + i * step).toISOString().slice(0, 10),
    amount: i < n - 1 ? part : fee - part * (n - 1),
  }));
}

export const ITEM_CATEGORIES = translated('itemCategory', ['uniform', 'books', 'supplies', 'documents', 'services', 'other']);
export const EXPENSE_CATEGORIES = translated('expenseCategory', ['stock', 'supplies', 'furniture', 'equipment', 'maintenance', 'utilities', 'transport', 'events', 'other']);
export const shortCategory = (v) => label(EXPENSE_CATEGORIES, v).replace(/ \(.*\)$/, '');
