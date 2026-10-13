<!-- 브레드크럼 — KRDS 「브레드크럼」 · shadcn-vue Breadcrumb 과 같은 사용법
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem home><BreadcrumbLink href="/">홈</BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbItem><BreadcrumbPage>여권 발급</BreadcrumbPage></BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
  구분 화살표는 KRDS CSS 가 그린다. 현재 페이지는 aria-current="page". -->
<script setup lang="ts">
withDefaults(defineProps<{ ariaLabel?: string }>(), { ariaLabel: "현재 경로" });
</script>

<template>
  <nav :aria-label="ariaLabel" class="krds-breadcrumb-wrap"><slot /></nav>
</template>
