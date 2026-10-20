#!/usr/bin/env bash
# 배포 대상 서버 고르기 — 배포 스크립트 4개(deploy·deploy-mockref·deploy-mcp·deploy-engine)가 맨 앞에서 source 한다.
#   PP_TARGET=company (기본) powerplus.solideos.com:46443 — 회사 서버(2026-10-20 09:57 전환), solideos, SSH 4622(사무실 IP 만), 키 ~/.ssh/pp_company_ed25519
#   (2026-10-20 갈래: 개인 GCP 는 홈박스 저장소 D:\homebox-platform 이 맡는다 — 이 저장소에서는 배포 대상이 아니다)
# 내보내는 값: HOST · SSH_PORT · KEY_SRC · PUBLIC(https 주소, 포트 포함) · SSH_OPTS(배열) · ENGINE_HOME(엔진 계정 홈)
PP_TARGET="${PP_TARGET:-company}"
case "$PP_TARGET" in
  company)
    HOST="solideos@powerplus.solideos.com"; SSH_PORT=4622; PUBLIC="https://powerplus.solideos.com:46443"; ENGINE_HOME=/home/solideos
    KEY_SRC="${PP_SSH_KEY:-$HOME/.ssh/pp_company_ed25519}"
    ;;
  *) echo "❌ 파워플러스 배포 대상은 company 하나(개인 GCP 는 D:\homebox-platform)"; exit 1;;
esac
[ -f "$KEY_SRC" ] || { echo "❌ SSH 키를 찾지 못함($PP_TARGET) — PP_SSH_KEY=/path/key"; exit 1; }
SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
SCP_OPTS=(-P "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
echo "배포 대상: $PP_TARGET → $PUBLIC"

# 회사 게이트웨이가 46443 을 평문 80 으로 넘기던 동안(2026-10-19, R89) 쓰던 SSH 터널 검사. 10-20 매핑 수정(46443→46443) 뒤로는 끔 — 바깥 주소로 직접 검사.
# 매핑이 다시 어긋나면 PP_TUNNEL=1 로 켠다.
if [ "$PP_TARGET" = company ] && [ "${PP_TUNNEL:-0}" = 1 ]; then
  TUN_PORT=46443
  if ! (exec 3<>/dev/tcp/127.0.0.1/$TUN_PORT) 2>/dev/null; then
    ssh -i "$KEY_SRC" -p "$SSH_PORT" -o BatchMode=yes -o ExitOnForwardFailure=yes -fN -L $TUN_PORT:127.0.0.1:46443 "$HOST" && echo "터널 열림(127.0.0.1:$TUN_PORT → 서버 46443)"
  fi
  curl() { command curl --resolve "powerplus.solideos.com:46443:127.0.0.1" "$@"; }
  export -f curl 2>/dev/null || true
fi
