#!/usr/bin/env bash
# powerDeck 엔진 코드(engine/)를 서버 ~/powerDeck/worker 에 올리고 다시 띄운다.
# - config.json·.venv 는 서버 것을 그대로 둔다. fonts 는 목록·지원율 표만 덮고 서체 파일은 서버에 없는 것만 더한다(R82)
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
"$PY" tests/test_wire_kinds.py || { echo "와이어 종류 시험 실패 — 배포 중단(R62)"; exit 3; }
"$PY" -X utf8 tests/test_datafacts.py || { echo "자료 데이터·와이어 다양성·시안 일치 시험 실패 — 배포 중단(R64~R66)"; exit 3; }
"$PY" -X utf8 tests/test_merge_pptx.py || { echo "리눅스 합치기(차트·SmartArt·표·그림) 시험 실패 — 배포 중단(R79)"; exit 3; }
"$PY" -X utf8 tests/test_fontlang.py || { echo "언어별 서체(판단·글자 검사·lang 속성·서체 동봉) 시험 실패 — 배포 중단(R82)"; exit 3; }
"$PY" -X utf8 tests/test_resume.py >/dev/null 2>&1 || { "$PY" -X utf8 tests/test_resume.py | grep -E "^(통과|실패)"; echo "이어 만들기(기획·엔진 하나·세로 제안서·견본 복제·합치기 실패 글) 시험 실패 — 배포 중단(R81)"; exit 3; }
FILES=$(ls *.py *.md *.sh *.ps1 *.bat config.example.json 2>/dev/null | grep -v '^README.md$')
FILES="$FILES known_errors.json wire_kinds.json pipeline skill templates"   # wire_kinds.json = 와이어 상자 종류 한 벌(2026-10-18, wirekinds.py 가 읽는다)   # 기본 규칙 원천 · 초안 다듬기 도구·si-deck 스킬 사본(2026-10-12) · 세로 제안서 기본 양식(2026-10-14)

if [ "${FORCE:-0}" != "1" ]; then
  busy=$("${SSH[@]}" "sudo mysql -N pp_platform -e \"SELECT COUNT(*) FROM deck_jobs WHERE status='running' AND deleted_at IS NULL\"")
  if [ "${busy:-0}" != "0" ]; then echo "도는 작업 ${busy}건 — 끝난 뒤 다시(FORCE=1 이면 무시)"; exit 2; fi
fi

TS=$(date +%Y%m%d-%H%M%S)
# 서체(R82, 2026-10-18 언어별 서체) — 서체 파일은 저장소에 두지 않는다(크다, engine/fonts 는 .gitignore). 목록·지원율 표·PowerPoint 글줄 수치표(fonts.json·font_cover.json·ppt_metrics.json)는 저장소에 있고 늘 올린다.
# 서체 파일은 서버에 없는 것만 올린다(서버에 손으로 맞춘 파일은 덮지 않는다). 목록에 적힌 파일이 이 PC 에 없으면 배포하지 않는다 — 서버에도 없으면 그 서체를 고른 작업이 깨진다.
NEED=$("$PY" -c 'import json;d=json.load(open("fonts/fonts.json",encoding="utf-8"));print(" ".join(sorted({t["file"] for t in d["title"]}|{f for b in d["body"] for f in b.get("files") or []})))')
for f in $NEED; do [ -f "fonts/$f" ] || { echo "fonts.json 의 서체 파일 engine/fonts/$f 가 이 PC 에 없음 — 받아 두고 다시(R82)"; exit 5; }; done
SRVF=$("${SSH[@]}" 'ls -1 ~/powerDeck/worker/fonts ~/powerDeck/worker/fonts/licenses 2>/dev/null')
NEWF=""
for f in $(cd fonts && ls *.ttf *.otf 2>/dev/null) $(cd fonts && ls licenses/*.txt licenses/*.pdf 2>/dev/null); do echo "$SRVF" | grep -qxF "$(basename "$f")" || NEWF="$NEWF $f"; done
[ -n "$NEWF" ] && echo "서버에 없는 서체·라이선스 올림:$NEWF"
(cd fonts && tar -cf - fonts.json font_cover.json ppt_metrics.json $NEWF) | "${SSH[@]}" "set -e; d=~/powerDeck/worker/fonts; mkdir -p \$d/licenses; [ -f \$d/fonts.json ] && cp \$d/fonts.json \$d/fonts.json.bak-$TS; tar -xf - -C \$d; ls -1t \$d/fonts.json.bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f
  for f in $NEED; do [ -f \$d/\$f ] || { echo \"서버에 서체 파일 없음: \$f\"; exit 5; }; done"
# 언어별 대신 그리기(fontconfig) — lang=ja → Noto Sans JP·CJK JP, zh-cn → SC(그전엔 WenQuanYi 가 먼저 나왔다). 엔진 서비스 사용자의 conf.d 에
"${SSH[@]}" "mkdir -p ~/.config/fontconfig/conf.d && cat > ~/.config/fontconfig/conf.d/65-powerdeck-lang.conf" < "$ROOT/scripts/fontconfig/65-powerdeck-lang.conf"
tar -cf - $FILES | "${SSH[@]}" "set -e; rm -rf /tmp/pd-eng && mkdir -p /tmp/pd-eng && tar -xf - -C /tmp/pd-eng
  ~/powerDeck/worker/.venv/bin/python -c 'import ast,glob; [ast.parse(open(f,encoding=\"utf-8\").read(),f) for f in glob.glob(\"/tmp/pd-eng/**/*.py\", recursive=True)]'   # 문법만 — .pyc 를 남기지 않는다
  cd ~/powerDeck && tar -czf worker-bak-$TS.tgz --exclude=.venv --exclude=fonts --exclude=__pycache__ worker
  ls -1t worker-bak-*.tgz | tail -n +11 | xargs -r rm -f   # 백업은 최근 10개만(2026-10-16 정리 때 94개 415MB 쌓여 있었다)
  rm -rf ~/powerDeck/worker/pipeline ~/powerDeck/worker/skill && cp -r /tmp/pd-eng/* ~/powerDeck/worker/ && rm -rf /tmp/pd-eng ~/powerDeck/worker/__pycache__
  sudo systemctl restart powerdeck-worker && sleep 3 && systemctl is-active powerdeck-worker
  journalctl -u powerdeck-worker -n 5 --no-pager | tail -5"
# 언어 대신 그리기 확인 — 워커가 시작하며 서체를 깔고 fc-cache 를 돈 뒤(재시작 3초 뒤라 한 번 더 돌린다)
"${SSH[@]}" 'fc-cache -f >/dev/null 2>&1; echo "fc-match lang=ja → $(fc-match sans:lang=ja) / lang=zh-cn → $(fc-match sans:lang=zh-cn)"'
"${SSH[@]}" 'fc-match sans:lang=ja | grep -qi "Noto Sans.*JP" && fc-match sans:lang=zh-cn | grep -qi "Noto Sans.*SC"' || { echo "⚠️ 서버 fontconfig 가 일본어·중국어에 Noto 를 먼저 쓰지 않는다 — ~/.config/fontconfig/conf.d/65-powerdeck-lang.conf 확인(R82)"; exit 6; }
# 디자인 지침(engine/reference-guide) → ~/powerDeck/reference/guide (design.py 가 기획·시안 때 읽는다)
(cd "$ROOT/engine/reference-guide" && tar -cf - *.md) | "${SSH[@]}" "mkdir -p ~/powerDeck/reference/guide && tar -xf - -C ~/powerDeck/reference/guide"
# 참조 폴더 확인(R24, 2026-10-14) — 서버 이전 때 guide(10-12)·styles·front(10-14)가 빠져, 디자인 타입·표지 템플릿 규칙 없이 기본값으로 돌았다.
# 빠졌으면 이 PC 의 D:\powerDeck\reference 에서 올리고 scripts/reference-push.sh 로 묶음을 다시 만든다(그림 데이터라 저장소에 두지 않는다)
miss=$("${SSH[@]}" 'r=~/powerDeck/reference; for f in styles/styles.json front/templates.json guide/학습-표지목차간지.md mockups/표지템플릿; do [ -e "$r/$f" ] || echo "$f"; done')
if [ -n "$miss" ]; then echo "⚠️ 서버 엔진 참조 폴더에 없음: $miss — 디자인 타입·표지 규칙이 빠진 채로 돈다"; exit 4; fi
echo "엔진 배포 완료 (백업 worker-bak-$TS.tgz)"
