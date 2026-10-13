<script setup lang="ts">
import { AlertDialogTitle as Inner } from "reka-ui";
</script>

<template>
  <Inner as="h2" class="modal-title"><slot /></Inner>
</template>
