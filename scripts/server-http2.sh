#!/usr/bin/env bash
# 서버에서 한 번(사용자 승인 뒤): HTTP/1.1 → HTTP/2. 첫 화면이 JS 70개를 6갈래로 받아 4~6초 걸리던 것(2026-10-17 점검)을 한 연결로.
#   HTTP/2 는 prefork(mod_php) 에서 안 돼 mpm_event + php-fpm 으로 바꾼다. 같은 서버의 hom2box.com 도 함께 바뀐다.
#   FPM: memory_limit 256M(mod_php 와 같게), 동시 처리 5 → 30(엔진 AI 호출이 최대 320초 붙잡는다).
#   검사 하나라도 실패하면 스스로 되돌린다. 설정 백업: /tmp/20261017-h2.tgz·*.bak-20261017-h2
#   실행: scp scripts/server-http2.sh 서버:/tmp/ && ssh 서버 bash /tmp/server-http2.sh
