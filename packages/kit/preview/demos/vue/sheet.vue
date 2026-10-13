<script setup lang="ts">
import { Button, Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter, SheetClose } from "../../../vue";

const MENU = ["민원 안내", "여권 발급", "주민등록 발급", "인감·본인서명", "가족관계 등록", "자동차 등록"];
const DEPTS = ["민원여권과", "세무과", "교통행정과"];
</script>

<template>
  <div class="pv-row">
    <Sheet>
      <SheetTrigger as-child>
        <Button variant="secondary">상세 검색 조건</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>상세 검색 조건</SheetTitle>
          <SheetDescription>한빛시 공지사항에서 찾을 조건을 고르세요.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div class="fieldset">
          <div class="form-group">
            <div class="form-tit">
              <label for="sheet-v-kw">검색어</label>
            </div>
            <div class="form-conts">
              <input id="sheet-v-kw" type="text" class="krds-input" placeholder="예: 여권 재발급" />
            </div>
          </div>
          <div class="form-group" role="group" aria-labelledby="sheet-v-dept">
            <div id="sheet-v-dept" class="form-tit">담당 부서</div>
            <div class="krds-check-area">
              <div v-for="(d, i) in DEPTS" :key="d" class="krds-form-check">
                <input :id="'sheet-v-dept-' + i" type="checkbox" :checked="i === 0" />
                <label :for="'sheet-v-dept-' + i">{{ d }}</label>
              </div>
            </div>
          </div>
          </div>
        </SheetBody>
        <SheetFooter>
          <SheetClose as-child><Button variant="tertiary">초기화</Button></SheetClose>
          <SheetClose as-child><Button>검색</Button></SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <Sheet>
      <SheetTrigger as-child>
        <Button variant="tertiary">민원 메뉴(왼쪽)</Button>
      </SheetTrigger>
      <SheetContent side="left" :aria-describedby="undefined">
        <SheetHeader>
          <SheetTitle>민원 메뉴</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <ul style="display: grid; gap: 16px">
            <li v-for="m in MENU" :key="m"><a href="#sheet">{{ m }}</a></li>
          </ul>
        </SheetBody>
      </SheetContent>
    </Sheet>
  </div>
</template>
