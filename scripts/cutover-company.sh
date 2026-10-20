#!/usr/bin/env bash
# GCP(powerplus.hom2box.com) → 회사 서버(powerplus.solideos.com) 전환 — 한 번에(2026-10-19 작성, 사용자 "1~6 진행").
#   bash scripts/cutover-company.sh          : 전환
#   bash scripts/cutover-company.sh --check  : 바깥에서 회사 서버 HTTPS 가 열리는지만 본다(바꾸는 것 없음)
# 순서: ① 바깥 HTTPS 확인(안 열리면 멈춤 — 평문으로 넘기면 로그인이 안 된다, R89) ② GCP 엔진·MCP·정기 작업 멈춤(쓰기 멈춤)
#       ③ 회사 서버가 GCP 에서 DB·파일 마지막 복사 ④ 회사 서버 엔진·정기 작업 켬 ⑤ GCP Apache 를 회사 서버로 넘기는 중계로
#       (이미 설치한 애드인·등록한 MCP 주소·북마크가 그대로 동작) ⑥ 확인
# 되돌리기: GCP 에서 sudo a2dissite powerplus-proxy && sudo a2ensite powerplus-le-ssl powerplus && reload,
#           GCP 엔진·MCP·크론 다시 켜기(~/www-data.cron.saved). 회사 서버 엔진은 끈다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NEW="https://powerplus.solideos.com:46443"
CK="$HOME/.ssh/pp_company_ed25519"
C=(ssh -p 4622 -i "$CK" -o BatchMode=yes solideos@powerplus.solideos.com)
GK="${PP_SSH_KEY:-}"; for k in "$HOME/google_key.pem"; do [ -n "$GK" ] && break; [ -f "$k" ] && GK="$k"; done
TMPK=$(mktemp); cp "$GK" "$TMPK"; chmod 600 "$TMPK"; trap 'rm -f "$TMPK"' EXIT
G=(ssh -i "$TMPK" -o BatchMode=yes user@server)

echo "== ① 바깥에서 $NEW 확인(터널 없이)"
code=$(command curl -s -o /dev/null -w "%{http_code} %{ssl_verify_result}" --max-time 15 "$NEW/api/v1/health" || true)
if [ "$code" != "200 0" ]; then
  echo "❌ 바깥 HTTPS 가 안 열림($code) — 회사 게이트웨이가 46443 을 서버 443 으로 넘겨야 한다(R89). 전환하지 않는다."; exit 2
fi
echo "✓ 바깥 HTTPS 200, 인증서 정상"
command curl -s --max-time 15 "$NEW/api/v1/health"; echo
[ "${1:-}" = "--check" ] && { echo "(--check 라 여기서 끝)"; exit 0; }

echo "== ② GCP 쓰기 멈춤(엔진·MCP·정기 작업)"
"${G[@]}" 'set -e; sudo systemctl stop powerdeck-worker powermcp; sudo crontab -u www-data -l > ~/www-data.cron.saved 2>/dev/null || true; sudo crontab -u www-data -r 2>/dev/null || true
  echo "GCP 엔진 $(systemctl is-active powerdeck-worker) · MCP $(systemctl is-active powermcp) · 크론 저장 $(grep -vc "^#" ~/www-data.cron.saved)줄"
  sudo mysql -N pp_platform -e "SELECT COUNT(*) FROM deck_jobs WHERE status=\"running\""'

echo "== ③ 회사 서버로 마지막 복사(DB 덮어씀 + 바뀐 파일)"
"${C[@]}" 'set -e; ~/db-from-gcp.sh; ~/sync-from-gcp.sh | tail -2'

echo "== ④ 회사 서버 엔진·정기 작업 켬"
"${C[@]}" 'set -e; sudo crontab -u www-data ~/www-data.cron.saved; sudo systemctl enable --now powerdeck-worker >/dev/null 2>&1; sudo systemctl restart powermcp
  echo "회사 엔진 $(systemctl is-active powerdeck-worker) · MCP $(systemctl is-active powermcp) · 크론 $(sudo crontab -u www-data -l | grep -vc "^#")줄"'

echo "== ⑤ GCP 를 회사 서버로 넘기는 중계로"
"${G[@]}" 'set -e; sudo a2enmod proxy proxy_http ssl headers >/dev/null
sudo tee /etc/apache2/sites-available/powerplus-proxy.conf >/dev/null <<EOF
# 2026-10 회사 서버 이관 — powerplus.hom2box.com 은 회사 서버(powerplus.solideos.com:46443)로 그대로 전달한다(2주 보관 뒤 정리)
<VirtualHost *:443>
    ServerName powerplus.hom2box.com
    SSLEngine on
    SSLProxyEngine on
    SSLCertificateFile /etc/letsencrypt/live/powerplus.hom2box.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/powerplus.hom2box.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
    ProxyPreserveHost Off
    ProxyTimeout 600
    ProxyPass        / https://powerplus.solideos.com:46443/
    ProxyPassReverse / https://powerplus.solideos.com:46443/
    <Location /mcp>
        SetEnv no-gzip 1
        SetEnv proxy-sendchunked 1
    </Location>
    ErrorLog \${APACHE_LOG_DIR}/powerplus-proxy-error.log
    CustomLog \${APACHE_LOG_DIR}/powerplus-proxy-access.log combined
</VirtualHost>
<VirtualHost *:80>
    ServerName powerplus.hom2box.com
    Redirect permanent / https://powerplus.hom2box.com/
</VirtualHost>
EOF
sudo a2dissite powerplus-le-ssl powerplus >/dev/null; sudo a2ensite powerplus-proxy >/dev/null; sudo apache2ctl configtest; sudo systemctl reload apache2; echo "GCP 중계 켬"'

echo "== ⑥ 확인"
fail=0
for u in "$NEW/" "$NEW/api/v1/health" "$NEW/mcp/health" "$NEW/mockref/api/health" "$NEW/addin/taskpane.html" "https://powerplus.hom2box.com/api/v1/health" "https://powerplus.hom2box.com/mcp/health" "https://powerplus.hom2box.com/addin/taskpane.html"; do
  c=$(command curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$u" || true)
  echo "$c $u"; [ "$c" = 200 ] || fail=1
done
command curl -s --max-time 20 "$NEW/api/v1/health" | grep -q '"db":true' || { echo "✗ 회사 서버 DB 연결 아님"; fail=1; }
if [ "$fail" = 1 ]; then
  echo "❌ 확인 실패 — GCP 로 되돌린다"
  "${G[@]}" 'set -e; sudo a2dissite powerplus-proxy >/dev/null; sudo a2ensite powerplus-le-ssl powerplus >/dev/null; sudo apache2ctl configtest && sudo systemctl reload apache2
    sudo crontab -u www-data ~/www-data.cron.saved; sudo systemctl start powerdeck-worker powermcp; echo "GCP 되돌림 — 엔진 $(systemctl is-active powerdeck-worker) MCP $(systemctl is-active powermcp)"'
  "${C[@]}" 'sudo systemctl stop powerdeck-worker; sudo systemctl disable powerdeck-worker >/dev/null 2>&1; sudo crontab -u www-data -r 2>/dev/null || true; echo "회사 서버 엔진·크론 다시 멈춤"'
  exit 3
fi
echo "✅ 전환 끝 — 다음: PP_TARGET 기본값을 company 로(scripts/deploy-target.sh), 2주 뒤 GCP 정리, sudo 권한 줄이기"
