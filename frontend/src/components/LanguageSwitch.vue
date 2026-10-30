<script setup>
import { LOCALES, locale, setLocale, t } from '../i18n';

// FR | EN toggle: the choice is saved in the browser and applied at once (no reload)
</script>

<template>
  <div class="lang-switch" role="group" :aria-label="t('common.language')">
    <button v-for="l in LOCALES" :key="l.code" type="button" :class="{ on: locale === l.code }" :aria-pressed="locale === l.code"
            :title="l.label" :lang="l.code" @click="setLocale(l.code)">{{ l.code.toUpperCase() }}</button>
  </div>
</template>
