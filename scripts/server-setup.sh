#!/usr/bin/env bash
# 플랫폼 서버 첫 설치(한 번만) — powerplus.hom2box.com (기획 §0 개발·사내 출시 주소)
#   SUPERADMIN_EMAIL=<계정> bash scripts/server-setup.sh
# 하는 일: ① DB pp_platform + 전용 계정(무작위 비밀번호) ② 파일 폴더 /var/www/platform_data(웹루트 밖)
#          ③ 서버 전용 api/config.php 를 /var/www/platform_conf/config.php 로 생성 — 메일(SMTP)은 옛 powerPlus 운영 설정에서 서버 안에서만 옮긴다.
# ⚠️ 서버의 DB `powerplus` 는 운영 중인 옛 파워플러스 애드인 DB 다. 새 플랫폼은 절대 그 이름을 쓰지 않는다.
# 시크릿은 출력하지 않는다. 이미 설치돼 있으면(설정 파일 존재) 아무것도 바꾸지 않는다.
set -euo pipefail
: "${SUPERADMIN_EMAIL:?SUPERADMIN_EMAIL 을 지정하세요(문서·코드에 적지 않는 값)}"
HOST="${PP_HOST:?PP_HOST=user@host 필요}"
KEY_SRC="${PP_SSH_KEY:-}"
for k in "$HOME/google_key.pem"; do [ -n "$KEY_SRC" ] && break; [ -f "$k" ] && KEY_SRC="$k"; done
[ -f "$KEY_SRC" ] || { echo "❌ SSH 키 없음 — PP_SSH_KEY 지정"; exit 1; }
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
KEY="$WORK/key.pem"; cp "$KEY_SRC" "$KEY"; chmod 600 "$KEY"

ssh -i "$KEY" -o BatchMode=yes "$HOST" "SUPERADMIN_EMAIL='$SUPERADMIN_EMAIL' bash -s" <<'EOF'
set -e
CONF=/var/www/platform_conf/config.php
if sudo test -f "$CONF"; then echo "이미 설치됨 — $CONF 있음, 변경 없음"; exit 0; fi
DBPASS="$(openssl rand -hex 24)"
SECRET="$(openssl rand -hex 24)"
WORKER="pp_worker_$(openssl rand -hex 20)"
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS pp_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'pp_platform'@'localhost' IDENTIFIED BY '$DBPASS';
  ALTER USER 'pp_platform'@'localhost' IDENTIFIED BY '$DBPASS';
  GRANT ALL PRIVILEGES ON pp_platform.* TO 'pp_platform'@'localhost'; FLUSH PRIVILEGES;"
sudo mkdir -p /var/www/platform_data /var/www/platform_conf
sudo chown -R www-data:www-data /var/www/platform_data
sudo chmod 2775 /var/www/platform_data
sudo usermod -aG www-data deploy >/dev/null 2>&1 || true
# 설정 파일: 값은 서버 안에서만 조립(옛 powerPlus 메일 설정을 읽어 옮김)
sudo DBPASS="$DBPASS" SECRET="$SECRET" WORKER="$WORKER" SUPER="$SUPERADMIN_EMAIL" php -r '
$old = @include "/var/www/html/powerPlus/config/config.php"; if (!is_array($old)) $old = [];
$c = [
 "app" => ["debug" => false, "url" => "https://powerplus.hom2box.com", "secret" => getenv("SECRET"), "version" => "0.1.0"],
 "db" => ["dsn" => "mysql:host=127.0.0.1;port=3306;dbname=pp_platform;charset=utf8mb4", "user" => "pp_platform", "pass" => getenv("DBPASS")],
 "session" => ["name" => "pp_sid", "secure" => true],
 "staff" => ["domains" => ["solideos.com"]],
 "superadmin" => ["email" => getenv("SUPER")],
 "auth" => ["debug_code" => false],
 "features" => ["billing_visible" => false],
 "oauth" => ["google" => ["id" => "", "secret" => ""], "naver" => ["id" => "", "secret" => ""], "kakao" => ["id" => "", "secret" => ""]],
 "smtp" => ["host" => $old["smtp_host"] ?? "", "port" => (int) ($old["smtp_port"] ?? 587), "user" => $old["smtp_user"] ?? "", "pass" => $old["smtp_pass"] ?? "",
            "from" => $old["mail_from"] ?? ($old["smtp_user"] ?? ""), "from_name" => "powerPlus"],
 "worker" => ["key" => getenv("WORKER")],
 "storage" => ["dir" => "/var/www/platform_data"],
 "openrouter" => ["key" => "", "daily_usd" => 1],
];
file_put_contents("/var/www/platform_conf/config.php", "<?php\n// 서버 전용 — git·배포 번들에 없다. scripts/server-setup.sh 가 만들었다.\nreturn " . var_export($c, true) . ";\n");
'
sudo chown root:www-data "$CONF"; sudo chmod 640 "$CONF"
echo "설치 완료 — DB pp_platform · 파일 /var/www/platform_data · 설정 $CONF (메일 $(sudo php -r '$c=require "/var/www/platform_conf/config.php"; echo $c["smtp"]["host"]!==""?"있음":"없음";'))"
EOF
