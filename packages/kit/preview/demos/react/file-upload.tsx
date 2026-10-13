import { FileUpload, type UploadItem } from "../../../react";

export const meta = { id: "file-upload", title: "파일 업로드", group: "form", source: "krds", note: "끌어다 놓기·파일 선택, 업로드 중·완료·오류 상태, 개수·용량·형식 제한, 제한 조건으로 만든 안내 문구." };

const SAMPLE: UploadItem[] = [
  { id: "f1", name: "위임장(주민등록법 시행령 별지 제15호의2서식).hwp", size: 17 * 1024, status: "uploading" },
  { id: "f2", name: "가족관계증명서.pdf", size: 312 * 1024, status: "done" },
  { id: "f3", name: "전입재등록신고서 스캔본.jpg", size: 24 * 1024 * 1024, status: "error", message: "등록 가능한 파일 용량을 초과하였습니다.\n20MB 미만의 파일만 등록할 수 있습니다." },
];

const fakeUpload = () => new Promise<void>((ok) => setTimeout(ok, 1500));

export default function Demo() {
  return (
    <FileUpload
      title="첨부 서류"
      accept=".hwp,.hwpx,.pdf,.jpg,.jpeg,.png"
      maxFiles={10}
      maxSize={20 * 1024 * 1024}
      defaultFiles={SAMPLE}
      upload={fakeUpload}
    />
  );
}
