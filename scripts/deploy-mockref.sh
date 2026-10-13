#!/usr/bin/env bash
# 레퍼런스 엔진(services/mockref-api) 배포 — https://powerplus.hom2box.com/mockref/api (powerMCP mock_ 도구가 쓴다).
#   bash scripts/deploy-mockref.sh
# 서버: 코드 /var/www/platform-mockref/api (옆 폴더에 풀고 이름 교체) · 설정 /var/www/platform_conf/mockref.php(링크)
#       파일 /var/www/platform_data/mockref · DB pp_mockref. 처음 한 번은 scripts/migrate-legacy-server.sh 가 설정·DB·파일을 만든다.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/preflight.sh mockref || exit 1   # 배포 전 자가 검사
HOST="${PP_HOST:?PP_HOST=user@host 필요}"
KEY_SRC="${PP_SSH_KEY:-}"
for k in "$HOME/google_key.pem"; do [ -n "$KEY_SRC" ] && break; [ -f "$k" ] && KEY_SRC="$k"; done
[ -f "$KEY_SRC" ] || { echo "❌ SSH 키를 찾지 못함 — PP_SSH_KEY=/path/google_key.pem"; exit 1; }
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
KEY="$WORK/key.pem"; cp "$KEY_SRC" "$KEY"; chmod 600 "$KEY"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")

for f in services/mockref-api/src/*.php services/mockref-api/routes/*.php services/mockref-api/public/index.php; do php -l "$f" >/dev/null; done
tar -C services --exclude=config.php -cf "$WORK/mockref.tar" mockref-api
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$WORK/mockref.tar" "$HOST:/tmp/mockref.tar"
"${SSH[@]}" 'set -e
B=/var/www/platform-mockref
sudo mkdir -p $B; sudo rm -rf $B/new; sudo mkdir $B/new
sudo tar -C $B/new -xf /tmp/mockref.tar; rm -f /tmp/mockref.tar
sudo mv $B/new/mockref-api $B/new/api
sudo ln -sfn /var/www/platform_conf/mockref.php $B/new/api/config.php
sudo chown -R deploy:www-data $B/new; sudo chmod -R g+rX $B/new
[ -d $B/api ] && sudo mv $B/api $B/old
sudo mv $B/new/api $B/api; sudo rm -rf $B/new $B/old
echo "코드 교체"'
code=$(curl -s -o /dev/null -w "%{http_code}" https://powerplus.hom2box.com/mockref/api/health)
echo "health $code $(curl -s https://powerplus.hom2box.com/mockref/api/health | head -c 200)"
[ "$code" = 200 ] || { echo "❌ 레퍼런스 엔진 응답 없음"; exit 1; }
c2=$(curl -s -o /dev/null -w "%{http_code}" https://powerplus.hom2box.com/mockref/api/config.php)
[ "$c2" != 200 ] || { echo "❌ 설정 파일이 보임"; exit 1; }
echo "배포 정상"
