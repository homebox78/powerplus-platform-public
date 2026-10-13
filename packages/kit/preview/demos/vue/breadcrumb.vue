<script setup lang="ts">
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage } from "../../../vue";
</script>

<template>
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem home><BreadcrumbLink href="#">홈</BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbItem><BreadcrumbLink href="#">민원 안내</BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbItem><BreadcrumbLink href="#">민원 신청</BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbItem><BreadcrumbPage>여권 발급 신청</BreadcrumbPage></BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
</template>
