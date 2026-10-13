import { Button, Toaster, toast } from "../../../react";

export const meta = {
  id: "toast",
  title: "토스트",
  group: "overlay",
  source: "shadcn",
  note: "sonner 와 같은 사용법 — <Toaster /> 를 한 번 두고 toast() 로 띄운다. 마우스를 올리거나 포커스하면 시간이 멈추고, Alt+T 로 알림 영역에 들어간다.",
};

const wait = (ms: number, ok = true) => new Promise<string>((res, rej) => setTimeout(() => (ok ? res("2026-0412") : rej(new Error())), ms));

export default function Demo() {
  return (
    <div className="pv-row">
      <Toaster />
      <Button variant="tertiary" onClick={() => toast("민원 신청서를 임시 저장했습니다")}>기본</Button>
      <Button variant="tertiary" onClick={() => toast.success("민원이 접수되었습니다", { description: "접수번호 2026-0412 · 처리 기간 4일" })}>
        성공
      </Button>
      <Button variant="tertiary" onClick={() => toast.info("10월 3일은 휴무라 민원실을 운영하지 않습니다")}>안내</Button>
      <Button variant="tertiary" onClick={() => toast.warning("첨부 파일 용량이 20MB에 가깝습니다")}>주의</Button>
      <Button
        variant="tertiary"
        onClick={() => toast.error("서류를 전송하지 못했습니다", { description: "네트워크 연결을 확인해 주세요.", action: { label: "다시 시도", onClick: () => toast.success("다시 전송했습니다") } })}
      >
        오류 + 다시 시도
      </Button>
      <Button
        variant="tertiary"
        onClick={() =>
          toast.promise(wait(1500), { loading: "신청서를 제출하는 중입니다", success: (no) => `제출했습니다(접수번호 ${no})`, error: "제출하지 못했습니다" })
        }
      >
        처리 중 → 완료
      </Button>
    </div>
  );
}
