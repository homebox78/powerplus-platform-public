#!/usr/bin/env bash
# powerMCP 배포 — https://powerplus.hom2box.com/mcp (서버 :3110, systemd powermcp).
#   bash scripts/deploy-mcp.sh
# 서버 /var/www/platform-mcp/current 에 코드(packages/mcp·shared·guide-files·작업 공간 파일)를 덮어쓰고(node_modules 유지)
# 의존성을 맞춘 뒤 scripts/powermcp.service 를 설치하고 다시 시작한다. 키 값은 /var/www/platform_conf/powermcp.env 에만.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${PP_HOST:?PP_HOST=user@host 필요}"
KEY_SRC="${PP_SSH_KEY:-}"
for k in "$HOME/google_key.pem"; do [ -n "$KEY_SRC" ] && break; [ -f "$k" ] && KEY_SRC="$k"; done
[ -f "$KEY_SRC" ] || { echo "❌ SSH 키를 찾지 못함 — PP_SSH_KEY=/path/google_key.pem"; exit 1; }
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
KEY="$WORK/key.pem"; cp "$KEY_SRC" "$KEY"; chmod 600 "$KEY"

(cd packages/mcp && npx tsc --noEmit)
tar --exclude=node_modules -cf "$WORK/mcp.tar" packages/mcp packages/shared apps/web/public/guide-files package.json pnpm-lock.yaml pnpm-workspace.yaml scripts/powermcp.service
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$WORK/mcp.tar" "$HOST:/tmp/mcp.tar"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" 'set -e
C=/var/www/platform-mcp/current
rm -rf $C/packages/mcp/src $C/packages/shared/src
tar -C $C -xf /tmp/mcp.tar; rm -f /tmp/mcp.tar
cd $C && pnpm install --prod --filter "@pp/mcp..." --frozen-lockfile >/dev/null 2>&1 || pnpm install --prod --filter "@pp/mcp..." >/dev/null
sed -i "s/\r$//" $C/scripts/powermcp.service
sudo cp $C/scripts/powermcp.service /etc/systemd/system/powermcp.service
sudo systemctl daemon-reload && sudo systemctl restart powermcp
for i in $(seq 1 20); do curl -fs http://127.0.0.1:3110/mcp/health >/dev/null 2>&1 && break; sleep 1; done
curl -s http://127.0.0.1:3110/mcp/health'
echo
curl -fs https://powerplus.hom2box.com/mcp/health >/dev/null && echo "배포 정상" || { echo "❌ powerMCP 응답 없음"; exit 1; }
