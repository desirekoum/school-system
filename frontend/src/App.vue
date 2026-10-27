<script setup>
const links = [
  ['/students', 'Students'],
  ['/registrations', 'Registrations'],
  ['/teachers', 'Teachers'],
  ['/classes', 'Classes'],
  ['/courses', 'Courses'],
];
</script>

<template>
  <nav>
    <strong>SchoolDoc</strong>
    <RouterLink v-for="[to, label] in links" :key="to" :to="to">{{ label }}</RouterLink>
  </nav>
  <main><RouterView /></main>
</template>
