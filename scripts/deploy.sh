#!/usr/bin/env bash
# 플랫폼 배포 한 방 (Git Bash) — https://powerplus.hom2box.com  (최종 powerplus.solideos.com, 기획 §0)
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
HOST="${PP_HOST:?PP_HOST=user@host 필요}"
KEY_SRC="${PP_SSH_KEY:-}"
for k in "$HOME/google_key.pem"; do [ -n "$KEY_SRC" ] && break; [ -f "$k" ] && KEY_SRC="$k"; done
[ -f "$KEY_SRC" ] || { echo "❌ SSH 키를 찾지 못함 — PP_SSH_KEY=/path/google_key.pem"; exit 1; }
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
(cd "$ROOT/apps/web" && pnpm exec react-router build >/dev/null)
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
# 설치 마법사(exe) — scripts/build-installer.mjs 결과를 그대로 싣는다
[ -f "$ROOT/apps/addin/release/powerAssets_Setup.exe" ] && cp "$ROOT/apps/addin/release/powerAssets_Setup.exe" "$ROOT/apps/addin/release/setup.json" "$B/addin/"
for d in public routes src data bin; do [ -d "$ROOT/api/$d" ] && cp -r "$ROOT/api/$d" "$B/api/"; done
# 설정은 웹루트 밖 서버 전용 파일을 가리키는 한 줄 — 시크릿은 번들에 없다
printf '%s\n' '<?php' "return require '/var/www/platform_conf/config.php';" > "$B/api/config.php"
cp "$ROOT/scripts/platform.htaccess" "$B/.htaccess"
cp "$ROOT/scripts/platform-api.htaccess" "$B/api/.htaccess"
grep -rlE "config\.php\.|\.pem$|\.env$" "$B" >/dev/null 2>&1 && { echo "❌ 번들에 민감 파일 — 중단"; exit 1; }
mkdir -p "$WORK/deploy/db/migrations"
cp "$ROOT/db/schema.sql" "$WORK/deploy/db/"; cp "$ROOT"/db/migrations/*.sql "$WORK/deploy/db/migrations/"
if [ "$SEED" = 1 ]; then
  # 기준 데이터만(사용자와 무관한 표). FK 가 사용자를 가리키는 표는 넣지 않는다.
  SEED_T="asset_items asset_files asset_tags asset_tag_dict asset_sets core_files core_plans core_point_rules core_feature_flags"
  "$MARIADB_DUMP" --user=root --password=root --host=127.0.0.1 --protocol=tcp --default-character-set=utf8mb4 --single-transaction \
    --no-create-info --skip-triggers --skip-comments --replace --skip-add-locks powerplus $SEED_T > "$WORK/deploy/db/seed.sql"
  echo "seed $(du -h "$WORK/deploy/db/seed.sql" | cut -f1)"
fi
(cd "$WORK/deploy" && tar -czf bundle.tgz platform db)
echo "bundle $(du -h "$WORK/deploy/bundle.tgz" | cut -f1)"
[ "$DRY" = 1 ] && { echo "dry-run 종료"; exit 0; }

echo "== 3. 업로드·설치 =="
scp -q -i "$KEY" -o BatchMode=yes "$WORK/deploy/bundle.tgz" "$HOST:/tmp/pp-bundle.tgz"
ssh -i "$KEY" -o BatchMode=yes "$HOST" "SEED=$SEED bash -s" <<'EOF'
set -e
sudo test -f /var/www/platform_conf/config.php || { echo "❌ 서버 설정 없음 — scripts/server-setup.sh 먼저"; exit 1; }
T=$(mktemp -d); tar -xzf /tmp/pp-bundle.tgz -C "$T"; rm -f /tmp/pp-bundle.tgz
# DB: schema.sql(멱등) → 미적용 마이그레이션만 순서대로
DB="sudo mariadb pp_platform"
$DB < "$T/db/schema.sql"
for f in $(ls "$T/db/migrations" | sort); do
  n=$($DB -N -B -e "SELECT COUNT(*) FROM schema_migrations WHERE name='$f'")
  if [ "$n" = "0" ]; then $DB < "$T/db/migrations/$f" && $DB -e "INSERT INTO schema_migrations (name) VALUES ('$f')" && echo "migrated $f"; fi
done
[ "$SEED" = 1 ] && [ -f "$T/db/seed.sql" ] && { $DB < "$T/db/seed.sql"; echo "seed 적용"; }
# 무중단 교체: 옆 폴더에 권한까지 맞춘 뒤 이름만 바꾼다
NEW=/var/www/platform.new; OLD=/var/www/platform.old
sudo rm -rf "$NEW" "$OLD"; sudo mkdir -p "$NEW"; sudo cp -r "$T/platform/." "$NEW/"
sudo chown -R www-data:www-data "$NEW"; sudo find "$NEW" -type d -exec chmod 755 {} +; sudo find "$NEW" -type f -exec chmod 644 {} +
sudo mv /var/www/platform "$OLD" && sudo mv "$NEW" /var/www/platform && sudo rm -rf "$OLD"
rm -rf "$T"
# 서버 자원 표본(관리자 대시보드 '서버 자원') — www-data crontab 에 5분마다, 없을 때만 등록.
# 설정 파일이 root:www-data 640 이라 www-data 로 돌린다. php8.4 우선(8.5 CLI 에는 pdo_mysql 이 없을 수 있다).
PHPB=$(command -v php8.4 || command -v php || true)
if [ -n "$PHPB" ]; then
  if ! sudo crontab -u www-data -l 2>/dev/null | grep -q sample-metrics.php; then
    { sudo crontab -u www-data -l 2>/dev/null || true; echo "*/5 * * * * $PHPB /var/www/platform/api/bin/sample-metrics.php >/dev/null 2>&1"; } | sudo crontab -u www-data - && echo "크론 등록: sample-metrics ($PHPB)"
  fi
  sudo -u www-data "$PHPB" /var/www/platform/api/bin/sample-metrics.php || echo "⚠ 서버 자원 표본 실패(error_log 확인)"
fi
echo "설치 완료"
EOF

echo "== 4. 검증 =="
ok=1
chk() { local c; c=$(curl -s -o /dev/null -w "%{http_code}" "$1"); [ "$c" = "$2" ] && echo "✓ $1 $c" || { echo "✗ $1 $c (기대 $2)"; ok=0; }; }
chk https://powerplus.hom2box.com/ 200
chk https://powerplus.hom2box.com/assets 200
chk https://powerplus.hom2box.com/assets/start 200
chk https://powerplus.hom2box.com/deck 200
chk https://powerplus.hom2box.com/addin/taskpane.html 200
chk https://powerplus.hom2box.com/addin/manifest.xml 200
chk https://powerplus.hom2box.com/addin/powerAssets_Setup.exe 200
chk https://powerplus.hom2box.com/mock 200
chk https://powerplus.hom2box.com/guide 200
chk https://powerplus.hom2box.com/api/v1/health 200
chk https://powerplus.hom2box.com/api/config.php 403
chk https://powerplus.hom2box.com/api/src/Core/Config.php 403
H=$(curl -s https://powerplus.hom2box.com/api/v1/health); echo "health: $H"
echo "$H" | grep -q '"db":true' || { echo "✗ DB 연결 실패"; ok=0; }
chk https://powerplus.hom2box.com/mockref/api/health 200
# PERF-003: 배포 직후 첫 요청이 느리지 않게 웹이 실제로 부르는 주소를 한 번씩 불러 예열(DB 버퍼·opcache).
#   주소는 프론트 호출부와 같게(apps/web/app/lib/assets.ts·home.tsx·search.ts) — 다르면 예열 효과가 없다.
for p in "home/stats" "assets/categories" "assets/sets" "assets/items?page=1&limit=36" "assets/items?category=icon&page=1&limit=36" "changelog" "help/docs"; do
  t=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "https://powerplus.hom2box.com/api/v1/$p")
  echo "예열 /api/v1/$p → $t"
done
for u in https://hom2box.com/; do echo "포트폴리오 $u $(curl -s -o /dev/null -w "%{http_code}" "$u")"; done
[ "$ok" = 1 ] && echo "배포 정상" || { echo "❌ 검증 실패"; exit 1; }
