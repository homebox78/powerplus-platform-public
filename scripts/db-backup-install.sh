#!/usr/bin/env bash
# 서버(deploy)에서 한 번: 덤프·리허설 스크립트를 ~/bin 에 두고 야간 덤프 크론(02:40)을 등록한다. 멱등.
set -euo pipefail
mkdir -p "$HOME/bin" "$HOME/db-backup/nightly"
cp "$(dirname "$0")/db-backup.sh" "$(dirname "$0")/db-restore-drill.sh" "$HOME/bin/"
chmod 700 "$HOME/bin/db-backup.sh" "$HOME/bin/db-restore-drill.sh"
chmod 700 "$HOME/db-backup/nightly"
LINE="40 2 * * * $HOME/bin/db-backup.sh >> $HOME/db-backup/nightly.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'db-backup.sh'; echo "$LINE" ) | crontab -
crontab -l | grep db-backup.sh
