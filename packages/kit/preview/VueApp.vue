<!-- 부품 카탈로그(Vue) — React 판과 같은 구성. 목록은 demos/registry.ts(자동 생성). -->
<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import { Button } from "../vue";
import { SKINS, STYLES, applySkin, applyStyle } from "./skins";
import { GROUPS, METAS } from "./demos/registry";
import { VUE_DEMOS } from "./demos/vue";

const SRC: Record<string, string> = { krds: "KRDS", shadcn: "shadcn", both: "KRDS·shadcn" };
const PARAMS = new URLSearchParams(location.search);
const EMBED = PARAMS.get("embed") === "1"; // 사이트 /kit 안: 목록은 사이트 사이드바가 맡는다
const ONLY = PARAMS.get("c") || ""; // 그 부품만
const BARE = PARAMS.get("bare") === "1"; // 부품 하나만 — powerGuide 부품 문서의 미리보기 칸
const onlyTitle = METAS.find((m) => m.id === ONLY)?.title;
const skin = ref(SKINS[0].id);
const look = ref<string>(STYLES[0].id);
watch(look, (v) => applyStyle(v), { immediate: true });
const q = ref("");
const apply = () => applySkin(document.querySelector<HTMLElement>(".hb-kit")!, SKINS.find((s) => s.id === skin.value)!);
onMounted(apply);
watch(skin, apply);
const shown = computed(() => METAS.filter((m) => (!ONLY || m.id === ONLY) && (!q.value || m.title.includes(q.value) || m.id.includes(q.value.toLowerCase()))));
const groups = computed(() =>
  GROUPS.map(([g, label]) => ({ g, label, items: shown.value.filter((m) => m.group === g) })).filter((x) => x.items.length),
);
</script>

<template>
  <div :class="(EMBED ? 'pv-shell pv-embed' : 'pv-shell') + (BARE ? ' pv-bare' : '') + (PARAMS.get('wide') === '1' ? ' pv-wide' : '')">
    <aside v-if="!EMBED" class="pv-nav" aria-label="부품 목록">
      <p class="pv-brand">powerGuide 키트 <small>Vue</small></p>
      <label class="pv-search">
        <span class="sr-only">부품 찾기</span>
        <input v-model="q" type="search" placeholder="부품 찾기" />
      </label>
      <p class="pv-count">{{ shown.length }} / {{ METAS.length }}종</p>
      <div v-for="grp in groups" :key="grp.g" class="pv-group">
        <p class="pv-group-title">{{ grp.label }}</p>
        <ul>
          <li v-for="m in grp.items" :key="m.id"><a :href="`#${m.id}`">{{ m.title }}</a></li>
        </ul>
      </div>
    </aside>
    <main class="pv-main">
      <header class="pv-head">
        <h1>{{ onlyTitle ?? "부품 미리보기" }}</h1>
        <div class="pv-tools">
          <span id="pv-look">스타일</span>
          <div role="group" aria-labelledby="pv-look" class="pv-row pv-row-flat">
            <Button
              v-for="s in STYLES"
              :key="s.id"
              size="small"
              :variant="look === s.id ? 'primary' : 'tertiary'"
              :aria-pressed="look === s.id"
              @click="look = s.id"
            >{{ s.label }}</Button>
          </div>
          <span id="pv-skin">스킨</span>
          <div role="group" aria-labelledby="pv-skin" class="pv-row pv-row-flat">
            <Button
              v-for="s in SKINS"
              :key="s.id"
              size="small"
              :variant="skin === s.id ? 'primary' : 'tertiary'"
              :aria-pressed="skin === s.id"
              @click="skin = s.id"
            >{{ s.label }}</Button>
          </div>
        </div>
      </header>
      <section v-for="m in shown" :id="m.id" :key="m.id" class="pv-sec" :aria-labelledby="`pv-${m.id}`">
        <h2 :id="`pv-${m.id}`">{{ m.title }} <span class="pv-src">{{ SRC[m.source] }}</span></h2>
        <p v-if="m.note" class="pv-note">{{ m.note }}</p>
        <div class="pv-demo" :data-demo="m.id"><component :is="VUE_DEMOS[m.id]" /></div>
      </section>
      <footer class="pv-foot">
        본 저작물은 행정안전부에서 2024년 작성하여 공공누리 제1유형으로 개방한 ‘범정부 UI/UX 디자인시스템(KRDS)’을 이용하였으며,
        해당 저작물은 ‘KRDS 디자인시스템 홈페이지(https://www.krds.go.kr)’에서 무료로 다운받으실 수 있습니다.
      </footer>
    </main>
  </div>
</template>
