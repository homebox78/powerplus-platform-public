#!/usr/bin/env bash
# powerDeck 변환 엔진 — 리눅스(Ubuntu 24.04+) 준비. PowerPoint 없이 python-pptx + LibreOffice 로 돈다.
#   bash worker/setup_linux.sh            패키지·파이썬 환경·서체·점검
#   bash worker/setup_linux.sh --service  위 + systemd 서비스(부팅 때 자동 시작, 멈추면 다시 시작)
# 회사 서체 a시월구일1~4 는 저장소에 없다 — 서체 파일(.ttf)을 worker/fonts/private/ 에 두면 함께 설치한다(없으면 Asta Sans 로 대신).
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
VENV="$HERE/.venv"

echo "== 1) 패키지 (sudo)"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  python3 python3-venv python3-pip \
  libreoffice-impress libreoffice-core poppler-utils fontconfig \
  fonts-noto-cjk fonts-nanum fonts-liberation2 fonts-crosextra-carlito fonts-crosextra-caladea \
  curl ca-certificates locales
sudo locale-gen ko_KR.UTF-8 >/dev/null || true

echo "== 2) 파이썬 환경 ($VENV)"
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q python-pptx lxml pillow pypdf python-docx openpyxl olefile
# 회사소개서(company.py) 렌더 — 헤드리스 크로미움. 판은 powerMCP(playwright-core 1.63)와 맞춰 브라우저 파일(~/.cache/ms-playwright)을 함께 쓴다
"$VENV/bin/pip" install -q "playwright==1.63.0"
"$VENV/bin/python" -m playwright install chromium-headless-shell

echo "== 3) 서체 (~/.local/share/fonts/powerdeck + fontconfig 별칭)"
if ls "$HERE"/fonts/private/*.[ot]tf >/dev/null 2>&1; then
  mkdir -p ~/.local/share/fonts/powerdeck
  cp -n "$HERE"/fonts/private/*.[ot]tf ~/.local/share/fonts/powerdeck/
fi
"$VENV/bin/python" fonts_install.py

echo "== 4) AI 연결"
echo "   모든 AI(장표 제작·기획·대본·시안 그림)는 서버 → 회사 OpenRouter 키 하나로 — 이 서버에는 AI 키·로그인이 필요 없다(worker_key 만)."
echo "   예전 방식(Claude Code 구독)이 필요하면 config.json 에 \"ai\": \"claude\" 를 넣고 Claude Code 를 따로 설치한다."

echo "== 5) 설정"
if [ ! -f config.json ]; then
  sed -e "s#\"python\": \"[^\"]*\"#\"python\": \"$VENV/bin/python\"#" \
      -e "s#\"jobs_dir\": \"[^\"]*\"#\"jobs_dir\": \"$HOME/powerDeck-jobs\"#" \
      -e "s#\"pipeline_dir\": \"[^\"]*\"#\"pipeline_dir\": \"\"#" \
      -e "s#\"skill_dir\": \"[^\"]*\"#\"skill_dir\": \"\"#" \
      -e "s#\"name\": \"[^\"]*\"#\"name\": \"$(hostname)\"#" config.example.json > config.json
  echo "   config.json 을 만들었습니다 — worker_key 를 채워 주세요."
fi
mkdir -p "$HOME/powerDeck-jobs"

echo "== 6) 점검"
"$VENV/bin/python" - <<'PY'
import osdep, fontset, shutil
print("  soffice:", osdep.soffice())
print("  pdftoppm:", shutil.which("pdftoppm"))
print("  서체:", len(fontset.INSTALLED), "개 · 본문", fontset.NAME, "(a시월구일 있음)" if fontset.HAS_SIWOL else "(a시월구일 없음 → Asta Sans)")
for f in ("G마켓 산스 TTF Bold", "Pretendard SemiBold", "Asta Sans Medium", "맑은 고딕"):
    print("   ", f, "→", fontset.INSTALLED.get(f.lower()) or "(fontconfig 대체)")
PY

if [ "${1:-}" = "--service" ]; then
  echo "== 7) systemd 서비스"
  sudo tee /etc/systemd/system/powerdeck-worker.service >/dev/null <<UNIT
[Unit]
Description=powerDeck 변환 엔진
After=network-online.target
Wants=network-online.target

[Service]
User=$(id -un)
WorkingDirectory=$HERE
Environment=LANG=C.UTF-8 PYTHONIOENCODING=utf-8 PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$VENV/bin/python $HERE/worker.py
Restart=always
RestartSec=10
KillMode=control-group

[Install]
WantedBy=multi-user.target
UNIT
  sudo systemctl daemon-reload
  sudo systemctl enable --now powerdeck-worker
  echo "   상태: systemctl status powerdeck-worker · 기록: journalctl -u powerdeck-worker -f"
fi
echo "끝."
