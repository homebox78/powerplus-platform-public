#!/usr/bin/env bash
# 회사 서버(powerplus.solideos.com) 동시 사용 대비 설정 — 2026-10-20 적용한 것을 다시 만들 수 있게 남긴다(여러 번 돌려도 같다).
#   ① DB 메모리 innodb_buffer_pool 128M → 4G(DB 전체 약 2.3GB 가 메모리에)
#   ② 웹 서버 prefork+mod_php → event+PHP-FPM(일꾼 60) + HTTP/2 (GCP 때 scripts/server-http2.sh 와 같은 전환)
#   엔진 동시 작업(slots 6 · heavy_slots 3)은 서버 ~/powerDeck/worker/config.json — 배포가 덮지 않는다.
#   실행: scp -P 4622 scripts/server-company-tune.sh 서버:/tmp/ && ssh -p 4622 서버 bash /tmp/server-company-tune.sh
#   검사 하나라도 실패하면 웹 서버를 옛 방식으로 되돌린다. 설정 백업: ~/conf-bak-<시각>.tgz
set -u
B=https://powerplus.solideos.com:46443
TS=$(date +%Y%m%d-%H%M)
sudo tar czf ~/conf-bak-$TS.tgz /etc/apache2 /etc/php /etc/mysql 2>/dev/null

# ① DB
if ! sudo test -f /etc/mysql/mariadb.conf.d/60-powerplus.cnf; then
  printf "# 2026-10-20 동시 사용 대비 — DB 전체가 메모리에 올라가게\n[mysqld]\ninnodb_buffer_pool_size = 4G\n" | sudo tee /etc/mysql/mariadb.conf.d/60-powerplus.cnf >/dev/null
  sudo systemctl restart mariadb
fi

# ② PHP-FPM — mod_php 와 같은 설정(우리 ini 2개)을 FPM 에도
rollback() {
  echo "!! 되돌림: $1"
  sudo a2disconf -q php8.5-fpm powerplus-fpm zz-http2 >/dev/null 2>&1; sudo a2dismod -q http2 mpm_event >/dev/null 2>&1
  sudo a2enmod -q mpm_prefork php8.5 >/dev/null 2>&1
  sudo systemctl restart apache2
  exit 1
}
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q php8.5-fpm >/dev/null || { echo "php8.5-fpm 설치 실패"; exit 1; }
sudo cp /etc/php/8.5/apache2/conf.d/98-pcre.ini /etc/php/8.5/apache2/conf.d/99-powerplus.ini /etc/php/8.5/fpm/conf.d/
sudo sed -i -E "s/^pm\.max_children = .*/pm.max_children = 60/; s/^pm\.start_servers = .*/pm.start_servers = 10/; s/^pm\.min_spare_servers = .*/pm.min_spare_servers = 5/; s/^pm\.max_spare_servers = .*/pm.max_spare_servers = 20/; s/^;?pm\.max_requests = .*/pm.max_requests = 1000/" /etc/php/8.5/fpm/pool.d/www.conf
sudo php-fpm8.5 -t 2>&1 | tail -1 | grep -q successful || { echo "fpm 설정 검사 실패"; exit 1; }
sudo systemctl enable php8.5-fpm >/dev/null 2>&1
sudo systemctl restart php8.5-fpm   # 설치 때 이미 떠 있으면 바꾼 일꾼 수를 안 읽는다 — 꼭 다시 띄운다

# 로그인 토큰(Authorization)을 FPM 으로 넘긴다. CGIPassAuth 는 서버 전역 설정에 못 쓴다 — 쓰면 apache 가 안 뜬다(R92)
sudo tee /etc/apache2/conf-available/powerplus-fpm.conf >/dev/null <<'EOF'
# 2026-10-20 웹 서버 방식 전환(prefork+mod_php → event+PHP-FPM) — 동시 사용 대비
SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1
# PHP 최대 실행 600초(99-powerplus.ini)보다 길게 — AI 호출 대기
ProxyTimeout 620
EOF
echo "Protocols h2 http/1.1" | sudo tee /etc/apache2/conf-available/zz-http2.conf >/dev/null
{ sudo a2dismod -q php8.5 mpm_prefork >/dev/null && sudo a2enmod -q mpm_event proxy_fcgi setenvif http2 >/dev/null && sudo a2enconf -q php8.5-fpm powerplus-fpm zz-http2 >/dev/null; } || rollback "모듈 전환"
sudo apache2ctl configtest 2>&1 | grep -q "Syntax OK" || rollback "apache 설정 검사"   # 검사를 통과한 뒤에만 재시작
sudo systemctl restart apache2 || rollback "apache 재시작"
sleep 2
for u in / /api/v1/health /mcp/health /mockref/api/health /addin/taskpane.html; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$B$u"); [ "$c" = 200 ] || rollback "$u → $c"
done
curl -s --max-time 20 "$B/api/v1/health" | grep -q '"db":true' || rollback "health db"
echo "완료: $(apache2ctl -M 2>/dev/null | grep -o -E 'mpm_[a-z]+|http2_module|proxy_fcgi_module' | tr '\n' ' ') · HTTP $(curl -s -o /dev/null -w '%{http_version}' --http2 $B/) · 버퍼풀 $(sudo mysql -N -e 'SELECT @@innodb_buffer_pool_size/1073741824')GB · FPM 일꾼 $(pgrep -fc 'php-fpm: pool www')"
echo "토큰 전달은 따로 확인: 키로 /api/v1/me 와 가짜 토큰 /api/v1/me 응답이 달라야 한다."
