<!-- 데이터 표 — shadcn-vue Data Table 을 KRDS 표 모양으로. 머리칸 눌러 정렬 · 행 선택 · 페이지 나눔.
  <DataTable
    caption="민원 신청 목록 — 접수번호·민원명·접수일·처리 상태로 구성"
    :columns="[{ key: 'no', header: '접수번호', align: 'center', sortable: true }, { key: 'title', header: '민원명', rowHeader: true }]"
    :data="rows" :row-key="(r) => r.no" selectable :page-size="5" v-model:selected="picked"
  >
    <template #cell-status="{ row }"><Badge>{{ row.status }}</Badge></template>
  </DataTable>
  칸 내용은 column.cell(row) 또는 #cell-<key> 슬롯으로 바꾼다. 접근성은 React 판과 같다. -->
<script setup lang="ts" generic="T">
import { computed, ref, watchEffect } from "vue";
import { useUid } from "./utils";

interface DataTableColumnVue<R> {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  width?: string;
  cell?: (row: R) => string;
  sortValue?: (row: R) => string | number;
  rowHeader?: boolean;
}

const props = withDefaults(
  defineProps<{
    columns: DataTableColumnVue<T>[];
    data: T[];
    caption: string;
    rowKey: (row: T) => string;
    rowLabel?: (row: T) => string;
    selectable?: boolean;
    selected?: string[];
    pageSize?: number;
    defaultSort?: { key: string; dir: "ascending" | "descending" };
    emptyText?: string;
  }>(),
  { pageSize: 10, emptyText: "조회된 자료가 없습니다." },
);
const emit = defineEmits<{ "update:selected": [string[]] }>();

const base = useUid("hb-dt");
const sort = ref(props.defaultSort);
const page = ref(1);
const inner = ref<string[]>([]);
const sel = computed(() => props.selected ?? inner.value);
const setSel = (keys: string[]) => {
  inner.value = keys;
  emit("update:selected", keys);
};

const valueOf = (c: DataTableColumnVue<T>, row: T): string | number => {
  if (c.sortValue) return c.sortValue(row);
  const v = (row as Record<string, unknown>)[c.key];
  return typeof v === "number" ? v : String(v ?? "");
};
const textOf = (c: DataTableColumnVue<T>, row: T) =>
  c.cell ? c.cell(row) : String((row as Record<string, unknown>)[c.key] ?? "");

const sorted = computed(() => {
  const s = sort.value;
  if (!s) return props.data;
  const col = props.columns.find((c) => c.key === s.key);
  if (!col) return props.data;
  return [...props.data].sort((a, b) => {
    const x = valueOf(col, a);
    const y = valueOf(col, b);
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko");
    return s.dir === "ascending" ? r : -r;
  });
});
const pages = computed(() => (props.pageSize > 0 ? Math.max(1, Math.ceil(sorted.value.length / props.pageSize)) : 1));
const cur = computed(() => Math.min(page.value, pages.value));
const rows = computed(() =>
  props.pageSize > 0 ? sorted.value.slice((cur.value - 1) * props.pageSize, cur.value * props.pageSize) : sorted.value,
);
const pageKeys = computed(() => rows.value.map(props.rowKey));
const pageOn = computed(() => pageKeys.value.filter((k) => sel.value.includes(k)).length);
const allEl = ref<HTMLInputElement | null>(null);
watchEffect(() => {
  if (allEl.value) allEl.value.indeterminate = pageOn.value > 0 && pageOn.value < pageKeys.value.length;
});

const headerCol = computed(() => props.columns.find((c) => c.rowHeader) ?? props.columns[0]);
const labelOf = (row: T) => (props.rowLabel ? props.rowLabel(row) : String(valueOf(headerCol.value, row)));

function toggleSort(key: string) {
  const s = sort.value;
  sort.value = s?.key === key ? { key, dir: s.dir === "ascending" ? "descending" : "ascending" } : { key, dir: "ascending" };
  page.value = 1;
}
function toggleAll() {
  const keys = pageKeys.value;
  setSel(pageOn.value === keys.length ? sel.value.filter((k) => !keys.includes(k)) : [...new Set([...sel.value, ...keys])]);
}
function toggleRow(k: string) {
  setSel(sel.value.includes(k) ? sel.value.filter((x) => x !== k) : [...sel.value, k]);
}
const live = ref("");
function go(p: number) {
  page.value = p;
  live.value = `${p}페이지 / 전체 ${pages.value}페이지`;
}
</script>

<template>
  <div class="hb-data-table">
    <div class="hb-dt-status">
      <span>
        전체 <strong>{{ data.length.toLocaleString() }}</strong>건<template v-if="selectable"> · 선택 <strong>{{ sel.length }}</strong>건</template>
      </span>
      <span class="sr-only" aria-live="polite">{{ live || (selectable ? `${sel.length}건 선택됨` : "") }}</span>
    </div>
    <div class="krds-table-wrap">
      <table class="tbl col data hb-table">
        <caption>{{ caption }}</caption>
        <colgroup>
          <col v-if="selectable" style="width: 64px" />
          <col v-for="c in columns" :key="c.key" :style="c.width ? { width: c.width } : undefined" />
        </colgroup>
        <thead>
          <tr>
            <th v-if="selectable" scope="col" class="hb-align-center hb-dt-check">
              <div class="krds-form-check medium">
                <input
                  ref="allEl"
                  type="checkbox"
                  :id="`${base}-all`"
                  :checked="pageKeys.length > 0 && pageOn === pageKeys.length"
                  :disabled="pageKeys.length === 0"
                  @change="toggleAll"
                />
                <label :for="`${base}-all`"><span class="sr-only">이 페이지 전체 선택</span></label>
              </div>
            </th>
            <th
              v-for="c in columns"
              :key="c.key"
              scope="col"
              :aria-sort="c.sortable ? (sort?.key === c.key ? sort.dir : 'none') : undefined"
            >
              <button
                v-if="c.sortable"
                type="button"
                :class="['hb-sort-btn', sort?.key === c.key && `is-${sort.dir}`]"
                @click="toggleSort(c.key)"
              >
                {{ c.header }}<span class="hb-sort-ico" aria-hidden="true" />
              </button>
              <template v-else>{{ c.header }}</template>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td :colspan="columns.length + (selectable ? 1 : 0)" class="hb-align-center hb-dt-empty">{{ emptyText }}</td>
          </tr>
          <tr
            v-for="row in rows"
            :key="rowKey(row)"
            :aria-selected="selectable ? sel.includes(rowKey(row)) : undefined"
            :class="{ 'hb-row-selected': sel.includes(rowKey(row)) }"
          >
            <td v-if="selectable" class="hb-align-center hb-dt-check">
              <div class="krds-form-check medium">
                <input
                  type="checkbox"
                  :id="`${base}-${rowKey(row)}`"
                  :checked="sel.includes(rowKey(row))"
                  @change="toggleRow(rowKey(row))"
                />
                <label :for="`${base}-${rowKey(row)}`"><span class="sr-only">{{ labelOf(row) }} 선택</span></label>
              </div>
            </td>
            <template v-for="c in columns" :key="c.key">
              <th v-if="c.rowHeader" scope="row" :class="c.align ? `hb-align-${c.align}` : undefined">
                <slot :name="`cell-${c.key}`" :row="row">{{ textOf(c, row) }}</slot>
              </th>
              <td v-else :class="c.align ? `hb-align-${c.align}` : undefined">
                <slot :name="`cell-${c.key}`" :row="row">{{ textOf(c, row) }}</slot>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <nav v-if="pages > 1" class="krds-pagination hb-dt-pages" aria-label="표 페이지">
      <button type="button" :class="['page-navi', 'prev', { disabled: cur === 1 }]" :disabled="cur === 1" @click="go(cur - 1)">
        이전
      </button>
      <div class="page-links">
        <button
          v-for="p in pages"
          :key="p"
          type="button"
          :class="['page-link', { active: p === cur }]"
          :aria-current="p === cur ? 'page' : undefined"
          @click="go(p)"
        >
          <span v-if="p === cur" class="sr-only">현재페이지 </span>{{ p }}
        </button>
      </div>
      <button type="button" :class="['page-navi', 'next', { disabled: cur === pages }]" :disabled="cur === pages" @click="go(cur + 1)">
        다음
      </button>
    </nav>
  </div>
</template>
