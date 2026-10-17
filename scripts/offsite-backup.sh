#!/usr/bin/env bash
# 서버 밖 백업 — 야간 DB 덤프와 데이터 폴더(덱 결과·업로드·시안·자산)를 GCS 버킷으로 복사(2026-10-17 보안 점검: 백업이 같은 VM 디스크에만 있었다).
#   서버에서 deploy 크론으로 돈다(매일 03:30, db-backup.sh 02:40 뒤). 설치: scripts/offsite-backup-install.sh
#   설정: /var/www/platform_conf/offsite.env (600) —
#     GCS_BUCKET=gs://버킷이름          백업 버킷(보존 30일은 버킷 수명 주기 규칙으로)
#     GCS_KEY=/var/www/platform_conf/gcs-backup.json   버킷 쓰기 권한만 가진 서비스 계정 키(VM 기본 계정은 저장소 읽기 전용이라 따로 둔다)
#   설정 파일이 없으면 아무것도 하지 않고 끝난다(설치만 먼저 해 둘 수 있게).
# 결과 한 줄("유닉스시각 ok|fail 메모")을 STATUS 에 쓴다 — db-backup.status 와 같은 꼴.
set -euo pipefail
CONF=${CONF:-/var/www/platform_conf/offsite.env}
STATUS=${STATUS-/var/www/platform_data/offsite-backup.status}
status() { [ -n "$STATUS" ] && echo "$(date +%s) $*" | sudo tee "$STATUS" >/dev/null || true; }
[ -r "$CONF" ] || sudo test -r "$CONF" || { echo "설정 없음($CONF) — 건너뜀"; exit 0; }
# shellcheck disable=SC1090
eval "$(sudo cat "$CONF" | grep -E '^(GCS_BUCKET|GCS_KEY)=')"
[ -n "${GCS_BUCKET:-}" ] && [ -n "${GCS_KEY:-}" ] || { status "fail 설정 비어 있음"; exit 1; }
trap 'status "fail line $LINENO"' ERR
KEY=$(mktemp); sudo cat "$GCS_KEY" > "$KEY"; chmod 600 "$KEY"; trap 'rm -f "$KEY"; status "fail line $LINENO"' ERR; trap 'rm -f "$KEY"' EXIT
GS=(gsutil -q -m -o "Credentials:gs_service_key_file=$KEY")
DAY=$(date +%Y%m%d)
# ① DB — 오늘 만든 야간 덤프만(날짜 폴더로 쌓이고 수명 주기 규칙이 30일 뒤 지운다)
shopt -s nullglob
dumps=("$HOME"/db-backup/nightly/*-"$DAY"-*.sql.gz)
[ ${#dumps[@]} -gt 0 ] || { status "fail 오늘 덤프 없음"; exit 1; }
"${GS[@]}" cp "${dumps[@]}" "$GCS_BUCKET/db/$DAY/"
# ② 데이터 폴더 — 바뀐 것만 올린다(지운 파일은 버킷에 남긴다 — 실수로 지운 것도 되살릴 수 있게). 임시·캐시는 뺀다
sudo -n true 2>/dev/null && READ=(sudo) || READ=()
"${READ[@]}" "${GS[@]}" rsync -r -x '(^|/)(tmp|cache|\.cache)/' /var/www/platform_data "$GCS_BUCKET/data"
echo "$(date '+%F %T') DB ${#dumps[@]}개 · 데이터 동기화 → $GCS_BUCKET"
status "ok db=${#dumps[@]}"
