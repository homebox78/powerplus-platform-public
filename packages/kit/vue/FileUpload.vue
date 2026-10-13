<!-- 파일 업로드 — KRDS 「파일 업로드(file_upload)」. React 판 FileUpload 와 같은 마크업·동작.
  <FileUpload v-model="files" title="첨부 서류" :max-files="10" :max-size="20 * 1024 * 1024" accept=".hwp,.pdf" :upload="올리기" />
  끌어다 놓기 또는 [파일선택]. upload 를 주면 올리는 동안 스피너("업로드 중"), 실패하면 오류 문구(Error message 우선).
  description 을 안 주면 허용 형식·용량·개수로 안내를 만들고, [파일선택] 버튼은 제목·안내를 aria-describedby 로 읽힌다.
  accept 에 맞지 않는 파일은 형식 오류 항목, 개수를 넘긴 파일은 목록 위 오류 문구로 알린다. -->
<script setup lang="ts">
import { computed, ref, useSlots } from "vue";
import { uid, useUid } from "./utils";

interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  message?: string;
  file?: File;
}

const props = withDefaults(
  defineProps<{
    /** 업로드 칸 제목 — [파일선택] 버튼과 함께 읽히므로 꼭 준다 */
    title: string;
    /** 제목 아래 안내 (주지 않으면 허용 형식·용량·개수로 만든다) */
    description?: string;
    accept?: string;
    multiple?: boolean;
    maxFiles?: number;
    maxSize?: number;
    upload?: (file: File) => Promise<void>;
    disabled?: boolean;
  }>(),
  { multiple: true, maxFiles: 10 },
);
const model = defineModel<UploadItem[]>({ default: () => [] });
const slots = useSlots();
const over = ref(false);
const notice = ref("");
const limitMsg = ref("");
const base = useUid("hb-file");
const input = ref<HTMLInputElement | null>(null);
const titId = `${base}-tit`;
const descId = `${base}-desc`;
const limitId = `${base}-limit`;

const MEDIA: Record<string, string> = { image: "이미지", video: "동영상", audio: "음성" };
function formatSize(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}MB`;
}
const names = computed(() => {
  if (!props.accept) return [] as string[];
  const n = props.accept
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith(".") ? t.slice(1).toLowerCase() : t.endsWith("/*") ? MEDIA[t.slice(0, -2)] ?? t : (t.split("/").pop() ?? t).toLowerCase()));
  return [...new Set(n)];
});
function acceptMatches(file: File) {
  if (!props.accept) return true;
  const name = file.name.toLowerCase();
  const type = (file.type ?? "").toLowerCase();
  return props.accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) => (t.startsWith(".") ? name.endsWith(t) : t.endsWith("/*") ? type.startsWith(t.slice(0, -1)) : type === t));
}
const autoHint = computed(() =>
  [
    names.value.length ? `첨부 가능 형식: ${names.value.join(", ")}` : "",
    props.maxSize != null ? `파일당 ${formatSize(props.maxSize)} 미만` : "",
    props.maxFiles != null ? `최대 ${props.maxFiles}개` : "",
  ]
    .filter(Boolean)
    .join(" · "),
);
const hint = computed(() => props.description ?? autoHint.value);
const hasHint = computed(() => !!hint.value || !!slots.description);
const btnDesc = computed(() => [titId, hasHint.value ? descId : "", limitMsg.value ? limitId : ""].filter(Boolean).join(" "));

function fileLabel(it: UploadItem) {
  const dot = it.name.lastIndexOf(".");
  const b = dot > 0 ? it.name.slice(0, dot) : it.name;
  const ext = dot > 0 ? it.name.slice(dot + 1).toLowerCase() : "";
  return `${b} [${ext ? ext + ", " : ""}${formatSize(it.size)}]`;
}
function patch(id: string, p: Partial<UploadItem>) {
  model.value = model.value.map((x) => (x.id === id ? { ...x, ...p } : x));
}
function add(picked: File[]) {
  if (props.disabled || !picked.length) return;
  const room = props.maxFiles - model.value.length;
  if (room <= 0) {
    const m = `최대 ${props.maxFiles}개까지 첨부할 수 있습니다. 파일을 삭제한 뒤 다시 선택해 주세요.`;
    limitMsg.value = m;
    notice.value = m;
    return;
  }
  const take = picked.slice(0, room);
  const items: UploadItem[] = take.map((file) => {
    const badType = !acceptMatches(file);
    const tooBig = props.maxSize != null && file.size >= props.maxSize;
    return {
      id: uid(`${base}-i`),
      name: file.name,
      size: file.size,
      file,
      status: badType || tooBig ? "error" : props.upload ? "uploading" : "done",
      message: badType
        ? `허용되지 않는 파일 형식입니다.\n${names.value.join(", ")} 파일만 등록할 수 있습니다.`
        : tooBig
          ? `등록 가능한 파일 용량을 초과하였습니다.\n${formatSize(props.maxSize!)} 미만의 파일만 등록할 수 있습니다.`
          : undefined,
    };
  });
  model.value = [...model.value, ...items];
  const dropped = picked.length - take.length;
  const overMsg = dropped > 0 ? `${dropped}개는 최대 ${props.maxFiles}개 제한으로 첨부되지 않았습니다.` : "";
  const bad = items.filter((x) => x.status === "error").length;
  limitMsg.value = overMsg;
  notice.value = `파일 ${items.length}개를 추가했습니다.` + (bad ? ` 그중 ${bad}개는 오류입니다.` : "") + (overMsg ? ` ${overMsg}` : "");
  if (props.upload) {
    for (const it of items) {
      if (it.status !== "uploading" || !it.file) continue;
      props.upload(it.file).then(
        () => patch(it.id, { status: "done" }),
        (e: unknown) =>
          patch(it.id, {
            status: "error",
            message:
              e instanceof Error && e.message ? e.message : typeof e === "string" && e ? e : "파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.",
          }),
      );
    }
  }
}
function remove(it: UploadItem) {
  model.value = model.value.filter((x) => x.id !== it.id);
  limitMsg.value = "";
  notice.value = `${it.name} 파일을 삭제했습니다.`;
  input.value?.focus();
}
function removeAll() {
  model.value = [];
  limitMsg.value = "";
  notice.value = "첨부한 파일을 모두 삭제했습니다.";
}
function onPick(e: Event) {
  const el = e.target as HTMLInputElement;
  add(Array.from(el.files ?? []));
  el.value = "";
}
function onDrop(e: DragEvent) {
  over.value = false;
  add(Array.from(e.dataTransfer?.files ?? []));
}
</script>

<template>
  <div class="krds-file-upload line">
    <div class="file-head">
      <h3 :id="titId" class="tit">{{ title }}</h3>
      <div v-if="hasHint" :id="descId"><slot name="description"><p>{{ hint }}</p></slot></div>
    </div>
    <div
      :class="['file-upload', over && 'hb-dragover']"
      @dragover.prevent="!disabled && (over = true)"
      @dragleave="over = false"
      @drop.prevent="onDrop"
    >
      <p class="txt">첨부할 파일을 여기에 끌어다 놓거나, 파일 선택 버튼을 눌러 파일을 직접 선택해주세요.</p>
      <div class="file-upload-btn-wrap">
        <input ref="input" :id="`${base}-input`" type="file" hidden :accept="accept" :multiple="multiple" @change="onPick" />
        <button type="button" class="krds-btn medium" :disabled="disabled" :aria-describedby="btnDesc" @click="input?.click()">
          <i class="svg-icon ico-upload" aria-hidden="true"></i>파일선택
        </button>
      </div>
    </div>
    <p v-if="limitMsg" :id="limitId" class="file-hint-invalid">{{ limitMsg }}</p>
    <div v-if="model.length" class="file-list">
      <div class="total"><span class="current">{{ model.length }}개</span> / {{ maxFiles }}개</div>
      <ul class="upload-list">
        <li v-for="it in model" :key="it.id" :class="{ 'is-error': it.status === 'error' }">
          <div class="file-info">
            <div class="file-name">{{ fileLabel(it) }}</div>
            <div class="btn-wrap">
              <span v-if="it.status === 'uploading'" class="krds-spinner" role="status"><span class="sr-only">업로드 중</span></span>
              <button v-else type="button" class="krds-btn medium text" @click="remove(it)">
                삭제<span class="sr-only"> {{ it.name }}</span> <i class="svg-icon ico-delete-fill" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <p v-if="it.status === 'error' && it.message" class="file-hint-invalid" style="white-space: pre-line">{{ it.message }}</p>
        </li>
      </ul>
      <div class="upload-delete-btn">
        <button type="button" class="krds-btn xsmall tertiary" @click="removeAll">
          전체 파일 삭제<i class="svg-icon ico-angle right" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    <p class="sr-only" aria-live="polite">{{ notice }}</p>
  </div>
</template>
