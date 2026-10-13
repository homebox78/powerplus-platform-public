#!/usr/bin/env bash
# 2026-10-07 옛 서비스(/powerPlus·/homebox)를 내리기 전에, 플랫폼이 쓰는 것만 플랫폼 안으로 옮긴다(서버에서 sudo 로 한 번).
#   1) 옛 홈박스 DB homebox → pp_mockref (표 이름 바꾸기, 사용자 homebox → pp_mockref 같은 비밀번호)
#   2) 옛 홈박스 storage → /var/www/platform_data/mockref (같은 디스크라 mv)
#   3) 레퍼런스 엔진 설정 /var/www/platform_conf/mockref.php (옛 config 에서 app.secret 등 보존)
#   4) 옛 powerPlus uploads → /var/www/platform_data/legacy-powerplus/uploads (복사, 이미 있는 것은 그대로)
#   5) legacy-homebox/homebox-public → mockref/homebox-public (링크)
# 멱등: 이미 옮긴 단계는 건너뛴다. 백업은 미리 받아 둘 것(<백업 폴더>).
set -euo pipefail
D=/var/www/platform_data
C=/var/www/platform_conf
OLD_HB=/var/www/html/homebox
OLD_PP=/var/www/html/powerPlus

echo "[1] DB"
if mariadb -N -e "SHOW DATABASES LIKE 'homebox'" | grep -q homebox; then
  mariadb -e "CREATE DATABASE IF NOT EXISTS pp_mockref CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  T=$(mariadb -N -e "SELECT GROUP_CONCAT(CONCAT('homebox.\`',table_name,'\` TO pp_mockref.\`',table_name,'\`') SEPARATOR ', ') FROM information_schema.tables WHERE table_schema='homebox'")
  [ -n "$T" ] && [ "$T" != "NULL" ] && mariadb -e "SET FOREIGN_KEY_CHECKS=0; RENAME TABLE $T"
  n=$(mariadb -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='homebox'")
  [ "$n" = 0 ] || { echo "✗ homebox 에 표가 남음 $n"; exit 1; }
  mariadb -e "DROP DATABASE homebox"
fi
if mariadb -N -e "SELECT 1 FROM mysql.user WHERE user='homebox'" | grep -q 1; then
  mariadb -e "RENAME USER 'homebox'@'localhost' TO 'pp_mockref'@'localhost'"
fi
mariadb -e "REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'pp_mockref'@'localhost'; GRANT ALL PRIVILEGES ON pp_mockref.* TO 'pp_mockref'@'localhost'; FLUSH PRIVILEGES"
echo "  pp_mockref 표 $(mariadb -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='pp_mockref'")"

echo "[2] storage"
if [ -d "$OLD_HB/storage" ] && [ ! -e "$D/mockref" ]; then
  mv "$OLD_HB/storage" "$D/mockref"
fi
chown -R www-data:www-data "$D/mockref"; chmod 2775 "$D/mockref"
du -sh "$D/mockref"

echo "[3] 설정"
if [ ! -f "$C/mockref.php" ]; then
  [ -f "$OLD_HB/api/config.php" ] || { echo "✗ 옛 홈박스 설정 없음"; exit 1; }
  php -r '
$c = require "/var/www/html/homebox/api/config.php";
$c["app"]["debug"] = false;
$c["app"]["base"] = "/mockref/";
$c["app"]["public_base"] = "https://powerplus.hom2box.com/mockref";
$c["app"]["kit_css"] = "https://powerplus.hom2box.com/kit-files/kit.css";
$c["storage"]["dir"] = "/var/www/platform_data/mockref";
$c["db"]["dsn"] = "mysql:host=127.0.0.1;port=3306;dbname=pp_mockref;charset=utf8mb4";
$c["db"]["user"] = "pp_mockref";
$c["session"]["secure"] = true;
file_put_contents("/var/www/platform_conf/mockref.php", "<?php\n// 서버 전용 — 레퍼런스 엔진(services/mockref-api) 설정. scripts/migrate-legacy-server.sh 가 옛 홈박스 설정에서 만들었다.\nreturn " . var_export($c, true) . ";\n");
'
fi
chown root:www-data "$C/mockref.php"; chmod 640 "$C/mockref.php"

echo "[4] powerPlus uploads"
mkdir -p "$D/legacy-powerplus"
if [ -d "$OLD_PP/uploads" ]; then
  cp -an "$OLD_PP/uploads" "$D/legacy-powerplus/"
fi
chown -R www-data:www-data "$D/legacy-powerplus"
du -sh "$D/legacy-powerplus"

echo "[5] 샘플 링크"
if [ -d "$D/legacy-homebox/homebox-public" ] && [ ! -L "$D/legacy-homebox/homebox-public" ]; then
  mv "$D/legacy-homebox/homebox-public" "$D/legacy-homebox/homebox-public.cache-old"
fi
mkdir -p "$D/legacy-homebox"
[ -L "$D/legacy-homebox/homebox-public" ] || ln -s "$D/mockref/homebox-public" "$D/legacy-homebox/homebox-public"

echo "[6] 파일 빠짐 점검"
mariadb -N pp_platform -e "SELECT CONCAT(bucket,'/',path) FROM core_files WHERE bucket IN ('legacy-powerplus','legacy-homebox')" > /tmp/pp_files.txt
miss=0; while read -r p; do [ -f "$D/$p" ] || { miss=$((miss+1)); [ $miss -le 5 ] && echo "  없음 $p"; }; done < /tmp/pp_files.txt
echo "  전체 $(wc -l < /tmp/pp_files.txt) · 없음 $miss"
rm -f /tmp/pp_files.txt
echo "완료"
