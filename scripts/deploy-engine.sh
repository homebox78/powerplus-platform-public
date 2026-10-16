#!/usr/bin/env bash
# powerDeck 엔진 코드(engine/)를 서버 ~/powerDeck/worker 에 올리고 다시 띄운다.
# - config.json·fonts·.venv 는 서버 것을 그대로 둔다(덮지 않는다)
# - 지금 도는 작업이 있으면 멈춘다(재시작하면 그 작업이 끊긴다) — FORCE=1 로 무시
# - 올리기 전 서버 python 으로 문법 검사, 옛 코드는 ~/powerDeck/worker-bak-<시각>.tgz
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/preflight.sh" engine || exit 1   # 배포 전 자가 검사
KEY_SRC="${PP_SSH_KEY:-}"
for k in "$HOME/google_key.pem"; do [ -n "$KEY_SRC" ] && break; [ -f "$k" ] && KEY_SRC="$k"; done
[ -f "$KEY_SRC" ] || { echo "SSH 키 없음 — PP_SSH_KEY=/path/google_key.pem"; exit 1; }
KEY=$(mktemp); cp "$KEY_SRC" "$KEY"; chmod 600 "$KEY"; trap 'rm -f "$KEY"' EXIT
HOST="${PP_HOST:?PP_HOST=user@host 필요}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")

cd "$ROOT/engine"
# 한 번 나온 오류의 회귀 시험(known_errors.json) — 하나라도 실패하면 올리지 않는다
PY=$(command -v python3 || command -v python)
"$PY" tests/test_known.py || { echo "회귀 시험 실패 — 배포 중단"; exit 3; }
FILES=$(ls *.py *.md *.sh *.ps1 *.bat config.example.json 2>/dev/null | grep -v '^README.md$')
FILES="$FILES known_errors.json pipeline skill templates"   # 기본 규칙 원천 · 초안 다듬기 도구·si-deck 스킬 사본(2026-10-12) · 세로 제안서 기본 양식(2026-10-14)

if [ "${FORCE:-0}" != "1" ]; then
  busy=$("${SSH[@]}" "sudo mysql -N pp_platform -e \"SELECT COUNT(*) FROM deck_jobs WHERE status='running' AND deleted_at IS NULL\"")
  if [ "${busy:-0}" != "0" ]; then echo "도는 작업 ${busy}건 — 끝난 뒤 다시(FORCE=1 이면 무시)"; exit 2; fi
fi

TS=$(date +%Y%m%d-%H%M%S)
tar -cf - $FILES | "${SSH[@]}" "set -e; rm -rf /tmp/pd-eng && mkdir -p /tmp/pd-eng && tar -xf - -C /tmp/pd-eng
  ~/powerDeck/worker/.venv/bin/python -c 'import ast,glob; [ast.parse(open(f,encoding=\"utf-8\").read(),f) for f in glob.glob(\"/tmp/pd-eng/**/*.py\", recursive=True)]'   # 문법만 — .pyc 를 남기지 않는다
  cd ~/powerDeck && tar -czf worker-bak-$TS.tgz --exclude=.venv --exclude=fonts --exclude=__pycache__ worker
  ls -1t worker-bak-*.tgz | tail -n +11 | xargs -r rm -f   # 백업은 최근 10개만(2026-10-16 정리 때 94개 415MB 쌓여 있었다)
  rm -rf ~/powerDeck/worker/pipeline ~/powerDeck/worker/skill && cp -r /tmp/pd-eng/* ~/powerDeck/worker/ && rm -rf /tmp/pd-eng ~/powerDeck/worker/__pycache__
  sudo systemctl restart powerdeck-worker && sleep 3 && systemctl is-active powerdeck-worker
  journalctl -u powerdeck-worker -n 5 --no-pager | tail -5"
# 디자인 지침(engine/reference-guide) → ~/powerDeck/reference/guide (design.py 가 기획·시안 때 읽는다)
(cd "$ROOT/engine/reference-guide" && tar -cf - *.md) | "${SSH[@]}" "mkdir -p ~/powerDeck/reference/guide && tar -xf - -C ~/powerDeck/reference/guide"
# 참조 폴더 확인(R24, 2026-10-14) — 서버 이전 때 guide(10-12)·styles·front(10-14)가 빠져, 디자인 타입·표지 템플릿 규칙 없이 기본값으로 돌았다.
# 빠졌으면 이 PC 의 D:\powerDeck\reference 에서 올리고 scripts/reference-push.sh 로 묶음을 다시 만든다(그림 데이터라 저장소에 두지 않는다)
miss=$("${SSH[@]}" 'r=~/powerDeck/reference; for f in styles/styles.json front/templates.json guide/학습-표지목차간지.md mockups/표지템플릿; do [ -e "$r/$f" ] || echo "$f"; done')
if [ -n "$miss" ]; then echo "⚠️ 서버 엔진 참조 폴더에 없음: $miss — 디자인 타입·표지 규칙이 빠진 채로 돈다"; exit 4; fi
echo "엔진 배포 완료 (백업 worker-bak-$TS.tgz)"
