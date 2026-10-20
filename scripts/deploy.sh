#!/usr/bin/env bash
# 플랫폼 배포 한 방 (Git Bash) — $PUBLIC  (최종 powerplus.solideos.com, 기획 §0)
#   scripts/deploy.sh           웹 빌드 + api 업로드 + DB 마이그레이션(schema_migrations 이력, 증분)
#   scripts/deploy.sh --seed    + 기준 데이터(자산·파일 기록·플랜·포인트 규칙)를 로컬에서 한 번 넣는다 — 첫 설치용.
#                                운영 데이터(사용자·키·글·시안·작업·감사·문의)는 절대 올리지 않는다.
#   scripts/deploy.sh --dry     번들만 만들고 끝
# 전제: scripts/server-setup.sh 를 한 번 돌려 DB pp_platform·/var/www/platform_conf/config.php 가 있어야 한다.
# 출처: homebox-handoff scripts/deploy.sh — 옆 폴더에 풀고 이름 교체(무중단, 2026-10-02 교훈), --db 덮어쓰기는 폐지(§16.2).
# ⚠️ 서버 DB `powerplus` 는 운영 중인 옛 파워플러스 애드인 DB — 건드리지 않는다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/preflight.sh" web || exit 1   # 배포 전 자가 검사(docs/오류-재발방지-체크리스트.md)
php "$ROOT/engine/tests/test_plan_keep.php" 2>/dev/null || { echo "기획 먼저 저장(Jobs::savePlan·finish) 시험 실패 — 배포 중단(R81)"; exit 3; }
php "$ROOT/engine/tests/test_deck_links.php" >/dev/null 2>&1 || { echo "받기 링크(Deck/Links.php·/d/ 관문) 시험 실패 — 배포 중단. php engine/tests/test_deck_links.php 로 확인"; exit 3; }
source "$(dirname "$0")/deploy-target.sh"
SEED=0; DRY=0
for a in "$@"; do case "$a" in --seed) SEED=1;; --dry) DRY=1;; esac; done
TOOLS="${PP_TOOLS:-}"; [ -z "$TOOLS" ] && { [ -d /g/tools ] && TOOLS=/g/tools || TOOLS=/d/tools; }
MARIADB_DUMP="$TOOLS/mariadb-10.11.19-winx64/bin/mariadb-dump.exe"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
KEY="$WORK/key.pem"; cp "$KEY_SRC" "$KEY"; chmod 600 "$KEY"

echo "== 0. 원격과 비교 =="
git -C "$ROOT" fetch -q origin && git -C "$ROOT" status -sb | head -1

echo "== 1. 웹 빌드 =="
rm -rf "$ROOT/apps/web/build"
# 프리렌더(/ 와 SPA 대체 페이지)는 요청마다 10초·재시도 0회로 고정(@react-router/dev — 설정으로 못 바꾼다). PC 가 바쁘면 첫 요청이 10초를 넘어
# 빌드가 멈췄다(2026-10-19 하루 5번, 다시 돌리면 통과, R88). 그 오류일 때만 3번까지 다시 빌드한다 — 다른 빌드 오류는 바로 멈춘다
for try in 1 2 3; do
  if (cd "$ROOT/apps/web" && pnpm exec react-router build > "$WORK/web-build.log" 2>&1); then break; fi
  grep -q "Prerender: Request failed.*timeout" "$WORK/web-build.log" && [ "$try" -lt 3 ] || { tail -20 "$WORK/web-build.log"; echo "❌ 웹 빌드 실패 — 중단"; exit 1; }
  echo "  프리렌더 시간 초과 — 다시 빌드($try/3)"; rm -rf "$ROOT/apps/web/build"
done
[ -f "$ROOT/apps/web/build/client/index.html" ] || { echo "❌ build/client/index.html 없음 — 중단"; exit 1; }
grep -q 'href="/_app/' "$ROOT/apps/web/build/client/index.html" || { echo "❌ index.html asset 경로가 / 로 시작하지 않음 — 중단"; exit 1; }
# powerGuide 정본(REST·MCP guide_*): 부품 문서는 웹 루트 kit-files 를 그대로 읽고, KRDS 지침·체크리스트는 api/data/guide 로 만든다
[ -f "$ROOT/apps/web/build/client/kit-files/registry.json" ] || { echo "❌ kit-files 없음 — packages/kit 빌드 먼저"; exit 1; }
node --experimental-strip-types --no-warnings "$ROOT/scripts/build-guide-data.mjs" >/dev/null
# powerAssets 애드인(PowerPoint 작업창) — 플랫폼 /addin/ 에서 로드한다
rm -rf "$ROOT/apps/addin/dist"
(cd "$ROOT/apps/addin" && npx webpack --mode production >/dev/null)
[ -f "$ROOT/apps/addin/dist/taskpane.html" ] || { echo "❌ 애드인 dist/taskpane.html 없음 — 중단"; exit 1; }

echo "== 2. 번들 =="
B="$WORK/deploy/platform"; mkdir -p "$B/api"
cp -r "$ROOT/apps/web/build/client/." "$B/"
mkdir -p "$B/addin" && cp -r "$ROOT/apps/addin/dist/." "$B/addin/"
# 매니페스트 원본(manifest.prod.xml)은 운영 주소(회사 서버) 기준(2026-10-20 전환). 다른 서버로 배포하면 그 주소로 바꾼다
[ "$PUBLIC" != "https://powerplus.solideos.com:46443" ] && sed -i "s#https://powerplus.solideos.com:46443#$PUBLIC#g" "$B/addin/manifest.xml"
# 설치 마법사(exe) — scripts/build-installer.mjs 결과를 그대로 싣는다
[ -f "$ROOT/apps/addin/release/powerAssets_Setup.exe" ] && cp "$ROOT/apps/addin/release/powerAssets_Setup.exe" "$ROOT/apps/addin/release/setup.json" "$B/addin/"
for d in public routes src data bin; do [ -d "$ROOT/api/$d" ] && cp -r "$ROOT/api/$d" "$B/api/"; done
# 설정은 웹루트 밖 서버 전용 파일을 가리키는 한 줄 — 시크릿은 번들에 없다
printf '%s\n' '<?php' "return require '/var/www/platform_conf/config.php';" > "$B/api/config.php"
cp "$ROOT/scripts/platform.htaccess" "$B/.htaccess"
cp "$ROOT/scripts/platform-api.htaccess" "$B/api/.htaccess"
grep -rlE "config\.php\.|\.pem$|\.env$" "$B" >/dev/null 2>&1 && { echo "❌ 번들에 민감 파일 — 중단"; exit 1; }
mkdir -p "$WORK/deploy/db/migrations" "$WORK/deploy/ops"
cp "$ROOT/db/schema.sql" "$WORK/deploy/db/"; cp "$ROOT"/db/migrations/*.sql "$WORK/deploy/db/migrations/"
# 서버 운영 스크립트(웹루트 밖) — 마이그레이션 직전 백업·야간 백업이 같은 db-backup.sh 를 쓴다
cp "$ROOT/scripts/db-backup.sh" "$WORK/deploy/ops/"
if [ "$SEED" = 1 ]; then
  # 기준 데이터만(사용자와 무관한 표). FK 가 사용자를 가리키는 표는 넣지 않는다.
  SEED_T="asset_items asset_files asset_tags asset_tag_dict asset_sets core_files core_plans core_point_rules core_feature_flags"
  "$MARIADB_DUMP" --user=root --password=root --host=127.0.0.1 --protocol=tcp --default-character-set=utf8mb4 --single-transaction \
    --no-create-info --skip-triggers --skip-comments --replace --skip-add-locks powerplus $SEED_T > "$WORK/deploy/db/seed.sql"
  echo "seed $(du -h "$WORK/deploy/db/seed.sql" | cut -f1)"
fi
(cd "$WORK/deploy" && tar -czf bundle.tgz platform db ops)
echo "bundle $(du -h "$WORK/deploy/bundle.tgz" | cut -f1)"
[ "$DRY" = 1 ] && { echo "dry-run 종료"; exit 0; }

echo "== 3. 업로드·설치 =="
scp -q -i "$KEY" "${SCP_OPTS[@]}" "$WORK/deploy/bundle.tgz" "$HOST:/tmp/pp-bundle.tgz"
ssh -i "$KEY" "${SSH_OPTS[@]}" "$HOST" "SEED=$SEED bash -s" <<'EOF'
set -e
sudo test -f /var/www/platform_conf/config.php || { echo "❌ 서버 설정 없음 — scripts/server-setup.sh 먼저"; exit 1; }
T=$(mktemp -d); tar -xzf /tmp/pp-bundle.tgz -C "$T"; rm -f /tmp/pp-bundle.tgz
# 백업 스크립트를 ~/bin 에 새로 놓는다(야간 크론이 같은 판을 쓴다 — 상태 파일을 쓰는 판, 2026-10-17)
mkdir -p "$HOME/bin" "$HOME/db-backup/predeploy"; install -m 700 "$T/ops/db-backup.sh" "$HOME/bin/db-backup.sh"
crontab -l 2>/dev/null | grep -q db-backup.sh || echo "⚠ 야간 DB 백업 크론이 없다 — 서버에서 scripts/db-backup-install.sh 를 한 번"
# 경보(health-alert.php)가 처음부터 판정할 수 있게 — 상태 파일이 없으면 마지막 야간 덤프 시각으로 한 번 채운다
ST=/var/www/platform_data/db-backup.status
if ! sudo test -f "$ST"; then
  LASTF=$(ls -t "$HOME"/db-backup/nightly/pp_platform-*.sql.gz 2>/dev/null | head -1 || true)
  [ -n "$LASTF" ] && echo "$(stat -c %Y "$LASTF") ok seed-from-deploy" | sudo tee "$ST" >/dev/null && echo "백업 상태 파일 채움"
fi
# 마이그레이션 직전 백업 — 실패하면 set -e 로 여기서 멈춘다(마이그레이션·교체 안 함). 7일 보존
BACKUP_DIR="$HOME/db-backup/predeploy" KEEP_DAYS=7 DBS=pp_platform STATUS= bash "$T/ops/db-backup.sh"
# DB: schema.sql(멱등) → 미적용 마이그레이션만 순서대로
DB="sudo mariadb pp_platform"
$DB < "$T/db/schema.sql"
for f in $(ls "$T/db/migrations" | sort); do
  n=$($DB -N -B -e "SELECT COUNT(*) FROM schema_migrations WHERE name='$f'")
  # 실패하면 여기서 멈춘다 — 예전 `a && b && c` 꼴은 set -e 가 안 걸려, 실패한 마이그레이션을 이력 없이 두고 다음 것·코드 교체까지 갔다(2026-10-18 전수조사 B)
  if [ "$n" = "0" ]; then
    if ! $DB < "$T/db/migrations/$f"; then
      echo "❌ 마이그레이션 실패: $f — 다음 마이그레이션·코드 교체를 하지 않고 멈춥니다. 직전 백업: ~/db-backup/predeploy" >&2
      exit 1
    fi
    $DB -e "INSERT INTO schema_migrations (name) VALUES ('$f')"
    echo "migrated $f"
  fi
done
[ "$SEED" = 1 ] && [ -f "$T/db/seed.sql" ] && { $DB < "$T/db/seed.sql"; echo "seed 적용"; }
# 무중단 교체: 옆 폴더에 권한까지 맞춘 뒤 이름만 바꾼다.
# 바로 전 판은 platform.old 로 다음 배포까지 남긴다(딱 하나). 되돌리기:
#   sudo mv /var/www/platform /var/www/platform.bad && sudo mv /var/www/platform.old /var/www/platform
#   (DB 는 ~/db-backup/predeploy 의 배포 직전 덤프 — 마이그레이션이 표를 바꿨을 때만)
NEW=/var/www/platform.new; OLD=/var/www/platform.old
sudo rm -rf "$NEW"; sudo mkdir -p "$NEW"; sudo cp -r "$T/platform/." "$NEW/"
sudo chown -R www-data:www-data "$NEW"; sudo find "$NEW" -type d -exec chmod 755 {} +; sudo find "$NEW" -type f -exec chmod 644 {} +
sudo rm -rf "$OLD" && sudo mv /var/www/platform "$OLD" && sudo mv "$NEW" /var/www/platform
rm -rf "$T"
# 서버 자원 표본(관리자 대시보드 '서버 자원') — www-data crontab 에 5분마다, 없을 때만 등록.
# 설정 파일이 root:www-data 640 이라 www-data 로 돌린다. php8.4 우선(8.5 CLI 에는 pdo_mysql 이 없을 수 있다).
PHPB=$(command -v php8.4 || command -v php || true)
if [ -n "$PHPB" ]; then
  # 없을 때만 한 줄 더한다(이미 있으면 사람이 고친 시간·경로를 그대로 둔다). $1 = 찾을 스크립트 이름, $2 = 크론식, $3 = 뒤에 붙일 인자·로그
  # api/bin 머리 주석에 크론이 적힌 스크립트는 전부 여기 있어야 한다 — preflight 가 빠진 것을 막는다(R47)
  addcron() {
    if ! sudo crontab -u www-data -l 2>/dev/null | grep -qF "$1"; then
      { sudo crontab -u www-data -l 2>/dev/null || true; echo "$2 $PHPB /var/www/platform/api/bin/$1 $3"; } | sudo crontab -u www-data - && echo "크론 등록: $1 ($2)"
    fi
  }
  L=/var/www/platform_data
  addcron sample-metrics.php '*/5 * * * *' '>/dev/null 2>&1'
  # powerAssets 개선 체크리스트 자가 고리 — 결과 0건 검색어를 매일 쌓고, 결과가 생기면 자동 '고침'(qa-feed.php 머리 주석에만 있고 등록이 빠져 있었다, 2026-10-15 점검)
  addcron qa-feed.php '20 5 * * *' 'assets-search >/dev/null 2>&1'
  # 2026-10-17: 머리 주석에만 있던 셋 + 새 둘 — 보유 기간 정리·업로드 검사·워터마크 예열·멈춘 장표 작업 정리·운영 경보
  addcron retention.php '10 4 * * *' ">> $L/retention.log 2>&1"
  addcron scan-queue.php '*/10 * * * *' ">> $L/scan.log 2>&1"
  addcron prewarm-wm.php '30 3 * * *' ">> $L/prewarm.log 2>&1"
  addcron deck-reaper.php '*/5 * * * *' ">> $L/deck-reaper.log 2>&1"
  addcron health-alert.php '*/10 * * * *' ">> $L/health-alert.log 2>&1"
  sudo -u www-data "$PHPB" /var/www/platform/api/bin/sample-metrics.php || echo "⚠ 서버 자원 표본 실패(error_log 확인)"
fi
echo "설치 완료"
EOF

echo "== 4. 검증 =="
ok=1
chk() { local c; c=$(curl -s -o /dev/null -w "%{http_code}" "$1"); [ "$c" = "$2" ] && echo "✓ $1 $c" || { echo "✗ $1 $c (기대 $2)"; ok=0; }; }
chk $PUBLIC/ 200
chk $PUBLIC/assets 200
chk $PUBLIC/assets/start 200
chk $PUBLIC/deck 200
chk $PUBLIC/addin/taskpane.html 200
chk $PUBLIC/addin/manifest.xml 200
chk $PUBLIC/addin/powerAssets_Setup.exe 200
chk $PUBLIC/mock 200
chk $PUBLIC/guide 200
chk $PUBLIC/api/v1/health 200
chk $PUBLIC/api/config.php 403
chk $PUBLIC/api/src/Core/Config.php 403
H=$(curl -s $PUBLIC/api/v1/health); echo "health: $H"
echo "$H" | grep -q '"db":true' || { echo "✗ DB 연결 실패"; ok=0; }
chk $PUBLIC/mockref/api/health 200
# SPA 주소 판정(api/public/spa.php): 모르는 주소는 404, 공개 화면은 화면별 제목, robots·sitemap 은 PHP 가 만든다
chk $PUBLIC/no-such-page-zz9 404
chk $PUBLIC/robots.txt 200
chk $PUBLIC/sitemap.xml 200
curl -s $PUBLIC/pricing | grep -q '<title>요금제 — powerPlus</title>' && echo "✓ /pricing 제목 주입" || { echo "✗ /pricing 제목 주입 안 됨"; ok=0; }
# 보안 헤더: 일반 화면은 같은 사이트에서만 iframe, 애드인(/addin/)은 Office 가 iframe 으로 띄우므로 X-Frame-Options 가 없어야 한다
curl -sI $PUBLIC/about | grep -qi '^x-frame-options: SAMEORIGIN' && echo "✓ X-Frame-Options" || { echo "✗ X-Frame-Options 없음"; ok=0; }
curl -sI $PUBLIC/addin/taskpane.html | grep -qi '^x-frame-options' && { echo "✗ 애드인에 X-Frame-Options — Office 에서 안 열린다"; ok=0; } || echo "✓ 애드인 iframe 허용"
# PERF-003: 배포 직후 첫 요청이 느리지 않게 웹이 실제로 부르는 주소를 한 번씩 불러 예열(DB 버퍼·opcache).
#   주소는 프론트 호출부와 같게(apps/web/app/lib/assets.ts·home.tsx·search.ts) — 다르면 예열 효과가 없다.
#   2026-10-16 회원 전용 전환 뒤 assets/* 는 비로그인 401 이라 예열이 안 된다 → 열린 경로(Router OPEN_PATHS)만 부른다.
#   plans 는 결제 숨김(billing_visible) 동안 일부러 404 라 뺀다.
for p in "home/stats" "changelog" "help/docs" "removal/stats"; do
  t=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$PUBLIC/api/v1/$p")
  echo "예열 /api/v1/$p → $t"
done
for u in https://hom2box.com/; do echo "포트폴리오 $u $(curl -s -o /dev/null -w "%{http_code}" "$u")"; done
[ "$ok" = 1 ] && echo "배포 정상" || { echo "❌ 검증 실패"; exit 1; }
