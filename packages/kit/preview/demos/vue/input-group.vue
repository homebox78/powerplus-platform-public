<script setup lang="ts">
import { Field, FieldLabel, FieldDescription, InputGroup, InputGroupAddon, InputGroupText, InputGroupInput, InputGroupButton, InputGroupTextarea } from "../../../vue";
</script>

<template>
  <div class="fieldset" style="max-width: 560px">
    <Field>
      <FieldLabel>신청 금액</FieldLabel>
      <InputGroup size="medium">
        <InputGroupInput inputmode="numeric" model-value="1,200,000" />
        <InputGroupAddon align="end" text><InputGroupText>원</InputGroupText></InputGroupAddon>
      </InputGroup>
    </Field>
    <Field>
      <FieldLabel>누리집 주소</FieldLabel>
      <InputGroup size="medium">
        <InputGroupAddon text><InputGroupText>https://</InputGroupText></InputGroupAddon>
        <InputGroupInput model-value="www.hanbit.go.kr" />
      </InputGroup>
    </Field>
    <Field>
      <FieldLabel>휴대전화 인증</FieldLabel>
      <InputGroup size="medium">
        <InputGroupInput inputmode="tel" placeholder="010-0000-0000" />
        <InputGroupAddon align="end"><InputGroupButton variant="secondary">인증번호 받기</InputGroupButton></InputGroupAddon>
      </InputGroup>
      <FieldDescription>인증번호는 3분 동안 유효합니다.</FieldDescription>
    </Field>
    <Field invalid>
      <FieldLabel>이메일</FieldLabel>
      <InputGroup size="medium">
        <InputGroupInput model-value="hanbit" />
        <InputGroupAddon align="end" text><InputGroupText>@hanbit.go.kr</InputGroupText></InputGroupAddon>
      </InputGroup>
    </Field>
    <Field>
      <FieldLabel>답변 요청 내용</FieldLabel>
      <InputGroup multiline>
        <InputGroupTextarea placeholder="담당 부서에 전할 내용을 적어 주세요." />
        <InputGroupAddon align="end"><InputGroupButton variant="primary">보내기</InputGroupButton></InputGroupAddon>
      </InputGroup>
    </Field>
  </div>
</template>
