import { Carousel, CarouselContent, CarouselControls, CarouselItem } from "../../../react";

export const meta = {
  id: "carousel",
  title: "캐러셀",
  group: "nav",
  source: "both",
  note: "위: 자동 넘김(5초) — 마우스를 올리거나 포커스가 들어가면 멈추고, 「움직임 줄이기」 환경에서는 멈춘 채 시작한다. 아래: 끝에서 멈추는 배너형.",
};

const SLIDES = [
  { cate: "알림", tit: "2026년 하반기 주민자치 프로그램 수강생 모집", txt: "9월 30일까지 누리집에서 신청하세요." },
  { cate: "행사", tit: "한빛 가을 문화 축제", txt: "10월 11일부터 사흘간 시청 앞 광장에서 열립니다." },
  { cate: "민원", tit: "스마트 민원 창구 전 동으로 확대", txt: "모든 행정복지센터에서 무인 발급기를 이용할 수 있습니다." },
  { cate: "안전", tit: "태풍 대비 행동 요령 안내", txt: "외출을 삼가고 재난 문자를 확인해 주세요." },
];

export default function Demo() {
  return (
    <>
      <Carousel aria-label="한빛시 주요 소식" autoplay={5000}>
        <CarouselContent>
          {SLIDES.map((s) => (
            <CarouselItem key={s.tit}>
              <div className="hb-carousel-slide">
                <div className="hb-carousel-text">
                  <p className="hb-carousel-cate">{s.cate}</p>
                  <p className="hb-carousel-tit">{s.tit}</p>
                  <p className="hb-carousel-txt">{s.txt}</p>
                  <a href="#" className="krds-btn primary medium">
                    자세히 보기<span className="sr-only"> — {s.tit}</span>
                  </a>
                </div>
                <div className="hb-carousel-im" aria-hidden="true" />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselControls moreHref="#" />
      </Carousel>

      <Carousel aria-label="관련 누리집 배너" loop={false} className="pv-mt">
        <CarouselContent>
          <CarouselItem>
            <div className="hb-carousel-slide">
              <div className="hb-carousel-text">
                <p className="hb-carousel-cate">관련 누리집</p>
                <p className="hb-carousel-tit">한빛시 평생학습관</p>
              </div>
              <div className="hb-carousel-im" aria-hidden="true" />
            </div>
          </CarouselItem>
          <CarouselItem>
            <div className="hb-carousel-slide">
              <div className="hb-carousel-text">
                <p className="hb-carousel-cate">관련 누리집</p>
                <p className="hb-carousel-tit">한빛시 공공 도서관</p>
              </div>
              <div className="hb-carousel-im" aria-hidden="true" />
            </div>
          </CarouselItem>
        </CarouselContent>
        <CarouselControls />
      </Carousel>
    </>
  );
}
