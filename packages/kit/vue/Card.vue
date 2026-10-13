<!-- 카드 — shadcn-vue Card 와 같은 사용법 (KRDS 토큰으로 지었다)
  <Card>
    <CardHeader>
      <CardTitle>여권 발급 신청</CardTitle>
      <CardDescription>처리 기간 4일(근무일 기준)</CardDescription>
      <CardAction>…</CardAction>
    </CardHeader>
    <CardContent>…</CardContent>
    <CardFooter>…</CardFooter>
  </Card>
  variant: outline(기본) · filled · elevated -->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: "outline" | "filled" | "elevated" }>(), { variant: "outline" });
</script>

<template>
  <div :class="['hb-card', variant !== 'outline' && `hb-card-${variant}`]"><slot /></div>
</template>
