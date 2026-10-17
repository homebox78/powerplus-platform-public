#!/usr/bin/env bash
# 배포 전 자가 검사 — 지난 사고가 다시 나오지 않게 기계로 막는다(docs/오류-재발방지-체크리스트.md).
#   bash scripts/preflight.sh web|mockref|engine
# 막는 것(실패 = 종료 코드 1, 배포 중단):
#   1. PHP 문법(php -l)
#   2. 클로저가 use 없이 바깥 변수를 씀 — php -l 이 못 잡고 운영에서 500 (2026-10-12 Sites.php)
#   3. 역슬래시가 빠진 네임스페이스(HomeboxPlan·PpCoreDb) — sed·heredoc 편집 사고
#   4. 그림·글꼴이 텍스트 줄바꿈 규칙에 걸림 — engine/** eol=lf 가 jpg 41장을 깨뜨림 (2026-10-12)
#   5. 배포 범위에 커밋 안 한 변경 — deploy 는 작업 트리를 싣는다. 다른 세션의 반쯤 된 코드가 같이 올라감
#      (2026-10-08 core.php 잘림). 정말 올려야 하면 PP_ALLOW_DIRTY=1
#   6. 역슬래시가 빠진 정규식(packages/mcp) — R38
#   7. 크론 주석만 있고 deploy.sh 등록이 없는 api/bin 스크립트(R47, 2026-10-17 알림 → 실패)
#   8. routes.ts 화면 경로가 api/src/Core/SpaRoutes.php 에 없음 — 운영에서 404 상태로 나간다
# 알려 주기만 하는 것: 마지막 커밋이 다른 배포 범위를 건드렸는데 그 배포를 잊기 쉬운 경우
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
SCOPE="${1:-web}"
case "$SCOPE" in
  web) PATHS=(api apps packages db/migrations); PHPDIRS=(api) ;;
  mockref) PATHS=(services/mockref-api); PHPDIRS=(services/mockref-api) ;;
  engine) PATHS=(engine); PHPDIRS=() ;;
  # powerMCP 도 작업 트리를 싣는다 — 다른 세션의 미커밋 index.ts·deck-kit 이 같이 올라간 사고(2026-10-15, R39)
  mcp) PATHS=(packages/mcp packages/shared apps/web/public/guide-files); PHPDIRS=() ;;
  *) echo "범위는 web|mockref|engine|mcp"; exit 2 ;;
esac
FAIL=0
bad() { echo "❌ $*"; FAIL=1; }

# 1·2. PHP
if [ ${#PHPDIRS[@]} -gt 0 ]; then
  mapfile -t PHPF < <(find "${PHPDIRS[@]}" -name '*.php' -not -path '*/vendor/*' -not -path '*/storage/*')
  for f in "${PHPF[@]}"; do php -l "$f" >/dev/null 2>&1 || bad "PHP 문법 오류: $f ($(php -l "$f" 2>&1 | head -1))"; done
  php scripts/preflight/closures.php "${PHPF[@]}" || bad "클로저 use 누락 — 위 줄을 고치세요(의도라면 같은 줄에 // preflight-ok)"
  # 3. 역슬래시 빠진 네임스페이스
  if grep -nE '\b(Homebox|Pp)(Core|Http|Repo|Deck|Assets|Mock|Plan|Db|Signer|Guide|Chat|Site)[A-Za-z]*\b' "${PHPF[@]}" 2>/dev/null; then
    bad "역슬래시가 빠진 네임스페이스(위) — PHP 는 Edit 도구로 고친다"
  fi
fi

# 4. 바이너리 속성
mapfile -t BIN < <(git ls-files -- "${PATHS[@]}" | grep -iE '\.(jpe?g|png|webp|gif|zip|pptx|ttf|otf|woff2?|pdf|ico|mp4)$')
if [ ${#BIN[@]} -gt 0 ]; then
  while IFS= read -r line; do bad "텍스트 규칙에 걸린 그림·글꼴(.gitattributes 에 binary 추가): $line"; done \
    < <(printf '%s\n' "${BIN[@]}" | git check-attr --stdin text | grep -E ': text: set$' | head -20)
fi

# 5. 커밋 안 한 변경
DIRTY=$(git status --porcelain -- "${PATHS[@]}" | grep -vE '^\?\? ' || true)
if [ -n "$DIRTY" ]; then
  if [ "${PP_ALLOW_DIRTY:-0}" = 1 ]; then
    echo "⚠️  커밋 안 한 변경을 그대로 올림(PP_ALLOW_DIRTY=1):"; echo "$DIRTY"
  else
    echo "$DIRTY"; bad "배포 범위($SCOPE)에 커밋 안 한 변경이 있다 — 내 것이면 커밋, 다른 세션 것이면 그 세션이 끝난 뒤. 정말 올리려면 PP_ALLOW_DIRTY=1"
  fi
fi

# 5-1. 원격 main 보다 뒤처진 사본에서 배포 금지(R47) — 분리된 작업 트리(pp-wt-*)가 옛 HEAD 로 엔진을 올려
#      13초 앞서 올린 main 의 새 커밋(목차 개편)을 서버에서 덮었다(2026-10-15). 배포 범위 경로만 비교한다
if git fetch -q origin main 2>/dev/null; then
  BEHIND=$(git log --oneline HEAD..origin/main -- "${PATHS[@]}" 2>/dev/null | head -5)
  if [ -n "$BEHIND" ] && [ "${PP_ALLOW_BEHIND:-0}" != 1 ]; then
    echo "$BEHIND"; bad "이 사본은 origin/main 보다 배포 범위($SCOPE) 커밋이 뒤처졌다 — 올리면 서버의 새 코드를 덮는다. main 을 받아(rebase/merge) 다시"
  fi
fi

# 6. 역슬래시가 빠진 정규식(R38) — sed·heredoc·node 문자열로 JS 를 고치다 \d·\(·\s 가 사라져 검사가 아예 안 돌았다
#    (2026-10-15 판정기 layout.mjs·check.mjs 3곳: 어두운 배경·투명 입력칸·덮임 — 통과만 시키고 아무것도 못 잡음)
# 판정기는 deploy-mcp.sh 로 올라가므로 mcp 범위에서도 돈다(2026-10-15: web 에만 걸려 MCP 배포 때는 안 돌던 것)
if [ "$SCOPE" = web ] || [ "$SCOPE" = mcp ]; then
  BADRE=$(grep -rnF -e 'rgba(0, 0, 0, 0)|' -e '[d.]+' -e '[d.,' -e '(.*,s*0)' -e '/^s*' packages/mcp/src --include='*.mjs' --include='*.ts' 2>/dev/null || true)
  [ -n "$BADRE" ] && { echo "$BADRE" | head -5; bad "역슬래시가 빠진 정규식 — 정규식은 Edit 도구로 고친다(R02·R38)"; }
fi

# 7. 머리 주석(앞 15줄)에 크론이 적힌 api/bin 스크립트는 deploy.sh 의 addcron 으로 등록돼 있어야 한다(R47: qa-feed·retention·scan-queue·prewarm-wm 이
#    주석에만 있어 한 번도 안 돌았다). 2026-10-17 전부 등록한 뒤 알림 → 실패로 올림. 크론이 아닌 스크립트는 머리에 cron·크론을 쓰지 않는다
if [ "$SCOPE" = web ]; then
  for f in api/bin/*.php; do
    head -15 "$f" | grep -qiE "cron|크론" || continue
    b=$(basename "$f"); grep -qE "addcron $b " scripts/deploy.sh || bad "$b 머리 주석에 크론이 있는데 deploy.sh 가 addcron 으로 등록하지 않는다(R47)"
  done
  # 8. 화면 경로 목록(routes.ts ↔ api/src/Core/SpaRoutes.php) — 빠진 화면은 운영에서 404 상태로 나간다
  php scripts/preflight/spa-routes.php >/dev/null || { php scripts/preflight/spa-routes.php | grep -v '^SPA'; bad "routes.ts 에 있는 화면이 SpaRoutes::PATTERNS 에 없다 — 한 줄 더할 것"; }
fi

# 알림 — 다른 배포가 필요한지
LAST=$(git log -1 --name-only --format= 2>/dev/null || true)
echo "$LAST" | grep -q '^services/mockref-api/' && [ "$SCOPE" != mockref ] && echo "ℹ️  마지막 커밋이 mockref 를 고쳤다 → bash scripts/deploy-mockref.sh 도"
echo "$LAST" | grep -q '^engine/' && [ "$SCOPE" != engine ] && echo "ℹ️  마지막 커밋이 engine 을 고쳤다 → bash scripts/deploy-engine.sh 도"
echo "$LAST" | grep -q '^packages/mcp/' && echo "ℹ️  마지막 커밋이 powerMCP 를 고쳤다 → bash scripts/deploy-mcp.sh 도"

if [ $FAIL = 1 ]; then echo "배포 전 검사 실패($SCOPE) — 배포하지 않습니다"; exit 1; fi
echo "✅ 배포 전 검사 통과($SCOPE)"
