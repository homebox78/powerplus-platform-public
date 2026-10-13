<script setup lang="ts">
import { Carousel, CarouselContent, CarouselControls, CarouselItem } from "../../../vue";

const SLIDES = [
  { cate: "알림", tit: "2026년 하반기 주민자치 프로그램 수강생 모집", txt: "9월 30일까지 누리집에서 신청하세요." },
  { cate: "행사", tit: "한빛 가을 문화 축제", txt: "10월 11일부터 사흘간 시청 앞 광장에서 열립니다." },
  { cate: "민원", tit: "스마트 민원 창구 전 동으로 확대", txt: "모든 행정복지센터에서 무인 발급기를 이용할 수 있습니다." },
  { cate: "안전", tit: "태풍 대비 행동 요령 안내", txt: "외출을 삼가고 재난 문자를 확인해 주세요." },
];
</script>

<template>
  <Carousel aria-label="한빛시 주요 소식" :autoplay="5000">
    <CarouselContent>
      <CarouselItem v-for="s in SLIDES" :key="s.tit">
        <div class="hb-carousel-slide">
          <div class="hb-carousel-text">
            <p class="hb-carousel-cate">{{ s.cate }}</p>
            <p class="hb-carousel-tit">{{ s.tit }}</p>
            <p class="hb-carousel-txt">{{ s.txt }}</p>
            <a href="#" class="krds-btn primary medium">자세히 보기<span class="sr-only"> — {{ s.tit }}</span></a>
          </div>
          <div class="hb-carousel-im" aria-hidden="true" />
        </div>
      </CarouselItem>
    </CarouselContent>
    <CarouselControls more-href="#" />
  </Carousel>

  <Carousel aria-label="관련 누리집 배너" :loop="false" class="pv-mt">
    <CarouselContent>
      <CarouselItem>
        <div class="hb-carousel-slide">
          <div class="hb-carousel-text">
            <p class="hb-carousel-cate">관련 누리집</p>
            <p class="hb-carousel-tit">한빛시 평생학습관</p>
          </div>
          <div class="hb-carousel-im" aria-hidden="true" />
        </div>
      </CarouselItem>
      <CarouselItem>
        <div class="hb-carousel-slide">
          <div class="hb-carousel-text">
            <p class="hb-carousel-cate">관련 누리집</p>
            <p class="hb-carousel-tit">한빛시 공공 도서관</p>
          </div>
          <div class="hb-carousel-im" aria-hidden="true" />
        </div>
      </CarouselItem>
    </CarouselContent>
    <CarouselControls />
  </Carousel>
</template>
