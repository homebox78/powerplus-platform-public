#!/usr/bin/env bash
# powerMCP 배포 — $PUBLIC/mcp (서버 :3110, systemd powermcp).
#   bash scripts/deploy-mcp.sh
# 서버 /var/www/platform-mcp/current 에 코드(packages/mcp·shared·guide-files·작업 공간 파일)를 덮어쓰고(node_modules 유지)
# 의존성을 맞춘 뒤 scripts/powermcp.service 를 설치하고 다시 시작한다. 키 값은 /var/www/platform_conf/powermcp.env 에만.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/preflight.sh mcp || exit 1   # 배포 전 자가 검사 — 남의 미커밋 변경이 같이 올라가지 않게(R39)
# 정리 필요: tar 가 작업 트리를 싣는다 — git 제외된 시험 파일 packages/mcp/.mcpcall*.mjs·.mcprun.mjs 도 서버로 간다.
source "$(dirname "$0")/deploy-target.sh"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
KEY="$WORK/key.pem"; cp "$KEY_SRC" "$KEY"; chmod 600 "$KEY"

(cd packages/mcp && npx tsc --noEmit)
tar --exclude=node_modules -cf "$WORK/mcp.tar" packages/mcp packages/shared apps/web/public/guide-files package.json pnpm-lock.yaml pnpm-workspace.yaml scripts/powermcp.service
scp -i "$KEY" "${SCP_OPTS[@]}" "$WORK/mcp.tar" "$HOST:/tmp/mcp.tar"
ssh -i "$KEY" "${SSH_OPTS[@]}" "$HOST" "PUBLIC='$PUBLIC' bash -s" <<'EOS'
set -e
C=/var/www/platform-mcp/current
rm -rf $C/packages/mcp/src $C/packages/shared/src
tar -C $C -xf /tmp/mcp.tar; rm -f /tmp/mcp.tar
cd $C && pnpm install --prod --filter "@pp/mcp..." --frozen-lockfile >/dev/null 2>&1 || pnpm install --prod --filter "@pp/mcp..." >/dev/null
sed -i "s/\r$//" $C/scripts/powermcp.service
# 서비스 계정·공개 주소는 대상 서버 것으로(GCP deploy·hom2box.com / 회사 solideos·solideos.com:46443)
sed -e "s#^User=.*#User=$(id -un)#" -e "s#https://powerplus.hom2box.com#$PUBLIC#g" $C/scripts/powermcp.service | sudo tee /etc/systemd/system/powermcp.service >/dev/null
sudo systemctl daemon-reload && sudo systemctl restart powermcp
for i in $(seq 1 20); do curl -fs http://127.0.0.1:3110/mcp/health >/dev/null 2>&1 && break; sleep 1; done
curl -s http://127.0.0.1:3110/mcp/health
EOS
echo
curl -fs $PUBLIC/mcp/health >/dev/null && echo "배포 정상" || { echo "❌ powerMCP 응답 없음"; exit 1; }
