#!/usr/bin/env bash
# 운영 DB 야간 덤프(서버에서 deploy 크론으로 돈다, F3 백업·복구 리허설의 전제).
#   설치: scripts/db-backup-install.sh 가 이 파일을 ~/bin 에 두고 크론(매일 02:40)을 건다.
#   수동: ~/bin/db-backup.sh
# 대상 = pp_platform(플랫폼)·pp_mockref(레퍼런스). hom2box 는 표 0MB(포트폴리오는 정적)라 뺀다.
# 보존 = 14일. 날짜별 .sql.gz, 끝나면 gzip -t 로 깨진 파일인지 확인한다.
set -euo pipefail
OUT=${BACKUP_DIR:-$HOME/db-backup/nightly}
KEEP_DAYS=${KEEP_DAYS:-14}
DBS=${DBS:-"pp_platform pp_mockref"}
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M)
for db in $DBS; do
  f="$OUT/$db-$STAMP.sql.gz"
  # --single-transaction: InnoDB 는 잠금 없이 일관 스냅샷. --routines/--triggers 로 함수·트리거까지.
  sudo mariadb-dump --single-transaction --quick --routines --triggers --events "$db" | gzip -6 > "$f"
  gzip -t "$f"
  echo "$(date '+%F %T') $db $(du -h "$f" | cut -f1) ok"
done
find "$OUT" -name '*.sql.gz' -mtime +"$KEEP_DAYS" -delete
