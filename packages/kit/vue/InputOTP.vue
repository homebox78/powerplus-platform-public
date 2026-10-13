<!-- 인증번호 입력 — shadcn-vue InputOTP 와 비슷한 사용법 (칸 모양은 KRDS 입력 칸)
  <InputOTP v-model="code" :length="6" aria-label="휴대전화 인증번호" @complete="확인" />
  한 칸에 한 글자, 입력하면 다음 칸·지우면 앞 칸, ←→ 이동, 붙여넣기는 칸마다 나눠 채움. -->
<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    length?: number;
    pattern?: "digits" | "alphanumeric";
    separatorAfter?: number;
    size?: "small" | "medium" | "large";
    disabled?: boolean;
    invalid?: boolean;
    ariaLabel?: string;
    ariaDescribedby?: string;
  }>(),
  { length: 6, pattern: "digits", size: "large" },
);
const emit = defineEmits<{ complete: [string] }>();
const model = defineModel<string>({ default: "" });
const cells = ref<HTMLInputElement[]>([]);
const current = computed(() => (model.value ?? "").slice(0, props.length));
const label = computed(() => props.ariaLabel ?? "인증번호");
const ok = computed(() => (props.pattern === "digits" ? /[0-9]/ : /[0-9a-zA-Z]/));

function charAt(i: number) {
  const c = current.value[i];
  return c && c !== " " ? c : "";
}
function commit(next: string) {
  model.value = next;
  if (next.length === props.length && !next.includes(" ")) emit("complete", next);
}
function setAt(i: number, chars: string) {
  const arr = current.value.padEnd(props.length, " ").split("");
  let j = i;
  for (const c of chars) {
    if (j >= props.length) break;
    if (!ok.value.test(c)) continue;
    arr[j++] = c;
  }
  commit(arr.join("").replace(/\s+$/, ""));
  cells.value[Math.min(j, props.length - 1)]?.focus();
}
function onKeydown(i: number, e: KeyboardEvent) {
  const k = e.key;
  if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    setAt(i, k);
  } else if (k === "Backspace") {
    e.preventDefault();
    const arr = current.value.padEnd(props.length, " ").split("");
    if (charAt(i)) arr[i] = " ";
    else if (i > 0) {
      arr[i - 1] = " ";
      cells.value[i - 1]?.focus();
    }
    commit(arr.join("").replace(/\s+$/, ""));
  } else if (k === "ArrowLeft" && i > 0) {
    e.preventDefault();
    cells.value[i - 1]?.focus();
  } else if (k === "ArrowRight" && i < props.length - 1) {
    e.preventDefault();
    cells.value[i + 1]?.focus();
  } else if (k === "Home") {
    e.preventDefault();
    cells.value[0]?.focus();
  } else if (k === "End") {
    e.preventDefault();
    cells.value[props.length - 1]?.focus();
  }
}
function onInput(i: number, e: Event) {
  const v = (e.target as HTMLInputElement).value;
  if (v) setAt(i, v.slice(-1));
}
function onPaste(i: number, e: ClipboardEvent) {
  e.preventDefault();
  setAt(i, (e.clipboardData?.getData("text") ?? "").trim());
}
</script>

<template>
  <div role="group" :aria-label="label" :aria-describedby="ariaDescribedby" class="hb-otp">
    <template v-for="(_, i) in length" :key="i">
      <input
        :ref="(el) => { if (el) cells[i] = el as HTMLInputElement; }"
        :class="['krds-input', size, 'hb-otp-slot']"
        type="text"
        :inputmode="pattern === 'digits' ? 'numeric' : 'text'"
        :autocomplete="i === 0 ? 'one-time-code' : 'off'"
        maxlength="1"
        :value="charAt(i)"
        :disabled="disabled"
        :aria-invalid="invalid || undefined"
        :aria-label="`${label} ${length}자리 중 ${i + 1}번째`"
        @focus="($event.target as HTMLInputElement).select()"
        @input="onInput(i, $event)"
        @paste="onPaste(i, $event)"
        @keydown="onKeydown(i, $event)"
      />
      <span v-if="separatorAfter === i + 1 && i < length - 1" class="hb-otp-sep" aria-hidden="true"></span>
    </template>
  </div>
</template>
