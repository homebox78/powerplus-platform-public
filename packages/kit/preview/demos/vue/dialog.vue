<script setup lang="ts">
import { Button, Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from "../../../vue";

const TERMS = [
  "1. 수집 항목: 성명, 생년월일, 휴대전화번호, 주소, 전자우편 주소",
  "2. 수집 목적: 여권 재발급 신청 접수, 처리 결과 안내, 수령 일정 안내",
  "3. 보유 기간: 신청일로부터 5년(「여권법 시행령」 제40조)",
  "4. 제3자 제공: 외교부 여권정보통합관리시스템에 신청 정보를 제공합니다.",
  "5. 처리 위탁: 수령 안내 문자 발송을 한빛시 통합민원센터 운영 업체에 맡깁니다.",
  "6. 파기: 보유 기간이 끝나면 지체 없이 복구할 수 없는 방법으로 파기합니다.",
  "7. 동의를 거부할 수 있으며, 거부하면 온라인 신청이 제한됩니다. 이 경우 민원실을 방문해 신청할 수 있습니다.",
];
</script>

<template>
  <div class="pv-row">
    <Dialog>
      <DialogTrigger as-child>
        <Button>여권 재발급 안내 보기</Button>
      </DialogTrigger>
      <DialogContent size="medium">
        <DialogHeader>
          <DialogTitle>여권 재발급 신청 안내</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>한빛시 민원여권과에서 여권을 재발급받을 수 있습니다. 신청 전에 준비물을 확인해 주세요.</DialogDescription>
          <p>준비물: 여권용 사진 1매, 신분증, 기존 여권(유효기간이 남은 경우)</p>
          <p>처리 기간: 접수일로부터 근무일 기준 4일</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose as-child><Button variant="tertiary">닫기</Button></DialogClose>
          <DialogClose as-child><Button>신청하러 가기</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog>
      <DialogTrigger as-child>
        <Button variant="secondary">개인정보 수집·이용 동의</Button>
      </DialogTrigger>
      <DialogContent size="large">
        <DialogHeader>
          <DialogTitle>개인정보 수집·이용 동의</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>한빛시는 여권 민원 처리를 위해 아래와 같이 개인정보를 수집·이용합니다.</DialogDescription>
          <p v-for="t in TERMS" :key="t">{{ t }}</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose as-child><Button variant="tertiary">동의하지 않음</Button></DialogClose>
          <DialogClose as-child><Button>동의함</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
