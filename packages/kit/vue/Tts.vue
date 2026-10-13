<!-- 음성 읽기(TTS) — KRDS 「TTS(tts · tts_icon · tts_size)」
  <Tts text="안내 문구를 읽어 줍니다." />                     ← 기본(스피커 아이콘 + "읽어주기")
  <Tts target="#notice-body" variant="play" />               ← 대상 영역의 글을 읽는다(재생 ↔ 정지 전환)
  <Tts target="#notice-body" icon-only aria-label="공지 읽어주기" size="small" />
  브라우저 speechSynthesis 로 읽는다. 한 번에 하나만 읽고, 다시 누르면 멈춘다.
  지원하지 않는 브라우저에서는 버튼을 끄고 안내 문구를 보인다. -->
<script lang="ts">
// 문서 전체에서 읽는 버튼은 하나 — 누가 읽는 중인지와 그 버튼을 되돌리는 함수
let active: { owner: object; reset: () => void } | null = null;
function supported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs } from "vue";
import { resolveTarget } from "./govDrop";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    text?: string;
    target?: string | HTMLElement | null;
    label?: string;
    stopLabel?: string;
    size?: "xsmall" | "small" | "medium";
    variant?: "default" | "play";
    iconOnly?: boolean;
    lang?: string;
    rate?: number;
    disabled?: boolean;
    unsupportedText?: string;
  }>(),
  {
    stopLabel: "멈춤",
    size: "medium",
    variant: "default",
    lang: "ko-KR",
    rate: 1,
    unsupportedText: "이 브라우저는 음성 읽기를 지원하지 않습니다.",
  },
);
const emit = defineEmits<{ speakingChange: [boolean] }>();
const attrs = useAttrs();

const speaking = ref(false);
const ok = ref(true);
const status = ref("");
const me = {};
let current: object | null = null;

onMounted(() => (ok.value = supported()));
onBeforeUnmount(() => {
  if (active?.owner === me && supported()) {
    active = null;
    window.speechSynthesis.cancel();
  }
});

function update(v: boolean, msg: string) {
  speaking.value = v;
  status.value = msg;
  emit("speakingChange", v);
}
function stop() {
  if (active?.owner === me) active = null;
  if (supported()) window.speechSynthesis.cancel();
  update(false, "읽기를 멈췄습니다.");
}
function play() {
  const content = (props.text ?? resolveTarget(props.target, "")?.innerText ?? "").trim();
  if (!content) {
    status.value = "읽을 내용이 없습니다.";
    return;
  }
  if (active && active.owner !== me) active.reset();
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(content);
  u.lang = props.lang;
  u.rate = props.rate;
  try {
    const voice = synth.getVoices().find((v) => (v.lang || "").toLowerCase().startsWith(props.lang.slice(0, 2).toLowerCase()));
    if (voice) u.voice = voice;
  } catch {
    /* 목소리 목록을 못 읽어도 기본 목소리로 읽는다 */
  }
  const token = {};
  current = token;
  const done = () => {
    if (active?.owner === me && current === token) {
      active = null;
      update(false, "읽기를 마쳤습니다.");
    }
  };
  u.onend = done;
  u.onerror = (e) => {
    if (e.error !== "canceled" && e.error !== "interrupted") done();
  };
  active = { owner: me, reset: () => update(false, "읽기를 멈췄습니다.") };
  update(true, "읽는 중입니다.");
  synth.speak(u);
}
function onClick() {
  if (!ok.value) return;
  if (speaking.value) stop();
  else play();
}

const idleLabel = computed(() => props.label ?? (props.variant === "play" ? "재생" : "읽어주기"));
const shown = computed(() => (speaking.value ? props.stopLabel : idleLabel.value));
const icon = computed(() => (props.variant === "play" ? (speaking.value ? "ico-stop" : "ico-play") : "ico-volume"));
const cls = computed(() => [
  "krds-tts",
  props.size,
  { play: props.variant === "play" && !speaking.value, pause: props.variant === "play" && speaking.value, "is-playing": speaking.value },
  attrs.class,
]);
const rest = computed(() => {
  const { class: _c, ...others } = attrs;
  void _c;
  return others;
});
</script>

<template>
  <span class="hb-tts-wrap">
    <button
      type="button"
      v-bind="rest"
      :class="cls"
      :aria-pressed="speaking"
      :aria-label="iconOnly ? ((attrs['aria-label'] as string | undefined) ?? shown) : undefined"
      :disabled="disabled || !ok"
      @click="onClick"
    >
      <span class="krds-tts-icon" aria-hidden="true"><i :class="['svg-icon', icon]" /></span>
      <span v-if="!iconOnly" class="krds-tts-text">{{ shown }}</span>
    </button>
    <span v-if="!ok" class="hb-tts-msg">{{ unsupportedText }}</span>
    <span class="sr-only" role="status" aria-live="polite">{{ status }}</span>
  </span>
</template>
