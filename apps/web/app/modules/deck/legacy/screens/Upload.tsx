// 새 변환 올리기(파일·언어·디자인 고르기) — 출처: powerDeck web/src/screens/Upload.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LiveDot } from "@/components/hb/live-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API, api, fmtSize, uploadDoc, uploadFile, usd, type Engine, type Job, type JobKind, type MockupMode, type UploadProgress } from "../api";
import { getAi, type AiSettings } from "../openrouter";
import { cn, Ms, SecTitle, Seg, useToastOn, toast, useContextMenu, type CtxItem, sent } from "../ui";
import { DesignTypePicker, typeName } from "../DesignTypes";
import { VerticalStylePicker, VerticalTonePicker, verticalStyleName, verticalToneName } from "../VerticalThemes";
import { COMPANY_THEMES, CompanyThemePicker, CompanyTonePicker, companyThemeName, companyToneName } from "../CompanyThemes";
import { BODY_FONTS, FontPicker, TITLE_FONTS, VERTICAL_BODY_FONTS, fontName } from "../FontPicker";
import { LogoSearch } from "../LogoSearch";

/** 제작 언어 — 장표 글·시안·대본(서버 Jobs::LANGS 와 같은 목록) */
const DECK_LANGS = [["ko", "한국어"], ["en", "영어 English"], ["ja", "일본어 日本語"], ["zh", "중국어 简体中文"], ["fr", "프랑스어 Français"], ["es", "스페인어 Español"], ["de", "독일어 Deutsch"], ["vi", "베트남어 Tiếng Việt"]] as const;
type DeckLang = (typeof DECK_LANGS)[number][0];
import { UploadModal, type UpStep } from "./UploadModal";

const MAX = 1024 * 1024 * 1024;
const FILE_RE = /\.(pdf|docx|hwpx|hwp|xlsx|pptx|md|txt|markdown|csv)$/i;
const CONTENT_RE = /\.(pptx|md|txt|markdown)$/i;  // '장표 내용'으로 쓸 수 있는 형식

/** 강조색 추천 — 메인(코발트)은 고정, 제목 핵심어·강조 표시에 쓰는 색 */
const ACCENTS: [string, string][] = [
  ["#1866DA", "블루"], ["#2E9BD6", "스카이"], ["#0E9F8E", "틸"], ["#1A9C5B", "그린"],
  ["#F59E0B", "앰버"], ["#E8703A", "오렌지"], ["#D7263D", "레드"], ["#E8336D", "진분홍"], ["#C01348", "버건디"],
];
/** 제안사 로고 바로 넣기 — 파워플러스의 솔리데오 로고(투명 PNG, 심볼 왼쪽·글자 오른쪽) */
const SOLIDEO: [string, string, string][] = [["logo_524", "logo_523", "솔리데오 컨소시엄"], ["logo_514", "logo_513", "(주)솔리데오"]];   // [기본, 흰색판, 이름]
const logoFile = (id: string) => `${API}/logos/file?p=legacy/${id}/original`;   // 옛 파워플러스 에셋 번호(legacy_key) → 서버가 public_id 로 찾는다
const MODE_LABEL: Record<MockupMode, string> = { plan: "기획부터 보기", sample: "샘플만 먼저", all: "전부 바로 만들기" };
const STEPS = ["내용", "디자인", "세부 설정"] as const;
type Step = 1 | 2 | 3;

type Item = { file: File; role: "context" | "content" };
const extOf = (name: string) => (name.split(".").pop() ?? "").toUpperCase().slice(0, 8);

/**
 * 새 변환 — 3단계 마법사(내용 → 디자인 → 세부 설정) + 오른쪽 요약 패널.
 *   만들기(design): 글을 적거나 파일을 놓는다. 파일은 기본 '배경 자료'(RFP 등), 하나를 '장표 내용'으로 바꿀 수 있다.
 *                   기본값만으로 어느 단계에서든 넘어가 마지막 단계에서 바로 시작할 수 있다.
 *   다듬기(polish): 초안 .pptx 하나를 올리면 si-deck 으로 정돈 — 단계 없이 한 화면.
 * 화면을 진행시키는 버튼은 머리줄 오른쪽 끝, 요약 패널은 정보만(누르면 그 항목으로 간다).
 */
/** 기본 로고를 흰색으로(모양·투명도는 그대로, 흰 바탕은 비운다) — 흰색판을 따로 안 넣은 로고용 */
async function whiten(f: File): Promise<File> {
  const b = await createImageBitmap(f);
  const cv = document.createElement("canvas");
  cv.width = b.width; cv.height = b.height;
  const cx = cv.getContext("2d")!;
  cx.drawImage(b, 0, 0);
  const d = cx.getImageData(0, 0, cv.width, cv.height);
  for (let i = 0; i < d.data.length; i += 4) {
    if (Math.min(d.data[i]!, d.data[i + 1]!, d.data[i + 2]!) > 238) d.data[i + 3] = 0;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
  }
  cx.putImageData(d, 0, 0);
  const blob = await new Promise<Blob>((ok, no) => cv.toBlob((x) => (x ? ok(x) : no(new Error("흰색 로고를 만들지 못했습니다."))), "image/png"));
  return new File([blob], "white.png", { type: "image/png" });
}

/** 로고 여러 개를 한 줄로 이어 붙인 PNG 한 장으로(높이 200px 로 맞추고 사이를 띄운다). 하나면 그대로 */
async function joinLogos(files: File[]): Promise<File> {
  if (files.length === 1) return files[0]!;
  const H = 200, GAP = 90;
  const bms = await Promise.all(files.map((f) => createImageBitmap(f)));
  const ws = bms.map((b) => Math.max(1, Math.round((b.width * H) / b.height)));
  const cv = document.createElement("canvas");
  cv.width = ws.reduce((a, w) => a + w, 0) + GAP * (bms.length - 1);
  cv.height = H;
  const cx = cv.getContext("2d")!;
  cx.imageSmoothingQuality = "high";
  let x = 0;
  bms.forEach((b, i) => { cx.drawImage(b, x, 0, ws[i]!, H); x += ws[i]! + GAP; });
  const blob = await new Promise<Blob>((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("로고를 합치지 못했습니다."))), "image/png"));
  return new File([blob], "logos.png", { type: "image/png" });
}

export function Upload({ engine, isAdmin = false, onUploaded, onCancel, onSettings }: { engine: Engine | null; isAdmin?: boolean; onUploaded: (j: Job) => void; onCancel?: () => void; onSettings: () => void }) {
  const [kind, setKind] = useState<JobKind>("design");
  const [step, setStep] = useState<Step>(1);
  const [focus, setFocus] = useState<string | null>(null);   // 요약에서 누른 항목 — 잠깐 강조
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [note, setNote] = useState("");
  const [pilot, setPilot] = useState(true);
  const [accent, setAccent] = useState("#1866DA");
  // 장 수 — 비우면 5장(2026-10-07 사용자: '자동'이 자료 분량대로 37장을 잡아 몇 시간씩 걸렸다. 서버도 같은 규칙)
  const [slideN, setSlideN] = useState("");
  const [mockups, setMockups] = useState<MockupMode>("plan");
  const [sampleN, setSampleN] = useState("3");
  // 틀(머리 띠·바닥) — 모든 장에 같은 위치·크기로 들어간다. 사업명은 머리 띠 오른쪽, 로고는 바닥 좌우
  const [project, setProject] = useState("");
  const [event, setEvent] = useState("");   // 표지 꼬리 글 — 비우면 제안설명회
  const [evDate, setEvDate] = useState("");   // 표지 날짜 — 비우면 작성한 달
  const [front, setFront] = useState({ cover: true, toc: true, divider: true });   // 표지·목차·간지 — 제작 직전에도 바꿀 수 있다
  const [style, setStyle] = useState("a");   // 디자인 타입 — reference/styles/styles.json
  const [purpose, setPurpose] = useState<"submit" | "present" | "company">("present");
  const [ctheme, setCtheme0] = useState("a");   // 회사소개서 테마 A~H(engine/company.py COMPANY_THEMES)
  const [cfree, setCfree] = useState(false);   // 자유도 — 표지·간지·마무리 배경을 테마 묶음이 아니라 파워에셋에서 AI(Claude Opus 5.5, 없으면 OpenRouter)가 고른다
  const [ctone, setCtone] = useState("blue");   // 회사소개서 톤(색) — engine/company.py TONES 의 id 또는 직접 고른 #RRGGBB
  const setCtheme = (id: string) => { setCtheme0(id); setCtone(COMPANY_THEMES.find((t) => t.id === id)?.tone ?? "blue"); };   // 테마를 고르면 그 테마에 어울리는 기본 톤으로
  const company = purpose === "company";   // 회사소개용 = 회사소개서(engine/company.py, 테마 A·B) — 시안 없이 PPT 바로, 서체·색은 테마가 정한다
  const direct = purpose !== "present";    // 시안 확인 없이 PPT 를 바로 만드는 용도(제출용·회사소개용)
  const [vstyle, setVstyle] = useState("band");   // 제출용(세로 제안서) 디자인 스타일(모양) — engine/vertical.py STYLES
  const [vtone, setVtone] = useState("navy");     // 톤(색) — engine/vertical.py TONES. 고르면 강조색도 추천 색으로
  const [lang, setLang] = useState<DeckLang>("ko");   // 제작 언어 — 자료가 한국어여도 장표 글을 이 언어로   // 용도 — 발표용(기본) / 제출용
  const [fontTitle, setFontTitle] = useState(TITLE_FONTS[0]?.id ?? "gmarket");   // 서체 — worker/fonts/fonts.json
  const [fontBody, setFontBody] = useState(BODY_FONTS[0]?.id ?? "freesentation");
  // 용도가 바뀌면 본문 서체를 그 용도의 목록 안으로(제출용 = 세로 제안서 3종)
  useEffect(() => {
    const list = purpose === "submit" ? VERTICAL_BODY_FONTS : BODY_FONTS;
    if (!list.some((f) => f.id === fontBody)) setFontBody(list[0]?.id ?? "freesentation");
  }, [purpose, fontBody]);
  const [logos, setLogos] = useState<{ client: File[]; vendor: File[] }>({ client: [], vendor: [] });   // 기관이 둘 이상이면 여러 개(3개까지) — 올릴 때 한 줄로 이어 붙인다
  // 흰색 로고(선택, 어두운 바탕용) — 기본 로고마다 하나(같은 순서). 없으면 기본 로고 모양을 흰색으로 바꿔 쓴다
  const [whites, setWhites] = useState<{ client: (File | undefined)[]; vendor: (File | undefined)[] }>({ client: [], vendor: [] });
  const [logoFind, setLogoFind] = useState<{ w: "client" | "vendor"; white?: number } | null>(null);   // 파워플러스 로고 검색(white = 흰색판을 붙일 기본 로고 순번)
  const pickLogo = (which: "client" | "vendor", f?: File, white?: number, whiteFile?: File) => {
    if (!f) return;
    if (!/\.(png|jpe?g)$/i.test(f.name) || f.size > 5 * 1024 * 1024) return setErr("로고는 PNG·JPG, 5MB 까지 올릴 수 있습니다.");
    if (white != null) return setWhites((x) => { const a = [...x[which]]; a[white] = f; return { ...x, [which]: a }; });
    if (logos[which].length >= 3) return;
    const n = logos[which].length;
    setLogos((l) => ({ ...l, [which]: [...l[which], f] }));
    setWhites((x) => { const a = [...x[which]]; a[n] = whiteFile; return { ...x, [which]: a }; });
  };
  const dropLogo = (which: "client" | "vendor", i: number) => {
    setLogos((x) => ({ ...x, [which]: x[which].filter((_, k) => k !== i) }));
    setWhites((x) => ({ ...x, [which]: x[which].filter((_, k) => k !== i) }));
  };
  const logoN = logos.client.length + logos.vendor.length;
  const pickSolideo = async (id: string, wid: string) => {   // 솔리데오는 고르기만 하면 흰색판까지 함께
    try {
      const [r, rw] = await Promise.all([fetch(logoFile(id)), fetch(logoFile(wid))]);
      if (!r.ok) throw new Error();
      pickLogo("vendor", new File([await r.blob()], `${id}.png`, { type: "image/png" }), undefined,
        rw.ok ? new File([await rw.blob()], `${wid}.png`, { type: "image/png" }) : undefined);
    } catch {
      setErr("솔리데오 로고를 불러오지 못했습니다. 파워플러스에서 찾기로 넣어 주세요.");
    }
  };
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useToastOn(err);
  const [busy, setBusy] = useState<string | null>(null);  // 진행 문구
  const [prog, setProg] = useState<{ name: string; p: UploadProgress } | null>(null);
  const [doneNames, setDoneNames] = useState<string[]>([]);   // 올리기가 끝난 항목 — 진행 모달의 체크 표시
  const markDone = (name: string) => setDoneNames((d) => [...d, name]);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const focusT = useRef(0);

  useEffect(() => { getAi().then(setAi).catch(() => {}); }, []);
  useEffect(() => () => window.clearTimeout(focusT.current), []);
  // 단계·방식을 바꾸면 맨 위부터
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [step, kind]);

  const design = kind === "design";
  const accentOk = /^#[0-9a-fA-F]{6}$/.test(accent);
  const content = items.find((i) => i.role === "content");
  const contexts = items.filter((i) => i.role === "context");
  const hasText = text.trim().length >= 20;
  const slideUnset = !slideN || !(parseInt(slideN) > 0);
  const slideDef = company ? 14 : 5;   // 장 수 미입력 — 회사소개서는 14쪽 안팎(서버 Jobs::opts 와 같다)
  const slides = slideUnset ? slideDef : parseInt(slideN);
  const planOpts = { slides, mockups, sample: Math.max(1, parseInt(sampleN) || 3), front, style, vstyle, vtone, ctheme, ctone, cfree, purpose, lang, font_title: fontTitle, font_body: fontBody, event: event.trim(), date: evDate.trim() };
  const aiBlock = design && ai && !ai.ready;
  const working = busy !== null;

  // 작업 이름 자동 — 손대기 전까지: 내용 파일 이름 → 첫 자료 이름 → 글의 첫 줄
  const autoTitle = (content ?? items[0])?.file.name.replace(FILE_RE, "") ?? text.trim().split("\n")[0]!.replace(/^#+\s*/, "").slice(0, 60);
  const shownTitle = titleTouched ? title : autoTitle;

  const add = (fs: FileList | File[] | null | undefined) => {
    if (!fs?.length) return;
    setErr(null);
    const list = [...fs];
    if (!design) {
      const f = list.find((x) => /\.pptx$/i.test(x.name));
      if (!f) return setErr("PowerPoint(.pptx) 파일만 올릴 수 있습니다. .ppt 는 PowerPoint 에서 .pptx 로 저장해 주세요.");
      if (f.size > MAX) return setErr(`파일이 너무 큽니다(${fmtSize(f.size)}). 1GB 까지입니다.`);
      return setItems([{ file: f, role: "content" }]);
    }
    const bad = list.filter((f) => !FILE_RE.test(f.name) || f.size > MAX);
    if (bad.length) setErr(`올릴 수 없는 파일: ${bad.map((b) => b.name).join(", ")} — pdf·docx·hwp·hwpx·xlsx·pptx·md·txt, 1GB 까지`);
    setItems((cur) => [...cur, ...list.filter((f) => FILE_RE.test(f.name) && f.size <= MAX && !cur.some((x) => x.file.name === f.name && x.file.size === f.size)).map((file) => ({ file, role: "context" as const }))]);
  };
  const setRole = (i: number, role: Item["role"]) => setItems((cur) => cur.map((x, k) => (k === i ? { ...x, role } : role === "content" && x.role === "content" ? { ...x, role: "context" } : x)));

  const ready = design ? hasText || items.length > 0 : !!content;

  // 지금 설정으로 무슨 일이 일어나는지 한 문장
  const summary = !design
    ? content ? `'${content.file.name}' 을 표준 절차로 다듬습니다${pilot ? " — 대표 장 하나를 먼저 보여 드립니다" : ""}.` : "초안 .pptx 를 올려 주세요."
    : !ready ? "장표에 담을 내용을 적거나 파일을 올려 주세요."
    : company   // 회사소개서 — 레이아웃 카탈로그에 글을 채우고 HTML 로 그려 편집 가능한 PPT 로
    ? `${contexts.length ? `회사 자료 ${contexts.length}개를 읽고, ` : ""}${slides}쪽 안팎의 회사소개서를 구성한 뒤 시안 없이 바로 PPT 를 만듭니다. 글·카드는 PowerPoint 에서 고칠 수 있습니다.`
    : purpose === "submit"   // 세로 제안서 — 시안 없이 기획에서 바로 PPT(정해진 양식 + 도식의 조합이라 그림 시안이 필요 없다)
    ? `${contexts.length ? `배경 자료 ${contexts.length}개를 읽고, ` : ""}RFP 목차대로 ${slides}쪽 안팎을 기획한 뒤 시안 없이 바로 PPT 를 만듭니다. 결과는 실제 PPT 를 쪽마다 캡처해 보여 드립니다.`
    : `${contexts.length ? `배경 자료 ${contexts.length}개를 읽고, ` : ""}${content ? `'${content.file.name}' 의 내용으로 ` : hasText ? "적어 주신 내용으로 " : "자료에서 핵심을 뽑아 "}${slides}장을 기획합니다. `
      + (mockups === "plan" ? "기획과 장마다 와이어프레임(화면 구성)을 먼저 보여 드립니다. 팀원과 함께 고친 뒤 고른 장만 시안 이미지를 만듭니다 (지금은 이미지 비용 없음)."
        : mockups === "sample" ? `이어서 대표 ${planOpts.sample}장만 시안 이미지를 만듭니다.` : "이어서 모든 장의 시안 이미지를 만듭니다.");

  const start = async () => {
    setErr(null);
    setDoneNames([]);
    abort.current = new AbortController();
    const sig = abort.current.signal;
    const t = shownTitle.trim();
    try {
      let job: Job;
      if (!design) {
        setBusy("초안 올리는 중…");
        job = await uploadFile(content!.file, { title: t, note: note.trim(), pilot, kind: "polish", font_title: fontTitle, font_body: fontBody }, (p) => setProg({ name: content!.file.name, p }), sig);
        return onUploaded(job);
      }
      const hold = contexts.length > 0 || logoN > 0;
      const meta = { title: t, note: note.trim(), accent, hold, project: project.trim(), ...planOpts };
      if (content && /\.pptx$/i.test(content.file.name)) {     // 초안 pptx 가 장표 내용
        setBusy("초안 올리는 중…");
        job = await uploadFile(content.file, { ...meta, note: [note.trim(), text.trim()].filter(Boolean).join("\n"), kind: "design" }, (p) => setProg({ name: content.file.name, p }), sig);
        markDone(content.file.name);
      } else {                                                  // 글 (+ md·txt 파일 내용)
        setBusy("작업 만드는 중…");
        const brief = [text.trim(), content ? await content.file.text() : ""].filter(Boolean).join("\n\n");
        job = await api<Job>("/jobs/design", { method: "POST", body: JSON.stringify({ ...meta, brief, source_kind: content ? "md" : "text", filename: content?.file.name }) });
        markDone("__job");
      }
      for (let i = 0; i < contexts.length; i++) {
        setBusy(`배경 자료 올리는 중 ${i + 1}/${contexts.length}…`);
        await uploadDoc(contexts[i]!.file, job.id, (p) => setProg({ name: contexts[i]!.file.name, p }), sig);
        markDone(contexts[i]!.file.name);
      }
      for (const which of ["client", "vendor"] as const) {
        if (!logos[which].length) continue;
        setBusy("로고 올리는 중…");
        const f = await joinLogos(logos[which]);
        await api(`/jobs/${job.id}/brand/${which}`, { method: "PUT", body: f });
        if (whites[which].some(Boolean)) {   // 흰색판 — 빠진 것은 기본 로고를 흰색으로 만들어 같은 순서로 잇는다
          const ws = await Promise.all(logos[which].map((b, i) => whites[which][i] ?? whiten(b)));
          await api(`/jobs/${job.id}/brand/${which}_white`, { method: "PUT", body: await joinLogos(ws) });
        }
        markDone("__logo_" + which);
      }
      if (hold) job = await api<Job>(`/jobs/${job.id}/start`, { method: "POST" });
      markDone("__start");
      await new Promise((r) => setTimeout(r, 500));   // 마지막 체크가 보이게 잠깐
      onUploaded(job);
    } catch (e) {
      setErr(sig.aborted ? "올리기를 멈췄습니다. 다시 시작하면 받은 부분부터 이어서 올립니다." : (e as Error).message);
    } finally { setBusy(null); setProg(null); }
  };

  /** 단계 이동 — 필수 입력(1단계: 내용이나 자료)이 비어 있으면 넘어가지 않고 알린다 */
  const goStep = (st: Step) => {
    if (st > 1 && !ready) {
      toast("장표에 담을 내용을 적거나 자료 파일을 올린 뒤 다음 단계로 갈 수 있습니다.", "warn");
      setStep(1); setFocus("content");
      return false;
    }
    setStep(st);
    return true;
  };
  /** 요약 줄을 누르면 — 그 단계로 가서 그 항목으로 스크롤하고 잠깐 강조 */
  const focusSec = (st: Step, key: string) => {
    if (design && !goStep(st)) return;
    setFocus(key);
    window.clearTimeout(focusT.current);
    window.setTimeout(() => {
      const c = scroller.current, el = c?.querySelector<HTMLElement>("#sec-" + key);
      if (c && el) c.scrollTo({ top: c.scrollTop + el.getBoundingClientRect().top - c.getBoundingClientRect().top - 24, behavior: "smooth" });
    }, 30);
    focusT.current = window.setTimeout(() => setFocus(null), 1800);
  };
  const switchKind = (k: JobKind) => { if (k === kind) return; setKind(k); setItems([]); setErr(null); setStep(1); setFocus(null); };

  const last = !design || step === 3;
  const startLabel = design ? (direct ? "PPT 바로 만들기" : mockups === "plan" ? "기획 시작" : "기획 시작 (시안까지)") : "변환 시작";
  const canStart = ready && !working && !aiBlock && (!design || accentOk);
  const totalSize = items.reduce((a, i) => a + i.file.size, 0);
  const frontTxt = [front.cover && "표지", front.toc && "목차", front.divider && "간지"].filter(Boolean).join(" · ") || "없음";
  const frameTxt = [project.trim() && "사업명", logoN > 0 && `로고 ${logoN}개`].filter(Boolean).join(" · ") || "없음";
  const fontTxt = `${fontName("title", fontTitle)} / ${fontName("body", fontBody)}`;

  // 요약 패널 — [이름, 값, 단계, 항목]
  const rows: [string, ReactNode, Step, string][] = design ? [
    ["용도", purpose === "present" ? "발표용" : company ? "회사소개용" : "제출용", 1, "purpose"],
    ["언어", DECK_LANGS.find((x) => x[0] === lang)?.[1] ?? "한국어", 1, "lang"],
    ["자료", items.length ? `${hasText ? "글 + " : ""}${items.length}개 · ${fmtSize(totalSize)}` : text.trim() ? "직접 적은 글" : "없음", 1, "files"],
    ["디자인", company ? `테마 ${ctheme.toUpperCase()} · ${companyThemeName(ctheme)}${cfree ? " · 자유도" : ""}` : purpose === "submit" ? `세로 제안서 · ${verticalStyleName(vstyle)}` : `타입 ${style.toUpperCase()} · ${typeName(style)}`, 2, "design"],
    ...(purpose === "submit" ? [["톤", verticalToneName(vtone), 3, "vtone"] as [string, ReactNode, Step, string]]
      : company ? [["톤", companyToneName(ctone), 3, "ctone"] as [string, ReactNode, Step, string]] : []),
    ["서체", company ? "프리텐다드(고정)" : fontTxt, 2, "font"],
    ["장 수", slideUnset ? `${slideDef}장 (장 수 미입력)` : `${slides}장`, 3, "count"],
    ...(direct ? [] : [["시안", `${MODE_LABEL[mockups]}${mockups === "sample" ? ` ${planOpts.sample}장` : ""}`, 3, "timing"] as [string, ReactNode, Step, string]]),
    ...(company ? [] : [["강조색", <span className="inline-flex items-center gap-1.5 font-mono text-[13px]"><i className="w-3 h-3 rounded-full flex-none" style={{ background: accentOk ? accent : "var(--color-line-3)" }} />{accent}</span>, 3, "accent"] as [string, ReactNode, Step, string]]),
    ["틀", company ? (logos.vendor.length ? "회사 로고" : "로고 없음 — 회사 이름 글자") : frameTxt, 3, "frame"],
    ...(company ? [] : [["구성", frontTxt, 3, "extras"] as [string, ReactNode, Step, string]]),
    ["요청", note.trim() ? "있음" : "없음", 3, "note"],
  ] : [
    ["방식", "초안 PPT 다듬기", 1, "dfile"],
    ["파일", content ? `1개 · ${fmtSize(content.file.size)}` : "없음", 1, "dfile"],
    ["진행", pilot ? "한 장 먼저 보고 진행" : "전체 바로 진행", 1, "dmode"],
    ["서체", fontTxt, 1, "dfont"],
    ["요청", note.trim() ? "있음" : "없음", 1, "dreq"],
  ];
  const hl = (key: string) => (focus === key ? { background: "var(--color-orange-tint)", boxShadow: "0 0 0 1px var(--color-orange-soft)" } : undefined);

  // 올리기 모달 — 올리는 순서 그대로의 단계 목록
  const upSteps: { key: string; label: string; size?: number }[] = !working ? [] : !design
    ? [{ key: content!.file.name, label: content!.file.name, size: content!.file.size }]
    : [
      content && /\.pptx$/i.test(content.file.name) ? { key: content.file.name, label: `초안 · ${content.file.name}`, size: content.file.size } : { key: "__job", label: "작업 만들기" },
      ...contexts.map((c) => ({ key: c.file.name, label: c.file.name, size: c.file.size })),
      ...(["client", "vendor"] as const).filter((w) => logos[w].length).map((w) => ({ key: "__logo_" + w, label: (w === "client" ? "발주기관 로고" : "제안사 로고") + (logos[w].length > 1 ? ` ${logos[w].length}개` : ""), size: logos[w].reduce((a, f) => a + f.size, 0) })),
      { key: "__start", label: startLabel },
    ];
  const doneN = upSteps.filter((x) => doneNames.includes(x.key)).length;
  const curKey = upSteps.find((x) => !doneNames.includes(x.key))?.key;
  const all = Math.round(((doneN + (prog && prog.name === curKey ? prog.p.sent / Math.max(1, prog.p.total) : 0)) / Math.max(1, upSteps.length)) * 100);
  const modalSteps: UpStep[] = upSteps.map((s) => ({ ...s, state: doneNames.includes(s.key) ? "done" : s.key === curKey ? "cur" : "todo", p: s.key === curKey && prog?.name === s.key ? prog.p : null }));
  const heading = !curKey ? "다 올렸습니다" : curKey === "__job" ? "작업을 만드는 중…" : curKey === "__start" ? "기획을 시작합니다"
    : curKey.startsWith("__logo_") ? "로고를 올리는 중…" : design ? "자료를 올리는 중…" : "초안을 올리는 중…";

  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDrag(true); },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDrag(false); if (!working) add(e.dataTransfer.files); },
  };
  const fileRow = (it: Item, i: number) => (
    <div key={it.file.name + it.file.size} className="flex-none flex items-center gap-2.5 px-2.5 py-2 bg-white border border-line rounded-md">
      <span className="font-mono text-[12px] font-medium text-orange-d bg-orange-soft rounded-md px-[5px] py-0.5 flex-none">{extOf(it.file.name)}</span>
      <span className="flex-1 min-w-0 truncate font-semibold" title={it.file.name}>{it.file.name}</span>
      {design && (CONTENT_RE.test(it.file.name)
        ? <Seg sm value={it.role} onChange={(r) => setRole(i, r)} options={[["context", "배경 자료"], ["content", "장표 내용"]] as const} />
        : <span className="text-[12.5px] font-semibold text-dim whitespace-nowrap flex-none">배경 자료</span>)}
      <span className="text-[13px] text-dim whitespace-nowrap flex-none">{fmtSize(it.file.size)}</span>
      <button type="button" className="btn-icon danger !w-6 !h-6" title="빼기" aria-label={`${it.file.name} 빼기`} disabled={working} onClick={() => setItems((x) => x.filter((_, k) => k !== i))}><Ms name="close" size={17} /></button>
    </div>
  );

  const umenu = useContextMenu();
  const uItems = (): CtxItem[] => [
    ...(design && step > 1 ? [{ label: "이전 단계", icon: "arrow_back", onClick: () => goStep((step - 1) as Step) }] : []),
    ...(design && step < 3 ? [{ label: "다음 단계", icon: "arrow_forward", onClick: () => goStep((step + 1) as Step) }] : []),
    ...(last ? [{ label: startLabel, icon: "play_arrow", disabled: !canStart, onClick: start }] : []),
    ...(onCancel ? ["-" as const, { label: "취소", icon: "close", onClick: onCancel }] : []),
  ];
  return (
    <>
      {umenu.node}
      {/* 머리줄 — 방식 · 단계 · (오른쪽 끝) 이전 / 다음 · 시작 */}
      <header className="head pd-uhead !gap-4">
        <div className="head-title">새 변환</div>
        <Seg value={kind} onChange={switchKind} options={[["design", "내용으로 장표 만들기"], ["polish", "초안 PPT 다듬기"]] as const} />
        <span className="vsep" />
        {design && (
          <div className="flex items-center gap-1 min-w-0">
            {STEPS.map((l, i) => {
              const n = (i + 1) as Step, cur = step === n, done = step > n;
              return (
                <span key={l} className="contents">
                  <button type="button" aria-current={cur ? "step" : undefined} onClick={() => { if (goStep(n)) setFocus(null); }}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-md text-[14px] font-semibold whitespace-nowrap flex-none"
                    style={{ background: cur ? "var(--color-ground-3)" : "transparent", color: cur ? "var(--color-ink)" : done ? "var(--color-ink-2)" : "var(--color-ink-4)" }}>
                    <span className="w-[18px] h-[18px] rounded-full grid place-items-center text-[12px] flex-none"
                      style={{ background: cur ? "var(--color-ink)" : done ? "var(--color-ok-soft)" : "var(--color-ground-3)", color: cur ? "var(--color-ground)" : done ? "var(--color-ok)" : "var(--color-ink-4)" }}>
                      {done ? <Ms name="check" size={13} style={{ fontWeight: 700 }} /> : n}
                    </span>{l}
                  </button>
                  {i < 2 && <span className="w-4 h-px bg-[var(--color-line-3)] flex-none" />}
                </span>
              );
            })}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 flex-none">
          {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>취소</button>}
          <span className="vsep mr-1" />
          {design && step > 1 && <button type="button" className="btn-back !pl-2.5 !pr-3.5" onClick={() => { setStep((step - 1) as Step); setFocus(null); }}><Ms name="arrow_back" size={18} />이전</button>}
          {last
            ? (() => {
              // 필수 입력이 비었으면 누를 때 무엇이 빠졌는지 알린다(버튼을 꺼 두기만 하면 이유를 알 수 없다)
              const full = !!engine?.mine && engine.mine.active >= engine.mine.max;
              const why = full ? `동시에 진행할 수 있는 작업은 ${engine!.mine!.max}건입니다(지금 ${engine!.mine!.active}건 진행 중). 진행 중인 작업이 끝나거나 취소한 뒤 시작해 주세요.` : !ready ? (design ? "장표에 담을 내용을 적거나 자료 파일을 올려 주세요." : "초안 .pptx 파일을 올려 주세요.") : aiBlock ? "AI 키가 필요합니다 — 설정에서 키를 연결해 주세요." : design && !accentOk ? "강조색 코드를 확인해 주세요(예: 1866DA)." : design && !company && (!logos.client.length || !logos.vendor.length) ? `${!logos.client.length ? "발주기관" : "제안사"} 로고를 넣어 주세요 — 기본 로고는 필수입니다.` : undefined;
              return <button type="button" className={cn("btn-next !pr-3.5 min-w-[210px] justify-center", why && !working && "opacity-55")} disabled={working} title={why}
                onClick={() => { if (canStart && !why) start(); else if (why) { toast(why, "warn"); if (!ready && design) goStep(1); else if (design && !company && (!logos.client.length || !logos.vendor.length)) focusSec(3, "frame"); } }}>
                {busy ?? startLabel}<Ms name="play_arrow" size={18} /></button>;
            })()
            : <button type="button" className="btn-next !pr-3.5" onClick={() => { if (goStep((step + 1) as Step)) setFocus(null); }}>다음 — {STEPS[step]}<Ms name="arrow_forward" size={18} /></button>}
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 min-[1000px]:grid-cols-[minmax(0,1fr)_320px]" style={{ gridTemplateRows: "minmax(0,1fr)" }} onContextMenu={(e) => umenu.open(e, uItems())}>
        <div ref={scroller} className="min-h-0 overflow-auto scroll-thin px-8 py-6 flex flex-col">
          <div className="w-full flex-[1_0_auto] flex flex-col gap-5">
            {err && (
              <div role="alert" className="flex-none flex items-start gap-2 rounded-md border border-[var(--color-warn-line)] bg-[var(--color-warn-soft)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-warn)] leading-[1.55]">
                <Ms name="error" size={18} className="mt-px" /><span className="flex-1 min-w-0 break-keep">{err}</span>
                <button type="button" className="btn-icon !w-6 !h-6 !text-[var(--color-warn)]" title="닫기" aria-label="닫기" onClick={() => setErr(null)}><Ms name="close" size={17} /></button>
              </div>
            )}

            {/* ── 초안 PPT 다듬기 — 한 화면. 요청 사항 칸이 남는 높이를 채운다 ── */}
            {!design && <>
              <div className="text-ink2 leading-[1.55]">여러 사람이 만든 초안을 한 사람이 만든 것처럼 정돈합니다 — 서체·색 통일, 3D 아이콘 교체, 도식 재구성, 재검수.</div>
              <section className="flex flex-col gap-2">
                <SecTitle icon="edit" title="작업 이름" />
                <input className="field" aria-label="작업 이름" value={shownTitle} maxLength={120} disabled={working} placeholder="비워 두면 파일 이름으로 자동으로 붙입니다"
                  onChange={(e) => { setTitleTouched(true); setTitle(e.target.value); }} />
              </section>
              <Sec id="dfile" style={hl("dfile")}>
                <SecTitle icon="upload_file" title="초안 파일" desc="원본은 그대로 보관합니다" />
                <div className={cn("border rounded-md px-3 py-2.5 flex flex-col gap-2 transition-colors", drag ? "border-orange bg-orange-tint" : "border-line bg-panel")} {...dropProps}>
                  {items.map(fileRow)}
                  <button type="button" disabled={working} onClick={() => input.current?.click()}
                    className={cn("flex items-center gap-3 px-3 py-3.5 border border-dashed rounded-md text-left hover:border-orange hover:bg-[var(--color-orange-tint)]", drag ? "border-orange bg-[var(--color-orange-tint)]" : "border-[var(--color-line-3)] bg-white")}>
                    <span className="font-semibold text-orange-d inline-flex items-center gap-1 whitespace-nowrap flex-none"><Ms name="upload_file" size={19} />{items.length ? "다른 .pptx 로 바꾸기" : "초안 .pptx 올리기"}</span>
                    <span className="text-[13px] text-dim whitespace-nowrap">끌어다 놓거나 클릭</span>
                    <span className="ml-auto font-mono text-[12px] text-faint whitespace-nowrap flex-none">pptx · 최대 1GB</span>
                  </button>
                </div>
                <p className="mt-2 text-[12.5px] font-semibold text-ink2">개인정보·대외비가 든 문서는 올리지 마세요.</p>
              </Sec>
              <Sec id="dmode" style={hl("dmode")}>
                <SecTitle icon="tune" title="진행 방식" />
                <div className="grid grid-cols-2 gap-2.5">
                  {([[true, "한 장 먼저 보고 진행", "대표 장 하나를 10분 안팎으로 먼저 마감해 보여 드립니다. 의견을 주시면 그 방향으로 나머지 장을 진행합니다."],
                     [false, "전체 바로 진행", "모든 장을 한 번에 정돈합니다. 결과에서 장별로 의견을 남겨 고칩니다."]] as const).map(([v, t, d]) => (
                    <button key={t} type="button" aria-pressed={pilot === v} disabled={working} onClick={() => setPilot(v)}
                      className={cn("text-left px-3.5 py-3 rounded-md border flex flex-col gap-[5px]", pilot === v ? "card-on" : "border-line bg-white hover:border-orange-line")}>
                      <span className="flex items-center gap-2">
                        <span className={cn("radio", pilot === v && "on")} />
                        <span className={cn("font-bold whitespace-nowrap", pilot === v ? "text-orange-d" : "text-ink")}>{t}</span>
                        {v && <span className="text-[12px] font-bold text-orange-d whitespace-nowrap">권장</span>}
                      </span>
                      <span className="text-[13px] text-ink2 leading-[1.45] pl-[26px] break-keep">{sent(d)}</span>
                    </button>
                  ))}
                </div>
              </Sec>
              <Sec id="dfont" style={hl("dfont")} className="!gap-2.5">
                <SecTitle icon="text_fields" title="서체" desc="모든 글을 통일 · 20pt 이상은 제목용, 나머지는 본문용 굵기 4단계" />
                <FontPicker compact title={fontTitle} body={fontBody} onTitle={setFontTitle} onBody={setFontBody} disabled={working} />
              </Sec>
              <Sec id="dreq" style={hl("dreq")} grow>
                <SecTitle icon="chat" title="요청 사항" desc="선택" />
                <textarea aria-label="요청 사항" className="field flex-[1_0_auto] !h-0 min-h-[140px]" maxLength={2000} value={note} disabled={working} onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 키메시지는 핑크로, 4쪽 표는 건드리지 말 것, 회사 색은 버건디 C01348" />
              </Sec>
            </>}

            {/* ── 1단계 내용 — 스크롤 없이 화면 높이 100%. 내용 칸이 남는 높이를 채운다 ── */}
            {design && step === 1 && <>
              <Sec id="purpose" style={hl("purpose")} className="!gap-2.5">
                <SecTitle icon="target" title="용도" desc="같은 내용이라도 장 구성이 달라집니다" />
                {/* 태블릿·모바일은 성격 뱃지를 숨기고 카드를 줄여 한 줄 2개(모바일은 쌓기) — 데스크톱(lg)만 뱃지 */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {/* 성격 뱃지는 카드마다 두 개 — 한 줄에 들어가게 짧게(사용자 2026-10-16 "한 줄에 깔끔하게") */}
                  {([["present", "발표용", "짧은 시간에 '왜 우리인가'를 남긴다", "play_arrow", ["한 장 한 메시지", "대본 포함"]],
                     ["submit", "제출용", "A4 세로 제안서를 자동으로 만든다", "description", ["RFP 목차대로", "A4 세로"]],
                     ["company", "회사소개용", "회사소개서 덱을 바로 만든다", "apartment", ["굵은 카피", "편집 가능"]]] as const).map(([k, t, d, ic, tags]) => {
                    const on = purpose === k;
                    return (
                      <button key={k} type="button" onClick={() => setPurpose(k)} aria-pressed={on} disabled={working}
                        className={cn("relative text-left px-4 py-4 lg:px-[22px] lg:py-5 rounded-field border-[1.5px] flex items-center lg:items-start gap-3.5 lg:gap-[18px] transition-[border-color,background,box-shadow] duration-150", on ? "card-on" : "border-line bg-white hover:border-orange-line")}>
                        <span className={cn("w-11 h-11 lg:w-14 lg:h-14 rounded-field flex-none grid place-items-center", on ? "text-white shadow-[0_4px_12px_rgba(0,0,0,.3)]" : "bg-[var(--color-ground-3)] text-ink2")}
                          style={on ? { background: "var(--color-ink)" } : undefined}><Ms name={ic} size={30} /></span>
                        <span className="flex-1 min-w-0 flex flex-col gap-1.5 pr-7">
                          <span className={cn("text-[18px] lg:text-[20px] font-extrabold tracking-[-0.02em] leading-tight", on ? "text-orange-d" : "text-ink")}>{t}</span>
                          <span className="text-[13px] lg:text-[14px] text-ink3 break-keep">{d}</span>
                          <span className="hidden lg:flex flex-nowrap gap-1 mt-1 overflow-hidden">
                            {tags.map((x) => <span key={x} className={cn("flex-none whitespace-nowrap text-[12px] font-semibold rounded-full px-2 py-0.5 border", on ? "text-orange-d bg-white border-orange-line" : "text-ink3 bg-[var(--color-ground-3)] border-transparent")}>{x}</span>)}
                          </span>
                        </span>
                        {on && <span className="absolute top-3 right-3 lg:top-[18px] lg:right-[18px] w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-orange text-white grid place-items-center"><Ms name="check" size={19} style={{ fontWeight: 700 }} /></span>}
                      </button>
                    );
                  })}
                </div>
              </Sec>
              {/* PC 는 작업 이름·제작 언어를 반반(5:5), 좁은 화면은 위아래 */}
              <div className="grid gap-5 lg:grid-cols-2 lg:gap-6 items-start">
              <section className="flex flex-col gap-2 min-w-0">
                <SecTitle icon="edit" title="작업 이름" />
                <input className="field" aria-label="작업 이름" value={shownTitle} maxLength={120} disabled={working} placeholder="비워 두면 자료 이름으로 자동으로 붙입니다"
                  onChange={(e) => { setTitleTouched(true); setTitle(e.target.value); }} />
              </section>
              <Sec id="lang" style={hl("lang")} className="!gap-2 min-w-0">
                <SecTitle icon="translate" title="제작 언어" desc="자료가 한국어여도 장표 글·시안·대본을 이 언어로 만듭니다" />
                <Select value={lang} onValueChange={(v) => setLang(v as DeckLang)} disabled={working}>
                  <SelectTrigger className="h-[42px] w-full" aria-label="제작 언어"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DECK_LANGS.map(([k, t]) => <SelectItem key={k} value={k}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Sec>
              </div>
              <Sec id="files" style={hl("files")} grow>
                <SecTitle icon="notes" title="내용" desc="직접 적거나, 비워 두고 자료만 올려도 됩니다" />
                <div className={cn("flex-[1_0_auto] flex flex-col border rounded-md overflow-hidden bg-white transition-[border-color,box-shadow] focus-within:border-orange focus-within:shadow-[0_0_0_3px_var(--color-orange-soft)]", drag ? "border-orange" : "border-line")} {...dropProps}>
                  <textarea aria-label="내용" className="block w-full flex-[1_0_auto] h-0 min-h-[140px] border-0 px-4 py-3.5 leading-[1.6] outline-none resize-none bg-transparent"
                    value={text} disabled={working} maxLength={300000} onChange={(e) => setText(e.target.value)}
                    placeholder={"장표에 담을 내용을 적어 주세요. 비워 두고 자료만 올려도 됩니다.\n\n예)  # 사업 개요\n      - 대상: OO시 업무지원포털 (사용자 5,000명)\n      # 수행 전략\n      1. 안정성 확보 — 현 운영 인력 그대로 투입"} />
                  <div className="flex-none border-t border-line-soft px-3 py-2.5 bg-panel flex flex-col gap-2">
                    {items.length > 0 && <div className="flex flex-col gap-2 max-h-[176px] overflow-y-auto scroll-thin">{items.map(fileRow)}</div>}
                    <button type="button" disabled={working} onClick={() => input.current?.click()}
                      className={cn("flex items-center justify-center gap-4 px-5 border-2 border-dashed rounded-field text-left transition-colors hover:border-orange hover:bg-[var(--color-orange-tint)]",
                        drag ? "border-orange bg-[var(--color-orange-tint)]" : "border-orange-line bg-[var(--color-orange-tint)]", items.length ? "py-3" : "py-7")}>
                      <span className={cn("rounded-full flex-none bg-white border border-orange-line text-orange grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,.12)]", items.length ? "w-10 h-10" : "w-12 h-12")}><Ms name="upload" size={items.length ? 21 : 24} /></span>
                      <span className="flex flex-col gap-1 min-w-0">
                        <span className="text-[15px] font-bold text-orange-d">{items.length ? "파일 더 올리기 — 끌어다 놓거나 클릭" : "여기에 파일을 끌어다 놓거나 클릭해서 올리세요"}</span>
                        <span className="text-[13px] text-ink2 break-keep">제안요청서 · 과업지시서 · 평가 기준 · 회사 소개 · 이전 제안서 · 초안 — pdf · docx · hwp · hwpx · xlsx · pptx · md · txt, 여러 개 가능</span>
                        {/* 업로드 화면 개인정보 안내(품질 판정 SEC-014, 기획 §17.2 ⑤) */}
                        <span className="text-[13px] font-semibold text-ink2 break-keep">개인정보·대외비가 든 문서는 올리지 마세요.</span>
                      </span>
                    </button>
                    {items.length > 0 && (
                      <div className="text-[12.5px] text-dim leading-[1.5] break-keep">
                        <b className="text-ink2">배경 자료</b>는 장표에 그대로 넣지 않고 기획이 사업을 이해하는 데만 씁니다 (장표 만들기를 누르면 바로, 아니면 올린 지 7일 뒤 자동 삭제 — 요약은 남김). 초안·원고 파일은 <b className="text-ink2">장표 내용</b>으로 바꿔 주세요. 전에 내려받은 <b className="text-ink2">기획 (.md)</b> 파일을 장표 내용으로 올리면 기획 단계 없이 그 기획 그대로 시작합니다(비용 0).
                      </div>
                    )}
                  </div>
                </div>
              </Sec>
            </>}

            {/* ── 2단계 디자인 — 타입 카드 6장(3열) + 제목·본문 서체 ── */}
            {design && step === 2 && <>
              <Sec id="design" style={hl("design")} className="!gap-2.5">
                {company ? <>
                  <SecTitle icon="palette" title="회사소개서 테마" desc="표지 · 간지 · 숫자 · 카드 · 연혁 · 연락처까지 레이아웃 13종이 이 테마로 그려집니다" />
                  <CompanyThemePicker value={ctheme} onChange={setCtheme} disabled={working} tone={ctone} />
                  <label className={cn("flex items-start gap-2.5 rounded-md border px-3.5 py-3 cursor-pointer bg-white", cfree ? "card-on" : "border-line hover:border-orange-line", working && "opacity-60 cursor-default")}>
                    <input type="checkbox" className="accent-[var(--color-point)] m-0 mt-[3px] flex-none" checked={cfree} disabled={working} onChange={(e) => setCfree(e.target.checked)} />
                    <span className="flex flex-col gap-[3px] min-w-0">
                      <span className="font-bold text-ink">자유도 — 파워에셋에서 그림을 자유롭게</span>
                      <span className="text-[13px] text-ink2 leading-[1.45] break-keep">표지·간지·마무리 배경을 이 테마 묶음에만 두지 않고 AI가 파워에셋에서 내용에 맞는 것을 고릅니다.</span>
                      <span className="text-[12.5px] text-faint leading-[1.45] break-keep">AI는 Claude Opus 5.5를 쓰고, Claude 크레딧이 없으면 OpenRouter 글 모델로 이어 갑니다.</span>
                    </span>
                  </label>
                </> : purpose === "submit" ? <>
                  <SecTitle icon="palette" title="세로 제안서 디자인 스타일" desc="표지 · 목차 · 간지 · 본문의 모양이 이 스타일로 정해집니다 — 색은 다음 단계에서 톤으로 고릅니다" />
                  <VerticalStylePicker value={vstyle} onChange={setVstyle} disabled={working} />
                </> : <>
                  <SecTitle icon="palette" title="디자인 타입" desc="시안 이미지 · 머리 띠 · 표지 · 목차 · 간지가 모두 이 타입으로 만들어집니다" />
                  <DesignTypePicker value={style} onChange={setStyle} disabled={working} />
                </>}
              </Sec>
              <Sec id="font" style={hl("font")} className="!gap-3">
                {company ? <SecTitle icon="text_fields" title="서체" desc="프리텐다드 다섯 굵기로 고정입니다 — 산출물에 서체 파일을 함께 넣습니다" />
                  : <FontPicker vertical={purpose === "submit"} title={fontTitle} body={fontBody} onTitle={setFontTitle} onBody={setFontBody} disabled={working} />}
              </Sec>
            </>}

            {/* ── 3단계 세부 설정 — 왼쪽 220px 라벨 칸 + 오른쪽 입력 ── */}
            {design && step === 3 && (
              <section className="flex flex-col">
                <Row id="count" style={hl("count")} icon="filter_none" title="장 수" sub={company ? "14쪽 안팎 권장" : "8장까지 권장"}>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <input className="field !h-[38px] !w-[72px] !px-3 text-right font-mono" inputMode="numeric" value={slideN} placeholder={String(slideDef)} aria-label="장 수"
                          aria-describedby={slideUnset ? "slide-unset" : undefined}
                          onChange={(e) => setSlideN(e.target.value.replace(/\D/g, "").slice(0, 3))} />장
                      </div>
                      <span className="sec-desc">{company ? "AI 가 구성을 정하며 이 쪽 수 안팎으로 맞춥니다. 표지·목차·간지·연락처를 포함한 수입니다" : "한 번에 8장까지가 가장 안정적입니다. 더 많으면 8장씩 묶어 차례로 만듭니다"}</span>
                    </div>
                    {slideUnset && (
                      <div id="slide-unset" role="status" className="rounded-md border border-orange-line bg-orange-tint px-3.5 py-2.5 text-[13px] text-ink3 leading-[1.6] break-keep">
                        <b className="text-ink">장 수를 적지 않으면 {slideDef}장{company ? " 안팎으로" : "만"} 만듭니다.</b>{" "}
                        자료가 많아도 늘리지 않습니다. 더 필요하면 원하는 장 수를 적어 주세요.
                      </div>
                    )}
                    {slides > 8 && !company && (
                      <div className="rounded-md border border-orange-line bg-orange-tint px-3.5 py-2.5 text-[13px] text-ink3 leading-[1.6] break-keep">
                        <b className="text-ink">{slides}장은 8장씩 {Math.ceil(slides / 8)}묶음으로 나눠 차례로 만듭니다.</b> 한 번에 다 만들면 뒤쪽 장의 품질이 떨어지고 중간에 실패하면 전부 다시 해야 해서, 시안·장표 제작·발표 대본 모두 8장 단위로 진행합니다. 먼저 8장 이하로 방향을 확인한 뒤 늘리는 것을 권합니다.
                      </div>
                    )}
                  </div>
                </Row>
                {!direct && <Row id="timing" style={hl("timing")} icon="image" title="시안 이미지 시점" sub="비용 대부분 발생">
                  <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                    {([
                      ["plan", "와이어프레임을 먼저 받아 함께 고치고, 만들 장을 고릅니다", "이미지 비용 0"],
                      ["sample", "대표 장 몇 개만 바로 시안으로. 나머지는 나중에", "장당 비용 × 샘플 수"],
                      ["all", "기획이 끝나면 모든 장의 시안을 이어서 만듭니다", "장당 비용 × 전체 장 수"],
                    ] as const).map(([k, d, cost]) => {
                      const on = mockups === k;
                      const icon = k === "plan" ? "draw" : k === "sample" ? "photo_library" : "burst_mode";   // 카드마다 아이콘(사용자 지시 — 직관적으로)
                      return (
                        <div key={k} role="button" tabIndex={0} aria-pressed={on} onClick={(e) => { if ((e.target as HTMLElement).closest("input,textarea,select,button,a")) return; setMockups(k); }}
                          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); setMockups(k); } }}
                          className={cn("text-left cursor-pointer p-3 rounded-md border flex flex-col gap-[5px] transition-[border-color,background,box-shadow] duration-150", on ? "card-on" : "border-line bg-white hover:border-orange-line")}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("w-7 h-7 rounded-md grid place-items-center flex-none", on ? "bg-ink text-white" : "bg-panel text-ink3")}><Ms name={icon} size={18} /></span>
                            <span className={cn("font-bold whitespace-nowrap", on ? "text-orange-d" : "text-ink")}>{MODE_LABEL[k]}</span>
                            {k === "plan" && <span className="text-[12px] font-bold text-orange-d whitespace-nowrap">추천</span>}
                            {on && <span className="ml-auto w-5 h-5 rounded-full bg-orange text-white grid place-items-center flex-none"><Ms name="check" size={14} style={{ fontWeight: 700 }} /></span>}
                          </div>
                          <div className="text-[13px] text-ink2 leading-[1.45] break-keep">{sent(d)}</div>
                          <div className="flex items-center gap-2 min-h-8">
                            <span className="text-[12.5px] text-faint">{cost}</span>
                            {k === "sample" && (   // 샘플 수는 고르기 전에도 오른쪽에 — 고를 때 카드가 길어지지 않게(사용자 지시)
                              <span className={cn("ml-auto flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap", on ? "text-ink3" : "text-faint")} onClick={(e) => e.stopPropagation()}>
                                샘플 <input className="field !h-8 !w-14 !px-2 text-center" inputMode="numeric" value={sampleN} aria-label="샘플 장 수" disabled={!on}
                                  onChange={(e) => setSampleN(e.target.value.replace(/\D/g, "").slice(0, 2))} /> 장
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Row>}
                {company && (
                  <Row id="ctone" style={hl("ctone")} icon="palette" title="톤" sub="파랑 3 · 빨강 2 · 초록 2 · 보라 2 · 주황 2 · 직접 고르기">
                    <CompanyTonePicker value={ctone} onChange={setCtone} disabled={working} theme={ctheme} />
                  </Row>
                )}
                {purpose === "submit" && (
                  <Row id="vtone" style={hl("vtone")} icon="palette" title="톤" sub="머리 띠 · 간지 · 표 색">
                    <VerticalTonePicker value={vtone} onChange={(t) => { setVtone(t.id); setAccent(t.accent); }} disabled={working} />
                  </Row>
                )}
                {!company && <Row id="accent" style={hl("accent")} icon="format_color_fill" title="강조색" sub="핵심 단어 강조">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ACCENTS.map(([c, l]) => (
                        <button key={c} type="button" title={l} aria-label={l} aria-pressed={accent.toUpperCase() === c} onClick={() => setAccent(c)}
                          className="w-[26px] h-[26px] rounded-full p-0 flex-none" style={{ background: c, border: "2px solid #fff", boxShadow: accent.toUpperCase() === c ? `0 0 0 2px ${c}` : "0 0 0 1px var(--color-line)" }} />
                      ))}
                      <label title="다른 색 고르기" className="w-[26px] h-[26px] rounded-full border border-dashed border-[var(--color-ink-4)] text-dim grid place-items-center cursor-pointer hover:border-orange hover:text-orange-d flex-none">
                        <Ms name="add" size={17} /><input type="color" className="sr-only" value={accentOk ? accent : "#1866DA"} onChange={(e) => setAccent(e.target.value.toUpperCase())} />
                      </label>
                      <input className={cn("field !h-[34px] !w-[100px] !px-2 font-mono !text-[13px] ml-1.5", !accentOk && "!border-[var(--color-warn)]")} value={accent} maxLength={7} aria-label="색상 코드"
                        onChange={(e) => setAccent(e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value)} />
                      {!accentOk && <span className="text-[12.5px] font-semibold text-[var(--color-warn)] whitespace-nowrap">#RRGGBB 형식으로 적어 주세요</span>}
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[16px] font-extrabold text-[#13235B]">무엇보다 <span style={{ color: accentOk ? accent : undefined }}>안정성 확보</span>가 최우선</span>
                      <span className="h-[22px] px-2 rounded-full text-white text-[12px] font-bold inline-flex items-center whitespace-nowrap" style={{ background: accentOk ? accent : "var(--color-ink-4)" }}>강조</span>
                      <span className="sec-desc">제목의 핵심 단어와 강조 표시에 쓰는 색 (기본 파란색은 그대로)</span>
                    </div>
                  </div>
                </Row>}
                <Row id="frame" style={hl("frame")} icon="web_asset" title={company ? "회사 로고" : "머리 · 바닥 틀"} sub={company ? "모든 쪽 왼쪽 위" : "모든 장 공통"}>
                  <div className="flex flex-col gap-2">
                    {!company && <input className="field" aria-label="사업명" value={project} maxLength={80} onChange={(e) => setProject(e.target.value)} placeholder="사업명 — 머리 띠 오른쪽 (예: OO시 업무지원포털 시스템 유지관리)" />}
                    {/* 미리보기 틀 — 실제 들어가는 자리와 같다: 바닥 왼쪽 발주기관 로고 · 가운데 쪽번호 · 오른쪽 제안사 로고. 회사소개서는 회사 로고 하나(왼쪽 위) */}
                    <div className="border border-line rounded-md overflow-hidden text-[12px] bg-white">
                      {!company && <>
                      <div className="bg-ink text-white flex justify-between gap-4 px-3 py-2 font-semibold">
                        <span className="whitespace-nowrap flex-none">장 이름 · 절 제목</span><span className={cn("truncate min-w-0", !project.trim() && "opacity-70")}>{project.trim() || "사업명"}</span>
                      </div>
                      <div className="h-14 grid place-items-center text-faint">본문 (시안 이미지)</div>
                      </>}
                      <div className={cn("flex items-end justify-between gap-3 px-3 py-2.5 bg-panel", !company && "border-t border-line-soft")}>
                        {(company ? (["vendor"] as const) : (["client", "vendor"] as const)).map((w) => (
                          <span key={w} className="contents">
                            {w === "vendor" && !company && <span className="text-faint pb-3 whitespace-nowrap flex-none">쪽번호</span>}
                            <div className="flex-1 min-w-0 max-w-[300px] border border-dashed border-orange-line rounded-md p-2.5 flex flex-col gap-2 bg-[var(--color-orange-tint)]">
                              <div className={cn("flex items-center gap-1.5 whitespace-nowrap", w === "vendor" ? "justify-end" : "justify-start")}>
                                {w === "client" && <Ms name="south_west" size={18} />}
                                <span className="font-bold text-[13.5px] text-ink">{w === "client" ? "발주기관 로고" : company ? "회사 로고" : "제안사 로고"}</span>
                                <span className="text-[12px] text-faint">PNG · JPG</span>
                                {w === "vendor" && <Ms name="south_east" size={18} />}
                              </div>
                              {logos[w].map((lf, li) => (
                                <div key={li} className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-panel border border-line">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11.5px] font-bold text-faint flex-none">기본</span>
                                    <span className="flex-1 min-w-0 truncate font-bold text-[13px] text-[#13235B]" title={lf.name}>{lf.name}</span>
                                    <button type="button" className="btn-icon danger !w-5 !h-5" title="빼기" aria-label="로고 빼기" onClick={() => dropLogo(w, li)}><Ms name="close" size={17} /></button>
                                  </div>
                                  <div className="flex items-center gap-2 text-[12.5px]" title="표지·간지처럼 어두운 바탕에 쓰는 흰색 로고(선택). 없으면 기본 로고 모양을 흰색으로 바꿔 씁니다">
                                    <span className="text-[11.5px] font-bold text-faint flex-none">흰색</span>
                                    {whites[w][li] ? (
                                      <>
                                        <span className="flex-1 min-w-0 truncate font-semibold text-ink2">{whites[w][li]!.name}</span>
                                        <button type="button" className="btn-icon danger !w-5 !h-5" title="흰색 로고 빼기" aria-label="흰색 로고 빼기" onClick={() => setWhites((x) => { const a = [...x[w]]; a[li] = undefined; return { ...x, [w]: a }; })}><Ms name="close" size={17} /></button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="flex-1 min-w-0 truncate text-faint">선택 — 없으면 자동</span>
                                        <button type="button" className="text-orange-d font-bold whitespace-nowrap hover:underline" onClick={() => setLogoFind({ w, white: li })}>찾기</button>
                                        <label className="text-ink3 font-semibold whitespace-nowrap cursor-pointer hover:underline rounded-md focus-within:shadow-[0_0_0_3px_var(--color-orange-soft)]">파일<input type="file" accept=".png,.jpg,.jpeg" className="sr-only" onChange={(e) => { pickLogo(w, e.target.files?.[0], li); e.target.value = ""; }} /></label>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {w === "vendor" && !company && (   // 자주 쓰는 우리 로고 — 찾지 않고 바로(파워플러스의 투명 PNG). 회사소개서는 각자 자기 회사 로고라 두지 않는다(사용자 2026-10-16)
                                <div className="flex gap-1.5">
                                  {SOLIDEO.map(([id, wid, label]) => (
                                    <button key={id} type="button" disabled={logos.vendor.some((f) => f.name === `${id}.png`)} onClick={() => pickSolideo(id, wid)}
                                      className="flex-1 min-w-0 h-9 px-2 border border-line bg-white rounded-md inline-flex items-center justify-center hover:border-orange disabled:opacity-40 disabled:cursor-default" title={`${label} 로고 넣기`}>
                                      <img src={logoFile(id)} alt={label} className="max-h-[22px] max-w-full object-contain" />
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => setLogoFind({ w })}
                                  className="flex-1 min-w-0 h-9 px-2.5 border border-line bg-white rounded-md text-[13px] font-bold text-orange-d inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:border-orange hover:bg-[var(--color-orange-tint)]"><Ms name="search" size={18} />파워플러스에서 찾기</button>
                                <label className="h-9 px-3 border border-line bg-white rounded-md text-[13px] font-semibold text-ink3 inline-flex items-center justify-center gap-1.5 whitespace-nowrap flex-none cursor-pointer hover:bg-panel focus-within:border-orange focus-within:shadow-[0_0_0_3px_var(--color-orange-soft)]">
                                  <Ms name="upload" size={18} />파일<input type="file" accept=".png,.jpg,.jpeg" className="sr-only" onChange={(e) => { pickLogo(w, e.target.files?.[0]); e.target.value = ""; }} />
                                </label>
                              </div>
                            </div>
                          </span>
                        ))}
                      </div>
                    </div>
                    {company ? <div className="sec-desc">모든 쪽 왼쪽 위에 들어갑니다. 어두운 표지·간지에는 흰색 로고를 쓰고, 없으면 기본 로고를 흰색으로 바꿔 씁니다(투명 PNG 일 때). 로고가 없으면 회사 이름을 글자로 넣습니다.</div> :
                    <div className="sec-desc">모든 장에 같은 위치·크기로 들어갑니다 (시안과 실제 장표 모두). 기본 로고는 필수입니다. 표지·간지처럼 어두운 바탕에 쓸 흰색 로고는 선택이며, 없으면 기본 로고를 흰색으로 바꿔 씁니다. 로고는 PNG·JPG, 5MB 까지. 주관기관이 둘 이상이거나 컨소시엄이면 3개까지 더할 수 있습니다 — 올린 순서대로 나란히 놓입니다.</div>}
                  </div>
                </Row>
                {!company && <Row id="extras" style={hl("extras")} icon="auto_stories" title="표지 · 목차 · 간지" sub="자동 생성 · 무료">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2 flex-wrap">
                      {([["cover", "표지", "사업명 · 제목 · 날짜 · 로고"], ["toc", "목차", "장 이름과 쪽 범위"], ["divider", "간지", "장이 바뀔 때마다 — 장이 둘 이상일 때만"]] as const).map(([k, t, d]) => (
                        <button key={k} type="button" aria-pressed={front[k]} onClick={() => setFront({ ...front, [k]: !front[k] })}
                          className={cn("flex items-start gap-2 text-left px-3 py-2.5 rounded-md border min-w-[180px]", front[k] ? "border-orange bg-[var(--color-orange-tint)]" : "border-line bg-white hover:bg-panel")}>
                          <span className={cn("mt-px w-4 h-4 rounded-md flex-none grid place-items-center text-white border-[1.5px]", front[k] ? "bg-orange border-orange" : "bg-white border-[var(--color-line-3)]")}>
                            {front[k] && <Ms name="check" size={13} style={{ fontWeight: 700 }} />}
                          </span>
                          <span className="flex flex-col gap-0.5"><span className="font-bold text-ink">{t}</span><span className="text-[12.5px] text-dim">{d}</span></span>
                        </button>
                      ))}
                    </div>
                    {front.cover && (
                      <div className="flex gap-2 flex-wrap items-end">
                        <label className="flex flex-col gap-1">
                          <span className="text-[12.5px] font-semibold text-ink3">표지 행사 이름</span>
                          <input className="field !w-[220px]" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="제안설명회" maxLength={30} list="pd-events" />
                          <datalist id="pd-events"><option value="제안설명회" /><option value="착수보고" /><option value="중간보고" /><option value="완료보고" /><option value="제안서" /></datalist>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[12.5px] font-semibold text-ink3">표지 날짜</span>
                          <input className="field !w-[160px]" value={evDate} onChange={(e) => setEvDate(e.target.value)} placeholder={new Date().toISOString().slice(0, 7).replace("-", ". ") + "."} maxLength={20} />
                        </label>
                        <span className="text-[12.5px] text-faint pb-2">비워 두면 '제안설명회'와 작성한 달이 들어갑니다</span>
                      </div>
                    )}
                    <div className="sec-desc">기획의 장·절로 자동으로 만듭니다. 본문 쪽번호는 그대로입니다. 시안을 확정할 때나 완성한 뒤(글 고치기)에도 넣고 뺄 수 있습니다. <b className="text-ink2">본문(컨텐츠) 장만 만들 때는 세 가지를 모두 해제하세요.</b></div>
                  </div>
                </Row>}
                <Row id="note" style={hl("note")} icon="chat" title="요청 사항" sub="선택" last>
                  <textarea aria-label="요청 사항" className="field min-h-[180px] !resize-y" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="예: 표지·목차도 넣기 / 한 장에 글을 많이 넣지 말 것 / 기관명은 'OO시' 로" />
                </Row>
              </section>
            )}
          </div>
          <input ref={input} type="file" aria-label="자료 파일 올리기" multiple={design} hidden accept={design ? ".pdf,.docx,.hwpx,.hwp,.xlsx,.pptx,.md,.txt,.markdown,.csv" : ".pptx"} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </div>

        {/* 요약 패널 — 정보만. 줄을 누르면 그 항목으로 간다 */}
        <aside className="border-l border-line bg-panel flex flex-col min-h-0">
          <div className="flex-none px-5 pt-5 pb-2 font-bold">요약</div>
          <div className="flex-1 min-h-0 overflow-auto scroll-thin px-5 pt-0.5 pb-5">
            {rows.map(([k, v, st, key]) => {
              const on = focus === key && (k !== "방식");
              return (
                <button key={k} type="button" onClick={() => focusSec(st, key)} title={`${k} 고치러 가기${typeof v === "string" ? ` · ${v}` : ""}`} aria-label={`${k} 고치러 가기${typeof v === "string" ? ` · ${v}` : ""}`}
                  className={cn("w-[calc(100%+16px)] grid items-center gap-2.5 px-2 py-[9px] -mx-2 rounded-md border-0 border-b border-line-soft text-left", on ? "bg-[var(--color-orange-tint)] shadow-[0_0_0_1px_var(--color-orange-line)]" : "bg-transparent hover:bg-white hover:shadow-[0_0_0_1px_var(--color-line)]")}
                  style={{ gridTemplateColumns: "48px minmax(0,1fr) auto" }}>
                  <span className="text-[13px] text-dim whitespace-nowrap">{k}</span>
                  <span className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">{v}</span>
                  <Ms name={on ? "edit_note" : "edit"} size={19} className={on ? "text-orange-d" : "text-faint"} />
                </button>
              );
            })}

            {aiBlock && (
              <div className="mt-4 p-3 rounded-md border border-orange-line bg-orange-tint flex items-start gap-2 text-[13px] text-ink3 leading-[1.55]">
                <Ms name="key" size={18} className="text-orange-d mt-px" />
                <div className="break-keep">시안을 만들려면 AI 키가 필요합니다. <button type="button" className="text-orange-d underline font-bold" onClick={onSettings}>AI 키 설정</button>에서 OpenRouter 키를 넣어 주세요.</div>
              </div>
            )}

            {/* 무슨 일이 일어나는지 */}
            <div className={cn("mt-4 p-3 rounded-md border flex flex-col gap-1.5", ready ? "bg-white border-line" : "bg-transparent border-dashed border-[var(--color-line-3)]")}>
              <div className="text-[13px] text-dim flex items-center gap-1.5"><Ms name={ready ? "play_circle" : "info"} size={17} className={ready ? "text-orange" : "text-faint"} />이렇게 진행합니다</div>
              <div className={cn("text-[13px] leading-[1.6] break-keep", ready ? "text-ink3" : "text-dim")}>{sent(summary)}</div>
            </div>

            {design && (
              <div className="mt-3 p-3 rounded-md bg-white border border-line flex flex-col gap-1.5">
                <div className="text-[13px] text-dim">예상 비용</div>
                <div className="flex justify-between gap-2"><span className="whitespace-nowrap">기획 · 와이어프레임</span><span className="font-bold whitespace-nowrap">이미지 비용 0</span></div>
                {direct ? <div className="flex justify-between gap-2"><span className="whitespace-nowrap">시안 이미지</span><span className="font-bold whitespace-nowrap" title="시안 이미지를 만들지 않고 PPT 를 바로 만들어 쪽 캡처로 보여 드립니다">{company ? "없음 · HTML 렌더" : "없음 · PPT 캡처"}</span></div>
                  : <div className="flex justify-between gap-2"><span className="whitespace-nowrap">시안 이미지</span>
                  <span className="font-bold whitespace-nowrap">{mockups === "plan" ? "고른 장만 · 나중에" : mockups === "sample" ? `장당 비용 × ${planOpts.sample}장` : `장당 비용 × ${slides ? `${slides}장` : "전체 장 수"}`}</span></div>}
                {isAdmin && ai && (ai.budget.default != null || ai.budget.monthly_cap != null) && <>
                  <div className="h-px bg-line-soft my-0.5" />
                  <div className="flex justify-between gap-2"><span className="whitespace-nowrap">작업당 한도</span><span className="font-bold font-mono whitespace-nowrap">{usd(ai.budget.default)}</span></div>
                  {ai.budget.monthly_cap != null && <div className="flex justify-between gap-2"><span className="whitespace-nowrap">이달 사용</span><span className="font-bold font-mono whitespace-nowrap">{usd(ai.budget.month_spent, 3)} / {usd(ai.budget.monthly_cap)}</span></div>}
                </>}
                <div className="text-[12.5px] text-faint leading-[1.45] break-keep">
                  {company ? "글 AI 비용만 듭니다. 그림은 파워에셋 아이콘에서 고르고 새로 만들지 않습니다." : purpose === "submit" ? "글 AI 비용만 듭니다. 표지·목차·간지 배경은 파워에셋에서 고르고, 맞는 그림이 없을 때만 새로 만듭니다." : mockups === "plan" ? "기획을 확인한 뒤 고른 장만 시안 이미지를 만듭니다. 비용은 그때 장 수만큼 듭니다." : "비용은 대부분 시안 이미지에서 납니다. 실제 금액은 작업의 「상세」에서 볼 수 있습니다."}
                  {isAdmin && ai && (ai.budget.default != null || ai.budget.monthly_cap != null) && " 한도는 관리자 설정입니다."}
                </div>
              </div>
            )}
          </div>
          {engine && <div className="flex-none border-t border-line px-5 py-3"><EngineBadge engine={engine} /></div>}
        </aside>
      </div>

      {working && <UploadModal heading={heading} title={shownTitle || "새 작업"} pct={all} steps={modalSteps} onStop={() => abort.current?.abort()} />}
      {logoFind && <LogoSearch title={(logoFind.w === "client" ? "발주기관 로고" : "제안사 로고") + (logoFind.white != null ? " — 흰색(어두운 바탕용)" : "")} onClose={() => setLogoFind(null)} onPick={(f) => pickLogo(logoFind.w, f, logoFind.white)} />}
    </>
  );
}

/** 항목 묶음 — 요약에서 누르면 잠깐 강조된다(바탕 var(--color-orange-tint) · 1px var(--color-orange-soft)). grow: 남는 높이를 채운다 */
function Sec({ id, style, grow, className, children }: { id: string; style?: React.CSSProperties; grow?: boolean; className?: string; children: ReactNode }) {
  return (
    <section id={"sec-" + id} style={style}
      className={cn("flex flex-col gap-2 p-3 -m-3 rounded-md scroll-mt-4 transition-[background,box-shadow] duration-[250ms]", grow && "flex-[1_0_auto]", className)}>{children}</section>
  );
}

/** 세부 설정 한 줄 — 왼쪽 220px 라벨 칸(아이콘 + 제목 + 설명) | 오른쪽 입력. 좁으면 위아래로 쌓는다 */
function Row({ id, style, icon, title, sub, last, children }: { id: string; style?: React.CSSProperties; icon: string; title: string; sub: string; last?: boolean; children: ReactNode }) {
  return (
    <div id={"sec-" + id} style={style}
      className={cn("grid gap-x-6 gap-y-3 px-4 py-[18px] -mx-4 rounded-md scroll-mt-4 transition-[background,box-shadow] duration-[250ms] grid-cols-1 min-[900px]:grid-cols-[220px_minmax(0,1fr)]", !last && "border-b border-line-soft")}>
      <div>
        <div className="flex items-center gap-2 sec-title"><span className="sec-ic"><Ms name={icon} size={18} /></span>{title}</div>
        <div className="sec-desc mt-1 pl-9 whitespace-nowrap">{sub}</div>
      </div>
      {children}
    </div>
  );
}

/** 제작 서버 상태 — 멈춰 있어도 올려 둘 수 있다(다시 켜질 때 시작) */
function EngineBadge({ engine }: { engine: Engine | null }) {
  if (!engine) return null;
  return (
    <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink2 min-w-0" title={engine.workers.map((w) => w.name).join(", ")}>
      <LiveDot state={engine.online ? "ok" : "off"} />
      <span className="break-keep">{engine.online ? "제작 서버 정상" : "제작 서버 멈춤 — 올려 두면 다시 켜질 때 시작합니다"}
        {engine.queued + engine.running > 0 && <span className="text-dim font-medium"> · 진행 {engine.running} · 대기 {engine.queued}</span>}</span>
    </span>
  );
}
