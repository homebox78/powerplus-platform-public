#!/usr/bin/env bash
# 서버(운영 계정)에서 한 번: 서버 밖 백업 스크립트를 ~/bin 에 두고 크론(매일 03:30 — 야간 덤프 02:40 뒤)을 등록한다. 멱등.
# 설정 파일(/var/www/platform_conf/offsite.env)이 없으면 스크립트가 조용히 건너뛰므로 먼저 설치해 둬도 된다.
set -euo pipefail
mkdir -p "$HOME/bin" "$HOME/db-backup"
cp "$(dirname "$0")/offsite-backup.sh" "$HOME/bin/"
chmod 700 "$HOME/bin/offsite-backup.sh"
LINE="30 3 * * * $HOME/bin/offsite-backup.sh >> $HOME/db-backup/offsite.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'offsite-backup.sh'; echo "$LINE" ) | crontab -
crontab -l | grep offsite-backup.sh
