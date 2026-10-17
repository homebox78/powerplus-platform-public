#!/usr/bin/env bash
# 서버에서 한 번(사용자 승인 뒤): HTTP/1.1 → HTTP/2. 첫 화면이 JS 70개를 6갈래로 받아 4~6초 걸리던 것(2026-10-17 점검)을 한 연결로.
#   HTTP/2 는 prefork(mod_php) 에서 안 돼 mpm_event + php-fpm 으로 바꾼다. 같은 서버의 hom2box.com 도 함께 바뀐다.
#   FPM: memory_limit 256M(mod_php 와 같게), 동시 처리 5 → 30(엔진 AI 호출이 최대 320초 붙잡는다).
#   .htaccess 의 php_value 는 모두 <IfModule mod_php…> 안이라 FPM 에서는 무시된다(500 없음, 2026-10-17 확인).
#   검사 하나라도 실패하면 스스로 되돌린다. 설정 백업: /tmp/20261017-h2.tgz · *.bak-20261017-h2
#   실행: scp scripts/server-http2.sh 서버:/tmp/ && ssh 서버 bash /tmp/server-http2.sh
set -u
TS=20261017-h2
sudo tar czf /tmp/$TS.tgz /etc/apache2 /etc/php/8.4/fpm 2>/dev/null
sudo cp /etc/php/8.4/fpm/php.ini /etc/php/8.4/fpm/php.ini.bak-$TS
sudo cp /etc/php/8.4/fpm/pool.d/www.conf /etc/php/8.4/fpm/pool.d/www.conf.bak-$TS
rollback() {
  echo "!! 되돌림: $1"
  sudo a2disconf php8.4-fpm >/dev/null 2>&1; sudo a2dismod http2 mpm_event >/dev/null 2>&1
  sudo a2enmod mpm_prefork php8.4 >/dev/null 2>&1
  sudo cp /etc/php/8.4/fpm/php.ini.bak-$TS /etc/php/8.4/fpm/php.ini
  sudo cp /etc/php/8.4/fpm/pool.d/www.conf.bak-$TS /etc/php/8.4/fpm/pool.d/www.conf
  sudo rm -f /etc/apache2/conf-enabled/zz-http2.conf
  sudo systemctl restart php8.4-fpm; sudo systemctl restart apache2
  exit 1
}
sudo sed -i -E 's/^memory_limit = .*/memory_limit = 256M/' /etc/php/8.4/fpm/php.ini
sudo sed -i -E 's/^pm.max_children = .*/pm.max_children = 30/; s/^pm.start_servers = .*/pm.start_servers = 5/; s/^pm.min_spare_servers = .*/pm.min_spare_servers = 3/; s/^pm.max_spare_servers = .*/pm.max_spare_servers = 10/' /etc/php/8.4/fpm/pool.d/www.conf
sudo php-fpm8.4 -t 2>&1 | tail -1 | grep -q successful || rollback "fpm 설정 검사"
sudo systemctl restart php8.4-fpm || rollback "fpm 재시작"
{ sudo a2dismod php8.4 mpm_prefork >/dev/null && sudo a2enmod mpm_event proxy_fcgi setenvif http2 >/dev/null && sudo a2enconf php8.4-fpm >/dev/null; } || rollback "모듈 전환"
echo 'Protocols h2 http/1.1' | sudo tee /etc/apache2/conf-enabled/zz-http2.conf >/dev/null
sudo apache2ctl configtest 2>&1 | grep -q "Syntax OK" || rollback "apache 설정 검사"
sudo systemctl restart apache2 || rollback "apache 재시작"
sleep 2
for u in https://powerplus.hom2box.com/api/v1/health https://powerplus.hom2box.com/ https://hom2box.com/ https://powerplus.hom2box.com/mockref/api/health; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$u"); [ "$c" = 200 ] || rollback "$u → $c"
done
curl -s https://powerplus.hom2box.com/api/v1/health | grep -q '"db":true' || rollback "health db"
echo "전환 완료: $(apache2ctl -M 2>/dev/null | grep -o -E 'mpm_[a-z]+|http2_module|proxy_fcgi_module' | tr '\n' ' ') · 프로토콜 $(curl -s -o /dev/null -w '%{http_version}' --http2 https://powerplus.hom2box.com/)"
