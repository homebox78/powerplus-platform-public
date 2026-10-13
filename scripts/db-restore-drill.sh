#!/usr/bin/env bash
# 백업 복구 리허설(F3, 월 1회). 최신 야간 덤프를 임시 DB(<db>_drill)에 복원해 표·행 수를 운영과 대조한 뒤 임시 DB 를 지운다.
# 운영 DB 는 읽기만 한다.
#   실행: ~/bin/db-restore-drill.sh [pp_platform|pp_mockref ...]
set -euo pipefail
OUT=${BACKUP_DIR:-$HOME/db-backup/nightly}
DBS=${*:-pp_platform pp_mockref}
fail=0
for db in $DBS; do
  f=$(ls -t "$OUT"/"$db"-*.sql.gz 2>/dev/null | head -1)
  [ -n "$f" ] || { echo "$db: 덤프 없음"; fail=1; continue; }
  drill="${db}_drill"
  t0=$(date +%s)
  sudo mariadb -e "DROP DATABASE IF EXISTS \`$drill\`; CREATE DATABASE \`$drill\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  gunzip -c "$f" | sudo mariadb "$drill"
  # 대조: 표 수·전체 행 수(information_schema 추정치 대신 표마다 COUNT)
  q() { sudo mariadb -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$1'"; }
  rows() { sudo mariadb -N "$1" -e "SHOW TABLES" | while read -r t; do sudo mariadb -N "$1" -e "SELECT COUNT(*) FROM \`$t\`"; done | awk '{s+=$1} END{print s+0}'; }
  tp=$(q "$db"); td=$(q "$drill"); rp=$(rows "$db"); rd=$(rows "$drill")
  sudo mariadb -e "DROP DATABASE \`$drill\`"
  printf '%s %s 덤프=%s 표 %s/%s 행 %s/%s %s초' "$(date '+%F %T')" "$db" "$(basename "$f")" "$td" "$tp" "$rd" "$rp" "$(( $(date +%s) - t0 ))"
  if [ "$tp" = "$td" ]; then echo " 통과(행 차이는 덤프 이후 변경분)"; else echo " 실패: 표 수 다름"; fail=1; fi
done
exit $fail
