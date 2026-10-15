// 결과 산출물 파일 묶음 — 출처: powerDeck web/src/screens/ResultFiles.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { fileUrl, fmtSize, jobUrl, type Job } from "../api";
import { Ms } from "../ui";

const isFont = (n: string) => /\.(ttf|otf|ttc)$/i.test(n);
const extOf = (n: string) => (/\.([a-z0-9]{1,5})$/i.exec(n)?.[1] ?? "file").toUpperCase();

type Row = { name: string; file: string; href: string; size?: number };

/** 산출물 — 장표(.pptx) 카드 + 기획·문서·시안·렌더·서체·원본 묶음, 오른쪽에 발표 대본 안내(만들고 고치는 곳은 발표 대본 탭). 전체는 zip 으로 */
export function Files({ job, ok, onScript }: { job: Job; ok: boolean; onScript: () => void }) {
  const sc = job.script && !job.script.none ? job.script : null, qa = job.script?.qa ?? [];
  const f = job.files;
  const mock = (f?.mockup ?? []).filter((x) => x.slide);
  const results = f?.result ?? [];
  const draft = f?.draft?.[0];
  const fonts = (f?.extra ?? []).filter((x) => isFont(x.name));
  const slides = job.plan?.slides.length || job.slides || (f?.after ?? []).filter((x) => x.slide).length || 0;
  const groups: { title: string; hint?: string; rows: Row[] }[] = [
    // 결과 파일이 여럿이면(드문 경우) 나머지도 받을 수 있게
    { title: "결과 장표", rows: results.slice(1).map((x) => ({ name: x.name, file: x.name, href: fileUrl(job.id, "result", x.name, true), size: x.size })) },
    { title: "기획 · 문서", hint: "기획(.md)을 다시 올리면 기획 단계 없이 그대로 씁니다", rows: [
      ...(job.plan ? [{ name: "기획.md", file: "plan.md", href: jobUrl(job.id, "plan.md") }] : []),
      ...(f?.mockup ?? []).filter((x) => x.name === "context.md").map((x) => ({ name: "사업 요약.md", file: x.name, href: fileUrl(job.id, "mockup", x.name, true), size: x.size })),
      ...(f?.extra ?? []).filter((x) => !isFont(x.name)).map((x) => ({ name: x.name, file: x.name, href: fileUrl(job.id, "extra", x.name, true), size: x.size })),
      ...(f?.mockup ?? []).filter((x) => x.name === "plan.json").map((x) => ({ name: "plan.json (기획 원본 데이터)", file: x.name, href: fileUrl(job.id, "mockup", x.name, true), size: x.size })),
    ] },
    { title: "시안 이미지", hint: `${mock.length}장`, rows: mock.map((x) => ({ name: `${x.slide}쪽 시안 (${x.name})`, file: x.name, href: fileUrl(job.id, "mockup", x.name, true), size: x.size })) },
    { title: "결과 렌더", hint: `${(f?.after ?? []).length}장`, rows: (f?.after ?? []).map((x) => ({ name: x.slide ? `${x.slide}쪽 결과 (${x.name})` : `${/cover/.test(x.name) ? "표지" : /toc/.test(x.name) ? "목차" : "간지"} (${x.name})`, file: x.name, href: fileUrl(job.id, "after", x.name, true), size: x.size })) },
    { title: "서체", hint: "장표에 쓴 서체입니다. 글자가 다르게 보이면 설치하세요", rows: fonts.map((x) => ({ name: x.name, file: x.name, href: fileUrl(job.id, "extra", x.name, true), size: x.size })) },
    ...(job.source_kind === "pptx" ? [{ title: "원본", hint: "처음 올린 초안입니다", rows: [{ name: job.filename, file: "source.pptx", href: fileUrl(job.id, "source", "source.pptx", true), size: job.size }] }] : []),
  ].filter((g) => g.rows.length);
  const total = groups.reduce((n, g) => n + g.rows.length, 0) + (results[0] ? 1 : 0);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto scroll-thin px-8 py-6">
        <div className="w-full grid gap-5 items-start grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-4 min-w-0">
            <div className="border border-line rounded-md p-4 flex items-center gap-3.5 flex-wrap">
              <span className="font-mono text-[12px] font-medium text-orange-d bg-orange-soft rounded-md px-2 py-1.5 flex-none">PPTX</span>
              <div className="flex-1 min-w-0 basis-[220px]">
                <div className="font-bold truncate" title={results[0] ? job.result_name || results[0].name : undefined}>{results[0] ? job.result_name || results[0].name : "장표 (.pptx)"}</div>
                <div className="text-[13px] text-dim mt-0.5 truncate">
                  {results[0]
                    ? `${slides ? `${slides}장 · ` : ""}${fmtSize(results[0].size)}${fonts.length ? " · 고른 서체 포함" : ""} · 산출물 ${total}개`
                    : draft ? "멈춘 지점까지 만든 판을 받을 수 있습니다" : total ? "시안 · 기획 문서부터 받을 수 있습니다" : "아직 산출물이 없습니다"}
                </div>
              </div>
              <a className="btn-back" href={jobUrl(job.id, "export.zip")} title="이 작업에서 만든 것 전부를 한 번에 받습니다"><Ms name="download" size={17} />전체 (.zip)</a>
              {results[0]
                ? <a className="btn-next" href={fileUrl(job.id, "result", results[0].name, true)}><Ms name="download" size={17} />{job.kind === "design" ? "내보내기" : "결과 내려받기"}</a>
                : draft && <a className="btn-next" href={fileUrl(job.id, "draft", draft.name, true) + `&v=${draft.ts ?? 0}`}><Ms name="download" size={17} />멈춘 지점까지 받기</a>}
            </div>
            {groups.map((g) => (
              <div key={g.title} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2 min-w-0"><span className="font-bold whitespace-nowrap flex-none">{g.title}</span>{g.hint && <span className="text-[13px] text-dim truncate">{g.hint}</span>}</div>
                <div className="border border-line rounded-md overflow-hidden">
                  {g.rows.map((r) => (
                    <a key={r.href} href={r.href} className="flex items-center gap-2.5 h-10 pl-3.5 pr-1 border-b border-line-soft last:border-b-0 hover:bg-panel no-underline text-ink">
                      <span className="font-mono text-[12px] text-dim bg-side rounded-md px-[5px] py-0.5 min-w-[42px] text-center flex-none">{extOf(r.file)}</span>
                      <span className="flex-1 min-w-0 truncate font-semibold">{r.name}</span>
                      {r.size != null && <span className="text-[13px] text-faint whitespace-nowrap flex-none">{fmtSize(r.size)}</span>}
                      <span className="w-9 h-9 inline-flex items-center justify-center rounded-md text-orange-d flex-none" title={`받기: ${r.name}`} aria-label={`받기: ${r.name}`}><Ms name="download" size={20} /></span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
            {!total && !draft && <div className="py-10 text-center text-[13.5px] text-faint">아직 산출물이 없습니다.</div>}
          </div>
          <div className="border border-line rounded-md p-[18px] flex flex-col gap-3">
            <div className="font-bold text-[15px]">발표 대본</div>
            {!ok ? <div className="text-[13.5px] text-ink2 leading-[1.55]">발표 대본은 장표가 완성된 뒤에 만들 수 있습니다. 머리줄의 「다시 돌리기」로 장표를 먼저 완성해 주세요.</div>
              : job.kind !== "design" ? <div className="text-[13.5px] text-ink2 leading-[1.6] break-keep">발표 대본은 '내용으로 장표 만들기' 작업에서만 됩니다.</div>
              : <>
                <div className="text-[13.5px] text-ink2 leading-[1.6] break-keep">
                  {sc ? <>대본 문서 · 연습 화면{qa.length ? ` · 예상 질문 ${qa.length}개` : ""}가 있습니다. 전체 (.zip)에도 들어갑니다.</>
                    : "장마다 읽을 말 · 남길 문장 · 가리킬 곳을 쓰고, 리허설 타이머가 든 대본 문서와 연습 화면을 만듭니다."}
                </div>
                <button className="btn-dark !h-[42px] !font-semibold" onClick={onScript}><Ms name="record_voice_over" size={19} />{sc ? "발표 대본 열기" : "발표 대본 만들기"}</button>
                {sc && <div className="flex gap-2">
                  <a className="btn-back !h-10 !px-4 flex-1" href={jobUrl(job.id, "script.html?dl=1")}><Ms name="download" size={18} />대본 (.html)</a>
                  <a className="btn-back !h-10 !px-4 flex-1" href={jobUrl(job.id, "practice.html?dl=1")}><Ms name="download" size={18} />연습 화면</a>
                </div>}
              </>}
          </div>
        </div>
      </div>
    </div>
  );
}
