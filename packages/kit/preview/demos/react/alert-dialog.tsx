import * as React from "react";
import {
  Button,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "../../../react";

export const meta = {
  id: "alert-dialog",
  title: "확인 대화상자",
  group: "overlay",
  source: "shadcn",
  note: "되돌릴 수 없는 동작 전에 묻는다. 바깥을 눌러도 닫히지 않고, 열리면 '돌아가기'에 먼저 포커스가 간다.",
};

export default function Demo() {
  const [result, setResult] = React.useState("접수 중인 신청 1건");
  return (
    <div className="pv-row">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary">신청 취소</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>신청을 취소할까요?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>취소하면 작성한 내용과 첨부한 서류가 모두 지워지며 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={() => setResult("신청이 취소되었습니다")}>신청 취소하기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p role="status">{result}</p>
    </div>
  );
}
