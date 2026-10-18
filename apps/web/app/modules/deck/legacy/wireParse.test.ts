// 와이어 상자 종류·글 읽기 대조(2026-10-18) — 엔진과 같은 시험 묶음(engine/tests/wire_chart_cases.json · wire_kind_samples.json)을 화면 쪽 코드로 돌린다.
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KIND_LIST, axisKeep, chart, chartNums, lineRange, timeline, triad } from "./wireParse";
import { KindView } from "./WireSketch";
import type { WireBlock, WireKind } from "./api";

const ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const CASES = read("engine/tests/wire_chart_cases.json").cases as { name: string; d: string; expect: unknown }[];
const SAMPLES = read("engine/tests/wire_kind_samples.json").kinds as Record<string, { t: string; d: string }>;

describe("와이어 상자 종류 한 벌", () => {
  it("화면 사본이 정본(engine/wire_kinds.json)과 같다", () => {
    expect(fs.readFileSync(path.join(import.meta.dirname, "data/wire_kinds.json"), "utf8")).toBe(fs.readFileSync(path.join(ROOT, "engine/wire_kinds.json"), "utf8"));
  });
  it("api.ts WireKind 이름과 등록 종류가 같다", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "api.ts"), "utf8");
    const union = src.slice(src.indexOf("export type WireKind ="), src.indexOf(";", src.indexOf("export type WireKind =")));
    const names = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(KIND_LIST.map((x) => x.k).sort());
  });
});

describe("chart 글 읽기 — 엔진 wire_chart 와 같은 답", () => {
  for (const c of CASES) it(c.name, () => expect(chart(c.d)).toEqual(c.expect));
  it("음성 대조: 값 하나는 그래프가 아니다", () => expect(chartNums(chart("유형: bar\n2025 | 120"))).toBe(1));
});

describe("E2E 742 — 엔진과 같은 규칙", () => {
  const labs = [2023, 2024, 2025].flatMap((y) => Array.from({ length: 12 }, (_, m) => `${y}-${String(m + 1).padStart(2, "0")}`));
  it("점 36개 라벨은 처음·끝·해 바뀜·강조만", () => {
    expect([...axisKeep(labs)].sort((a, b) => a - b)).toEqual([0, 12, 24, 35]);
    expect(axisKeep(labs, labs[20]).has(20)).toBe(true);
    expect(axisKeep(labs.slice(0, 12)).size).toBe(12);   // 음성 대조
  });
  it("꺾은선 세로 범위는 값 범위", () => { const [lo, hi] = lineRange(labs.map((l, i) => [l, [1700 + i * 50]]), 1); expect(lo).toBeGreaterThan(1400); expect(hi).toBeLessThan(3800); });
  it("triad 머리 줄이 행으로 안 들어감", () => {
    const o = triad("업무 | 방안 | 효과(도입 전 → 도입 후)\n업무 | 방안 | 효과(도입 전 → 도입 후)\n전화 상담 대기 | 통합 전화 | 12.4분 → 2.1분");
    expect(o.rows.length).toBe(1);
    expect(triad("장애 대응 지연 | 이중화 | 중단 0분\n접속 폭주 | 자동 확장 | 응답 2초").rows.length).toBe(2);   // 음성 대조
  });
  it("timeline 강조 줄은 사건이 아님", () => expect(timeline("강조: 2025.12\n[2023.01] 시작\n[2025.12] 최대").ev.length).toBe(2));
});

describe("모든 종류 스케치", () => {
  const W = 760, H = 380, em = 1200 * 0.0131;
  for (const k of KIND_LIST.map((x) => x.k)) {
    it(`${k} 를 오류 없이 그린다`, () => {
      const b: WireBlock = { id: "a", k: k as WireKind, x: 2, y: 15, w: 60, h: 60, ...SAMPLES[k]! };
      const html = renderToStaticMarkup(createElement("div", null, KindView({ b, fs: em, W, H })));
      if (KIND_LIST.find((x) => x.k === k)?.form && k !== "table") expect(html.length).toBeGreaterThan(200);   // 주인공 도식은 실제로 무언가를 그린다
    });
  }
  it("차트 유형마다 SVG 를 그린다", () => {
    for (const c of CASES.slice(0, 13)) {
      const b: WireBlock = { id: "a", k: "chart", x: 2, y: 15, w: 60, h: 60, t: c.name, d: c.d };
      expect(renderToStaticMarkup(createElement("div", null, KindView({ b, fs: em, W, H })))).toContain("<svg");
    }
  });
  // 눈 검수용 — WIRE_HTML_OUT=<파일> 이면 모든 종류·차트 유형 스케치를 한 HTML 로 남긴다(브라우저로 열어 본다)
  it.runIf(!!process.env.WIRE_HTML_OUT)("스케치 모음 HTML", () => {
    const cell = (title: string, b: WireBlock) => `<figure style="margin:0;width:${W}px"><figcaption style="font:12px sans-serif">${title}</figcaption>`
      + `<div style="width:${W}px;height:${H}px;border:1px solid #999;display:flex;flex-direction:column;font-size:${em}px;overflow:hidden">${renderToStaticMarkup(createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 } }, KindView({ b, fs: em, W, H })))}</div></figure>`;
    const cells = [...KIND_LIST.map((x) => cell(x.k, { id: "a", k: x.k, x: 2, y: 15, w: 60, h: 60, ...SAMPLES[x.k]! })),
      ...CASES.slice(0, 13).map((c) => cell(`chart · ${c.name}`, { id: "a", k: "chart", x: 2, y: 15, w: 60, h: 60, t: c.name, d: c.d }))];
    fs.writeFileSync(process.env.WIRE_HTML_OUT!, `<!doctype html><meta charset="utf-8"><body style="font-family:'Malgun Gothic',sans-serif;display:flex;flex-wrap:wrap;gap:12px;background:#eee">${cells.join("")}</body>`);
  });
});
