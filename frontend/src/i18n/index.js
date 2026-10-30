import { computed } from 'vue';
import { createI18n } from 'vue-i18n';

/**
 * FR/EN translations. Each file in ./locales holds one area of the app with both languages side by side
 * ({ en: {...}, fr: {...} }), so a missing translation is easy to spot. Keys are namespaced by file name:
 * locales/students.js → t('students.title').
 */
export const LOCALES = [
  { code: 'fr', label: 'Français', tag: 'fr-FR' },
  { code: 'en', label: 'English', tag: 'en-GB' },
];
const KEY = 'schooldoc.locale';

const messages = { en: {}, fr: {} };
for (const [path, mod] of Object.entries(import.meta.glob('./locales/*.js', { eager: true }))) {
  const ns = path.match(/([\w-]+)\.js$/)[1];
  for (const code of Object.keys(messages)) messages[code][ns] = mod.default[code];
}

// Saved choice first, else the browser language (French for any fr-*), else English
function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LOCALES.some((l) => l.code === saved)) return saved;
  } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

// legacy: false = Composition API mode; the global locale is a ref, so every t() re-renders on change
export const i18n = createI18n({ legacy: false, locale: initial(), fallbackLocale: 'en', messages, missingWarn: false, fallbackWarn: false });
export const { t, te } = i18n.global;
export const locale = i18n.global.locale;
// BCP 47 tag for Intl / toLocale*: dates and numbers follow the chosen language
export const localeTag = computed(() => LOCALES.find((l) => l.code === locale.value)?.tag ?? 'en-GB');

export function setLocale(code) {
  locale.value = code;
  document.documentElement.lang = code;
  try { localStorage.setItem(KEY, code); } catch { /* storage blocked */ }
}
document.documentElement.lang = locale.value;

// Formatting helpers bound to the current language
export const fmtDate = (value, opts = {}) => {
  if (!value) return '—';
  const iso = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  // A bare 'YYYY-MM-DD' is a calendar date: read and print it in UTC so no time zone shifts the day
  return new Date(iso ? `${value}T00:00:00Z` : value).toLocaleDateString(localeTag.value, iso ? { timeZone: 'UTC', ...opts } : opts);
};
export const fmtDateTime = (value) => (value ? new Date(value).toLocaleString(localeTag.value, { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString(localeTag.value));
