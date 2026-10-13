#!/usr/bin/env bash
# 장표 엔진 참조 그림 묶음(reference.zip)을 서버 플랫폼 데이터 폴더에 만든다.
# 엔진이 시작할 때 /api/v1/deck/worker/reference.info 로 묶음 크기·시각을 보고 다르면 받아 간다.
# 원천 = 서버 엔진 폴더 ~/powerDeck/reference (지금 도는 엔진이 쓰는 그림 그대로). guide/ 는 deploy-engine.sh 가 따로 올리므로 뺀다.
# 묶음 안 경로는 reference/… (worker.py ensure_reference 가 그 접두만 푼다).
set -euo pipefail
HOST="${PP_HOST:?PP_HOST=user@host 필요}"
KEY_SRC="${PP_SSH_KEY:-}"
for k in "$HOME/google_key.pem"; do [ -n "$KEY_SRC" ] && break; [ -f "$k" ] && KEY_SRC="$k"; done
[ -f "$KEY_SRC" ] || { echo "SSH 키 없음 — PP_SSH_KEY=/path/google_key.pem"; exit 1; }
KEY=$(mktemp); cp "$KEY_SRC" "$KEY"; chmod 600 "$KEY"; trap 'rm -f "$KEY"' EXIT
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
SRC=~/powerDeck
DST=/var/www/platform_data/deck
[ -d "$SRC/reference" ] || { echo "엔진 참조 폴더 없음: $SRC/reference"; exit 1; }
N=$(find "$SRC/reference" -type f ! -path '*/guide/*' \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | wc -l)
TMP=$(mktemp -d)
(cd "$SRC" && python3 - "$TMP/reference.zip" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:   # 그림은 이미 압축돼 있어 STORED
    for root, dirs, files in os.walk("reference"):
        dirs[:] = [d for d in dirs if d != "guide" and not d.startswith((".", "_"))]
        for f in sorted(files):
            if not f.startswith((".", "_")):
                z.write(os.path.join(root, f))
PY
)
sudo install -o www-data -g www-data -m 0644 "$TMP/reference.zip" "$DST/reference.zip"
rm -rf "$TMP"
echo "참조 그림 ${N}장 → $DST/reference.zip ($(du -h "$DST/reference.zip" | cut -f1))"
REMOTE
