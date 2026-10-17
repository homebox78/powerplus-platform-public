#!/usr/bin/env bash
# 운영 DB 야간 덤프(서버에서 deploy 크론으로 돈다, F3 백업·복구 리허설의 전제).
#   설치: scripts/db-backup-install.sh 가 이 파일을 ~/bin 에 두고 크론(매일 02:40)을 건다. deploy.sh 도 배포마다 ~/bin 판을 새로 놓는다.
#   수동: ~/bin/db-backup.sh
#   배포 직전 백업(deploy.sh): BACKUP_DIR=~/db-backup/predeploy KEEP_DAYS=7 DBS=pp_platform STATUS= db-backup.sh
# 대상 = pp_platform(플랫폼)·pp_mockref(레퍼런스). hom2box 는 표 0MB(포트폴리오는 정적)라 뺀다.
# 보존 = 14일. 날짜별 .sql.gz, 끝나면 gzip -t 로 깨진 파일인지 확인한다.
# 결과 한 줄("유닉스시각 ok|fail 메모")을 STATUS 파일에 쓴다 — api/bin/health-alert.php 가 26시간 넘게 안 바뀌거나 fail 이면 알린다
#   (홈 폴더 로그는 www-data 가 못 읽어서 데이터 폴더에 둔다, 2026-10-17). STATUS 를 비우면 쓰지 않는다(배포 직전 백업).
set -euo pipefail
OUT=${BACKUP_DIR:-$HOME/db-backup/nightly}
KEEP_DAYS=${KEEP_DAYS:-14}
DBS=${DBS:-"pp_platform pp_mockref"}
STATUS=${STATUS-/var/www/platform_data/db-backup.status}
status() { [ -n "$STATUS" ] && echo "$(date +%s) $*" | sudo tee "$STATUS" >/dev/null || true; }
trap 'status "fail line $LINENO"' ERR
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
status "ok $DBS"
