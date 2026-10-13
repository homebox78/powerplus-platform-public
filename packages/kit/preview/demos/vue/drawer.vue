<script setup lang="ts">
import { ref } from "vue";
import { Button, Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter, DrawerClose } from "../../../vue";

const SORTS = ["최신순", "조회순", "마감 임박순"];
const sort = ref(SORTS[0]);
const pick = ref(SORTS[0]);
const onOpen = (o: boolean) => {
  if (o) pick.value = sort.value;
};
</script>

<template>
  <div class="pv-row">
    <Drawer @update:open="onOpen">
      <DrawerTrigger as-child>
        <Button variant="secondary">정렬: {{ sort }}</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>정렬 방식</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <DrawerDescription>한빛시 행사·공모 목록을 어떤 순서로 볼지 고르세요.</DrawerDescription>
          <fieldset class="krds-check-area">
            <legend class="sr-only">정렬 방식</legend>
            <div v-for="(s, i) in SORTS" :key="s" class="krds-form-check">
              <input :id="'drawer-v-' + i" v-model="pick" type="radio" name="drawer-v-sort" :value="s" />
              <label :for="'drawer-v-' + i">{{ s }}</label>
            </div>
          </fieldset>
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose as-child><Button variant="tertiary">취소</Button></DrawerClose>
          <DrawerClose as-child><Button @click="sort = pick">적용</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
</template>
