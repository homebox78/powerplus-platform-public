# powerPlus Add-in (Phase 1 — UI / Mock)

PowerPoint 자산 라이브러리 작업창. 현재는 **mock 데이터**로 동작하며 서버 연동 전 단계입니다.

## 기능 (현재)
- 카테고리 탭 (전체 / 아이콘 / 사진 / 일러스트 / 다이어그램)
- 이름·태그 검색 (300ms 디바운스)
- 자산 그리드 (SVG 썸네일)
- 클릭 시 현재 슬라이드에 이미지 삽입 (SVG → PNG 변환 후 `addImage`)

## 개발 실행

```bash
npm install
npm run dev      # https://localhost:3000 에서 dev 서버 기동
```

처음 실행 시 `office-addin-dev-certs`가 로컬 HTTPS 인증서를 설치합니다(관리자 권한 프롬프트가 뜰 수 있음).

### PowerPoint에 sideload
```bash
npm start        # 데스크톱 PowerPoint를 열고 add-in을 자동 sideload
```
또는 수동: PowerPoint → 삽입 → 내 추가 기능 → 내 추가 기능 업로드 → `manifest.xml` 선택.

### 브라우저에서 UI만 미리보기
`https://localhost:3000/taskpane.html` 직접 열기 — UI는 보이지만, 삽입은 PowerPoint에서만 동작(브라우저에선 안내 토스트 표시).

## 구조
```
src/taskpane/
  index.tsx              진입점 (Office.onReady → React mount)
  App.tsx                상태 + 레이아웃
  components/            CategoryTabs · SearchBar · AssetGrid
  hooks/useInsert.ts     SVG→PNG 변환 + Office.js 삽입
  data/mockAssets.ts     mock 자산 (→ 추후 서버 API로 교체)
```

## 다음 단계
- 서버 API 연동 (`data/mockAssets.ts`의 `filterAssets` → `fetch`)
- 즐겨찾기 / 최근 사용
- 삽입 크기 프리셋
- 인증 (Google OAuth 또는 Azure AD)

## 플랫폼 이식(2026-10-07)
- 출처: powerPlus 저장소 `addin/`·`installer/`. 이 폴더가 원본이 되었다(옛 저장소는 삭제 예정).
- 호스팅: `https://powerplus.hom2box.com/addin/` (taskpane.html, manifest.xml) — `scripts/deploy.sh` 가 함께 빌드·배포한다.
- API: 플랫폼 REST `/api/v1` — 로그인은 `/auth/otp/request` → `/addin/login`(작업창 전용 키 발급), 즐겨찾기·최근·공지는 `/addin/*`, 에셋은 `/assets/*`.
- 도움말 봇: 헤더의 봇 버튼 → powerPlus AI Help(`/assist/ask`, context=addin).
- 설치 프로그램 소스: `installer/` (.NET 8 WinForms + WebView2). manifest 는 `manifest.prod.xml` 과 같게 유지.
