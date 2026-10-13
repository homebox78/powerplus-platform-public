"use client";
// 파일 업로드 — KRDS 「파일 업로드(file_upload)」
//   <FileUpload title="첨부 서류" maxFiles={10} maxSize={20 * 1024 * 1024} accept=".hwp,.pdf,.jpg"
//               upload={(file) => api.upload(file)} onFilesChange={setFiles} />
// 끌어다 놓기 또는 [파일선택] 버튼. upload 를 주면 올리는 동안 "업로드 중"(스피너)을 보이고
// 끝나면 "업로드 완료", 실패하면 오류 문구를 항목 아래에 띄운다. 용량 초과 파일은 오류 항목으로 남긴다.
// 추가·삭제 결과는 화면낭독기용 알림(aria-live)으로 읽어 준다.
// description 을 안 주면 accept·maxSize·maxFiles 로 "첨부 가능 형식 · 파일당 크기 · 최대 개수" 안내를 만들어 보이고,
// [파일선택] 버튼은 제목·안내를 aria-describedby 로 함께 읽힌다. accept 에 맞지 않는 파일은 형식 오류 항목,
// 개수를 넘긴 파일은 목록 위 오류 문구로 알린다. upload 가 Error 로 거부하면 그 message 를 그대로 보인다.
import * as React from "react";
import { cx, uid, useUid } from "./utils";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  /** 오류 문구 (status=error) */
  message?: string;
  file?: File;
}

export interface FileUploadProps {
  /** 업로드 칸 제목 — [파일선택] 버튼과 함께 읽히므로 꼭 준다 */
  title: React.ReactNode;
  /** 제목 아래 안내 (주지 않으면 허용 형식·용량·개수로 만든다) */
  description?: React.ReactNode;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  /** 한 파일 최대 크기(바이트) */
  maxSize?: number;
  files?: UploadItem[];
  defaultFiles?: UploadItem[];
  onFilesChange?: (files: UploadItem[]) => void;
  /** 실제 올리기. 거부(throw)하면 오류 항목이 된다 — Error message 가 있으면 그 문구를 보인다 */
  upload?: (file: File) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function formatFileSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}MB`;
}

const MEDIA: Record<string, string> = { image: "이미지", video: "동영상", audio: "음성" };
/** accept(".hwp,.pdf,image/*") → 화면에 보일 형식 이름 ["hwp","pdf","이미지"] */
export function acceptNames(accept?: string): string[] {
  if (!accept) return [];
  const names = accept
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith(".") ? t.slice(1).toLowerCase() : t.endsWith("/*") ? MEDIA[t.slice(0, -2)] ?? t : (t.split("/").pop() ?? t).toLowerCase()));
  return [...new Set(names)];
}
/** 파일이 accept 에 맞는가 (accept 가 없으면 늘 맞음) */
export function acceptMatches(file: { name: string; type?: string }, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = (file.type ?? "").toLowerCase();
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) => (t.startsWith(".") ? name.endsWith(t) : t.endsWith("/*") ? type.startsWith(t.slice(0, -1)) : type === t));
}
/** 제한 조건으로 만든 안내 문구 — "첨부 가능 형식: hwp, pdf · 파일당 20MB 미만 · 최대 10개" */
export function fileLimitHint(accept?: string, maxSize?: number, maxFiles?: number): string {
  const names = acceptNames(accept);
  return [
    names.length ? `첨부 가능 형식: ${names.join(", ")}` : "",
    maxSize != null ? `파일당 ${formatFileSize(maxSize)} 미만` : "",
    maxFiles != null ? `최대 ${maxFiles}개` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const fileLabel = (it: UploadItem) => {
  const dot = it.name.lastIndexOf(".");
  const base = dot > 0 ? it.name.slice(0, dot) : it.name;
  const ext = dot > 0 ? it.name.slice(dot + 1).toLowerCase() : "";
  return `${base} [${ext ? ext + ", " : ""}${formatFileSize(it.size)}]`;
};

export function FileUpload({
  title, description, accept, multiple = true, maxFiles = 10, maxSize, files, defaultFiles = [],
  onFilesChange, upload, disabled, className,
}: FileUploadProps) {
  const [inner, setInner] = React.useState<UploadItem[]>(defaultFiles);
  const list = files ?? inner;
  const latest = React.useRef(list);
  latest.current = list;
  const [over, setOver] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [limitMsg, setLimitMsg] = React.useState("");
  const base = useUid("hb-file");
  const input = React.useRef<HTMLInputElement>(null);
  const names = acceptNames(accept);
  const hint = description ?? (fileLimitHint(accept, maxSize, maxFiles) || undefined);
  const titId = `${base}-tit`;
  const descId = `${base}-desc`;
  const limitId = `${base}-limit`;

  const commit = (next: UploadItem[]) => {
    latest.current = next;
    if (files === undefined) setInner(next);
    onFilesChange?.(next);
  };
  const patch = (id: string, p: Partial<UploadItem>) => commit(latest.current.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const add = (picked: File[]) => {
    if (disabled || !picked.length) return;
    const room = maxFiles - latest.current.length;
    if (room <= 0) {
      const m = `최대 ${maxFiles}개까지 첨부할 수 있습니다. 파일을 삭제한 뒤 다시 선택해 주세요.`;
      setLimitMsg(m);
      setNotice(m);
      return;
    }
    const take = picked.slice(0, room);
    const items: UploadItem[] = take.map((file) => {
      const badType = !acceptMatches(file, accept);
      const tooBig = maxSize != null && file.size >= maxSize;
      return {
        id: uid(`${base}-i`),
        name: file.name,
        size: file.size,
        file,
        status: badType || tooBig ? "error" : upload ? "uploading" : "done",
        message: badType
          ? `허용되지 않는 파일 형식입니다.\n${names.join(", ")} 파일만 등록할 수 있습니다.`
          : tooBig
            ? `등록 가능한 파일 용량을 초과하였습니다.\n${formatFileSize(maxSize!)} 미만의 파일만 등록할 수 있습니다.`
            : undefined,
      };
    });
    commit([...latest.current, ...items]);
    const dropped = picked.length - take.length;
    const overMsg = dropped > 0 ? `${dropped}개는 최대 ${maxFiles}개 제한으로 첨부되지 않았습니다.` : "";
    const bad = items.filter((x) => x.status === "error").length;
    setLimitMsg(overMsg);
    setNotice(`파일 ${items.length}개를 추가했습니다.` + (bad ? ` 그중 ${bad}개는 오류입니다.` : "") + (overMsg ? ` ${overMsg}` : ""));
    if (upload) {
      for (const it of items) {
        if (it.status !== "uploading" || !it.file) continue;
        upload(it.file).then(
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
  };
  const remove = (it: UploadItem) => {
    commit(latest.current.filter((x) => x.id !== it.id));
    setLimitMsg("");
    setNotice(`${it.name} 파일을 삭제했습니다.`);
    input.current?.focus();
  };

  return (
    <div className={cx("krds-file-upload line", className)}>
      <div className="file-head">
        <h3 className="tit" id={titId}>{title}</h3>
        {hint && <div id={descId}>{typeof hint === "string" ? <p>{hint}</p> : hint}</div>}
      </div>
      <div
        className={cx("file-upload", over && "hb-dragover")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(Array.from(e.dataTransfer.files));
        }}
      >
        <p className="txt">첨부할 파일을 여기에 끌어다 놓거나, 파일 선택 버튼을 눌러 파일을 직접 선택해주세요.</p>
        <div className="file-upload-btn-wrap">
          <input
            ref={input}
            type="file"
            id={`${base}-input`}
            hidden
            accept={accept}
            multiple={multiple}
            onChange={(e) => {
              add(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="krds-btn medium"
            disabled={disabled}
            aria-describedby={[titId, hint ? descId : "", limitMsg ? limitId : ""].filter(Boolean).join(" ")}
            onClick={() => input.current?.click()}
          >
            <i className="svg-icon ico-upload" aria-hidden="true" />
            파일선택
          </button>
        </div>
      </div>
      {limitMsg && (
        <p id={limitId} className="file-hint-invalid">
          {limitMsg}
        </p>
      )}
      {list.length > 0 && (
        <div className="file-list">
          <div className="total">
            <span className="current">{list.length}개</span> / {maxFiles}개
          </div>
          <ul className="upload-list">
            {list.map((it) => (
              <li key={it.id} className={cx(it.status === "error" && "is-error")}>
                <div className="file-info">
                  <div className="file-name">{fileLabel(it)}</div>
                  <div className="btn-wrap">
                    {it.status === "uploading" ? (
                      <span className="krds-spinner" role="status">
                        <span className="sr-only">업로드 중</span>
                      </span>
                    ) : (
                      <button type="button" className="krds-btn medium text" onClick={() => remove(it)}>
                        삭제<span className="sr-only"> {it.name}</span> <i className="svg-icon ico-delete-fill" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                {it.status === "error" && it.message && (
                  <p className="file-hint-invalid" style={{ whiteSpace: "pre-line" }}>{it.message}</p>
                )}
              </li>
            ))}
          </ul>
          <div className="upload-delete-btn">
            <button
              type="button"
              className="krds-btn xsmall tertiary"
              onClick={() => {
                commit([]);
                setLimitMsg("");
                setNotice("첨부한 파일을 모두 삭제했습니다.");
              }}
            >
              전체 파일 삭제<i className="svg-icon ico-angle right" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{notice}</p>
    </div>
  );
}
