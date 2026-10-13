#!/usr/bin/env bash
# 레퍼런스 데이터 동기화 — 로컬 홈박스 DB(homebox)·storage 에서 새로 게시된 사이트를 운영 pp_mockref 로 올린다.
#   bash scripts/sync-mockref-data.sh            # 실행
#   DRY=1 bash scripts/sync-mockref-data.sh      # 대상 수만 보고
# 대상 사이트 = 서버에 없는 id(> 서버 MAX(sites.id)) + 서버 복사 이후 다시 게시된 사이트(screens.published_at > SINCE).
# 그 사이트의 화면·섹션·마스크·네비·디자인 행은 서버에서 지우고 REPLACE 로 다시 넣는다(수집 PC 가 원본, 서버는 읽기만).
# 분류 표(org_types 등)는 전체 REPLACE. 파일은 서버 MAX(assets.id) 뒤에 생긴 에셋만 tar 로.
# 2026-10-10 신설 — 대학 216곳·GDWEB 647곳 레퍼런스 확장(홈박스 PROJECTS 로그). 멱등: 두 번 돌려도 같은 결과.
set -euo pipefail
cd "$(dirname "$0")/.."
HB="${HB_ROOT:-/d/homebox-handoff}"
LOCAL_DB="${LOCAL_DB_URL:-mysql://root:root@127.0.0.1:3306/homebox}"
SINCE="${SINCE:-2026-10-06 12:00:00}"
HOST="${PP_HOST:?PP_HOST=user@host 필요}"
KEY_SRC="${PP_SSH_KEY:-}"
for k in "$HOME/google_key.pem"; do [ -n "$KEY_SRC" ] && break; [ -f "$k" ] && KEY_SRC="$k"; done
[ -f "$KEY_SRC" ] || { echo "❌ SSH 키를 찾지 못함 — PP_SSH_KEY=/path/google_key.pem"; exit 1; }
DUMP=""; for d in /d/tools/mariadb-*/bin/mariadb-dump.exe /d/tools/mariadb-*/bin/mysqldump.exe; do [ -f "$d" ] && DUMP="$d" && break; done
[ -n "$DUMP" ] || { echo "❌ mariadb-dump 없음(D:\tools\mariadb-*)"; exit 1; }
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
KEY="$WORK/key.pem"; cp "$KEY_SRC" "$KEY"; chmod 600 "$KEY"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")

# 로컬 DB 접속 값
DBU=$(echo "$LOCAL_DB" | sed -E 's#mysql://([^:]+):.*#\1#'); DBP=$(echo "$LOCAL_DB" | sed -E 's#mysql://[^:]+:([^@]*)@.*#\1#')
DBH=$(echo "$LOCAL_DB" | sed -E 's#.*@([^:/]+).*#\1#'); DBPORT=$(echo "$LOCAL_DB" | sed -E 's#.*:([0-9]+)/.*#\1#'); DBN=$(echo "$LOCAL_DB" | sed -E 's#.*/([^/?]+).*#\1#')
LQ() { "$(dirname "$DUMP")/mariadb.exe" -h"$DBH" -P"$DBPORT" -u"$DBU" -p"$DBP" -N "$DBN" -e "$1"; }

echo "[1] 서버 기준"
read -r S_SITE S_ASSET < <("${SSH[@]}" 'sudo mariadb -N pp_mockref -e "SELECT (SELECT MAX(id) FROM sites),(SELECT MAX(id) FROM assets)"' | tr '\t' ' ')
echo "  서버 MAX sites=$S_SITE assets=$S_ASSET · SINCE=$SINCE"

SITE_W="s.status='published' AND (s.id > $S_SITE OR EXISTS(SELECT 1 FROM screens x WHERE x.site_id=s.id AND x.published_at > '$SINCE'))"
SITE_WT="${SITE_W//s./sites.}"
N_SITE=$(LQ "SELECT COUNT(*) FROM sites s WHERE $SITE_W")

N_ASSET=$(LQ "SELECT COUNT(*) FROM assets WHERE id > $S_ASSET AND bucket='homebox-public'")
echo "  대상(게시) 사이트 $N_SITE · 새 공개 에셋 $N_ASSET"
[ "${DRY:-0}" = 1 ] && exit 0
[ "$N_SITE" -gt 0 ] || { echo "보낼 것 없음"; exit 0; }

echo "[2] 덤프"
SIDS="SELECT s.id FROM sites s WHERE $SITE_W"
SCIDS="SELECT id FROM screens WHERE site_id IN ($SIDS)"
SEIDS="SELECT id FROM sections WHERE screen_id IN ($SCIDS)"
D=("$DUMP" -h"$DBH" -P"$DBPORT" -u"$DBU" -p"$DBP" --no-create-info --replace --skip-triggers --skip-add-locks --skip-lock-tables --single-transaction --default-character-set=utf8mb4 --complete-insert "$DBN")
{
  echo "SET FOREIGN_KEY_CHECKS=0; SET NAMES utf8mb4;"
  # 분류 표 전체
  "${D[@]}" org_types site_types page_types section_types style_tags krds_components krds_component_categories krds_patterns flow_scenarios vendors
  "${D[@]}" organizations --where="id IN (SELECT org_id FROM sites s WHERE $SITE_W)"
  "${D[@]}" sites --where="$SITE_WT"
  for t in screens nav_states site_design site_krds site_style_tags site_awards site_projects site_wa_certs flows g2b_notices g2b_contracts award_entries; do
    "${D[@]}" "$t" --where="site_id IN ($SIDS)"
  done
  "${D[@]}" source_records --where="matched_site_id IN ($SIDS)"
  for t in masks page_design flow_steps components; do "${D[@]}" "$t" --where="screen_id IN ($SCIDS)"; done
  "${D[@]}" sections --where="screen_id IN ($SCIDS)"
  "${D[@]}" section_krds --where="section_id IN ($SEIDS)"
  "${D[@]}" assets --where="id > $S_ASSET"
  echo "SET FOREIGN_KEY_CHECKS=1;"
} > "$WORK/rows.sql"
# 서버에서 먼저 지울 것(같은 사이트의 옛 화면·섹션)
LQ "SET SESSION group_concat_max_len=4000000; SELECT GROUP_CONCAT(id) FROM (SELECT s.id FROM sites s WHERE $SITE_W) z" > "$WORK/ids.txt"
IDS=$(cat "$WORK/ids.txt")
cat > "$WORK/pre.sql" <<SQL
SET FOREIGN_KEY_CHECKS=0;
DELETE FROM section_krds WHERE section_id IN (SELECT id FROM sections WHERE screen_id IN (SELECT id FROM screens WHERE site_id IN ($IDS)));
DELETE FROM sections WHERE screen_id IN (SELECT id FROM screens WHERE site_id IN ($IDS));
DELETE FROM masks WHERE screen_id IN (SELECT id FROM screens WHERE site_id IN ($IDS));
DELETE FROM page_design WHERE screen_id IN (SELECT id FROM screens WHERE site_id IN ($IDS));
DELETE FROM flow_steps WHERE screen_id IN (SELECT id FROM screens WHERE site_id IN ($IDS));
DELETE FROM components WHERE screen_id IN (SELECT id FROM screens WHERE site_id IN ($IDS));
DELETE FROM screens WHERE site_id IN ($IDS);
DELETE FROM nav_states WHERE site_id IN ($IDS);
DELETE FROM site_design WHERE site_id IN ($IDS);
DELETE FROM site_krds WHERE site_id IN ($IDS);
DELETE FROM site_style_tags WHERE site_id IN ($IDS);
DELETE FROM flows WHERE site_id IN ($IDS);
SET FOREIGN_KEY_CHECKS=1;
SQL
echo "  rows.sql $(du -h "$WORK/rows.sql" | cut -f1)"

echo "[3] 파일"
LQ "SELECT CONCAT(bucket,'/',\`key\`) FROM assets WHERE id > $S_ASSET AND bucket='homebox-public'" > "$WORK/files.txt"
miss=0; : > "$WORK/files.ok"
while read -r p; do [ -f "$HB/storage/$p" ] && echo "$p" >> "$WORK/files.ok" || miss=$((miss+1)); done < "$WORK/files.txt"
echo "  파일 $(wc -l < "$WORK/files.ok") · 로컬에 없음 $miss"
tar -C "$HB/storage" -cf "$WORK/files.tar" -T "$WORK/files.ok"
gzip -1 "$WORK/rows.sql"
echo "  files.tar $(du -h "$WORK/files.tar" | cut -f1)"

echo "[4] 올리기"
scp -q -i "$KEY" "$WORK/rows.sql.gz" "$WORK/pre.sql" "$WORK/files.tar" "$HOST:/tmp/"
"${SSH[@]}" 'set -e
sudo mariadb pp_mockref < /tmp/pre.sql
gunzip -c /tmp/rows.sql.gz | sudo mariadb pp_mockref
sudo tar -C /var/www/platform_data/mockref -xf /tmp/files.tar
sudo chown -R www-data:www-data /var/www/platform_data/mockref/homebox-public /var/www/platform_data/mockref/private 2>/dev/null || true
rm -f /tmp/rows.sql.gz /tmp/pre.sql /tmp/files.tar
sudo mariadb -N pp_mockref -e "SELECT CONCAT(\"  서버 sites \",(SELECT COUNT(*) FROM sites WHERE status=\"published\"),\" 게시 · MAX id \",(SELECT MAX(id) FROM sites),\" · screens \",(SELECT COUNT(*) FROM screens),\" · org_types \",(SELECT COUNT(*) FROM org_types))"'
echo "[5] 검증"
code=$(curl -s -o /dev/null -w "%{http_code}" https://powerplus.hom2box.com/mockref/api/health); echo "  health $code"
echo "완료"
