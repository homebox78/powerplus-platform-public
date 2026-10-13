"use client";
// 음성 읽기(TTS) — KRDS 「TTS(tts · tts_icon · tts_size)」
//   <Tts text="안내 문구를 읽어 줍니다." />                   ← 기본(스피커 아이콘 + "읽어주기")
//   <Tts target="#notice-body" variant="play" />             ← 대상 영역의 글을 읽는다(재생 ↔ 정지 전환)
//   <Tts target="#notice-body" iconOnly aria-label="공지 읽어주기" size="small" />
// 브라우저 speechSynthesis 로 읽는다. 한 번에 하나만 읽고(다른 버튼을 누르면 앞의 것은 멈춤),
// 다시 누르면 멈춘다. 지원하지 않는 브라우저에서는 버튼을 끄고 안내 문구를 보인다.
import * as React from "react";
import { cx } from "./utils";
import { resolveTarget } from "./gov-drop";

export type TtsSize = "xsmall" | "small" | "medium";

export interface TtsProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** 읽을 글 */
  text?: string;
  /** 읽을 영역(선택자 또는 요소) — text 가 없을 때 이 영역의 글을 읽는다 */
  target?: string | HTMLElement | null;
  /** 버튼 이름(기본: "읽어주기", play 형은 "재생") */
  label?: string;
  /** 읽는 중 이름(기본: "멈춤") */
  stopLabel?: string;
  size?: TtsSize;
  /** default: 스피커 아이콘 / play: 재생 아이콘(읽는 동안 채워진 정지 버튼) */
  variant?: "default" | "play";
  /** 아이콘만 — aria-label 을 함께 준다 */
  iconOnly?: boolean;
  /** 읽기 언어(기본 ko-KR) */
  lang?: string;
  rate?: number;
  /** 지원하지 않을 때 보일 안내 */
  unsupportedText?: string;
  onSpeakingChange?: (speaking: boolean) => void;
}

// 문서 전체에서 읽는 버튼은 하나 — 누가 읽는 중인지와 그 버튼을 되돌리는 함수
let active: { owner: object; reset: () => void } | null = null;

function supported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

export const Tts = React.forwardRef<HTMLButtonElement, TtsProps>(function Tts(
  {
    text,
    target,
    label,
    stopLabel = "멈춤",
    size = "medium",
    variant = "default",
    iconOnly,
    lang = "ko-KR",
    rate = 1,
    unsupportedText = "이 브라우저는 음성 읽기를 지원하지 않습니다.",
    onSpeakingChange,
    className,
    disabled,
    onClick,
    ...props
  },
  ref,
) {
  const [speaking, setSpeaking] = React.useState(false);
  const [ok, setOk] = React.useState(true);
  const [status, setStatus] = React.useState("");
  const me = React.useRef({}).current;
  const current = React.useRef<object | null>(null); // 지금 읽는 발화(끝난 옛 발화의 onend 를 거른다)
  const cb = React.useRef(onSpeakingChange);
  cb.current = onSpeakingChange;

  React.useEffect(() => setOk(supported()), []);

  const update = (v: boolean, msg: string) => {
    setSpeaking(v);
    setStatus(msg);
    cb.current?.(v);
  };

  // 사라질 때 내가 읽는 중이면 멈춘다
  React.useEffect(
    () => () => {
      if (active?.owner === me && supported()) {
        active = null;
        window.speechSynthesis.cancel();
      }
    },
    [me],
  );

  const stop = () => {
    if (active?.owner === me) active = null;
    if (supported()) window.speechSynthesis.cancel();
    update(false, "읽기를 멈췄습니다.");
  };

  const play = () => {
    const content = (text ?? resolveTarget(target, "")?.innerText ?? "").trim();
    if (!content) {
      setStatus("읽을 내용이 없습니다.");
      return;
    }
    if (active && active.owner !== me) active.reset();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(content);
    u.lang = lang;
    u.rate = rate;
    try {
      const voice = synth.getVoices().find((v) => (v.lang || "").toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      if (voice) u.voice = voice;
    } catch {
      /* 목소리 목록을 못 읽어도 기본 목소리로 읽는다 */
    }
    const token = {};
    const done = () => {
      if (active?.owner === me && current.current === token) {
        active = null;
        update(false, "읽기를 마쳤습니다.");
      }
    };
    current.current = token;
    u.onend = done;
    u.onerror = (e) => {
      if (e.error !== "canceled" && e.error !== "interrupted") done();
    };
    active = { owner: me, reset: () => update(false, "읽기를 멈췄습니다.") };
    update(true, "읽는 중입니다.");
    synth.speak(u);
  };

  const idleLabel = label ?? (variant === "play" ? "재생" : "읽어주기");
  const shown = speaking ? stopLabel : idleLabel;
  const icon = speaking ? (variant === "play" ? "ico-stop" : "ico-volume") : variant === "play" ? "ico-play" : "ico-volume";

  return (
    <span className="hb-tts-wrap">
      <button
        ref={ref}
        type="button"
        className={cx("krds-tts", size, variant === "play" && !speaking && "play", speaking && variant === "play" && "pause", speaking && "is-playing", className)}
        aria-pressed={speaking}
        aria-label={iconOnly ? (props["aria-label"] ?? shown) : undefined}
        disabled={disabled || !ok}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented || !ok) return;
          if (speaking) stop();
          else play();
        }}
        {...props}
      >
        <span className="krds-tts-icon" aria-hidden="true">
          <i className={cx("svg-icon", icon)} />
        </span>
        {!iconOnly && <span className="krds-tts-text">{shown}</span>}
      </button>
      {!ok && <span className="hb-tts-msg">{unsupportedText}</span>}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </span>
  );
});
