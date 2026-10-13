<?php
// 옛 홈박스 작업물 보관함(/homebox/admin/works) 시안 → powerMock 갤러리(공유 상태)로 옮긴다. 서버에서 한 번 돌린다.
//   sudo php8.4 import-works-gallery.php --owner=<이메일> [--dry]
// 원천: /var/www/html/homebox/storage/works/_works.json(읽기만) · 그림·스타일은 /var/www/platform_data/works 로 미리 복사해 둔다
//       (시안 안 상대 주소를 /api/v1/files/works/... 절대 주소로 바꿔 넣으므로 그 경로에 파일이 있어야 한다).
// 멱등: token = 원본 경로의 md5 — 다시 돌리면 갱신만. 판정 기록이 없는 시안이라 score 0(화면은 '판정 전').
declare(strict_types=1);

$opt = getopt('', ['owner:', 'dry']);
$dry = isset($opt['dry']);
$SRC = '/var/www/platform_data/mockref/works'; // 2026-10-07 옛 홈박스 storage 를 플랫폼으로 옮김
$cfg = require '/var/www/platform_conf/config.php';
$STORE = rtrim($cfg['storage']['dir'], '/');
$BASE = 'https://powerplus.hom2box.com/api/v1/files/works/';
$pdo = new PDO($cfg['db']['dsn'], $cfg['db']['user'], $cfg['db']['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);

$st = $pdo->prepare('SELECT id FROM core_users WHERE email = ? AND deleted_at IS NULL');
$st->execute([strtolower(trim((string) ($opt['owner'] ?? '')))]);
$owner = $st->fetchColumn();
if (!$owner) { fwrite(STDERR, "--owner 계정 없음\n"); exit(1); }

$list = json_decode((string) file_get_contents("$SRC/_works.json"), true);
$ASSET = '/\.(png|jpe?g|webp|gif|svg|css|js|woff2?|ttf|mp4)(\?[^"\')\s]*)?$/i';
$abs = static function (string $dir, string $ref) use ($BASE, $ASSET): ?string {
    if ($ref === '' || preg_match('#^([a-z][a-z0-9+.-]*:|//|\#|/)#i', $ref) || !preg_match($ASSET, $ref)) return null;
    $q = ''; if (($i = strpos($ref, '?')) !== false) { $q = substr($ref, $i); $ref = substr($ref, 0, $i); }
    $parts = [];
    foreach (explode('/', ($dir === '.' ? '' : $dir . '/') . $ref) as $s) {
        if ($s === '' || $s === '.') continue;
        if ($s === '..') { array_pop($parts); continue; }
        $parts[] = rawurlencode(rawurldecode($s));
    }
    return $BASE . implode('/', $parts) . $q;
};

$thumbDir = "$STORE/mock/gallery";
if (!$dry && !is_dir($thumbDir)) mkdir($thumbDir, 0775, true);
$ins = $upd = $thumbs = $miss = 0;
foreach ($list['groups'] as $g) {
    foreach ($g['items'] as $it) {
        $file = "$SRC/{$it['path']}";
        if (!is_file($file)) { $miss++; continue; }
        $dir = dirname($it['path']);
        $html = (string) file_get_contents($file);
        $html = preg_replace_callback('/\b(src|href|poster)\s*=\s*(["\'])([^"\']*)\2/i', static function ($m) use ($abs, $dir) {
            $u = $abs($dir, html_entity_decode($m[3]));
            return $u === null ? $m[0] : "{$m[1]}={$m[2]}" . htmlspecialchars($u, ENT_QUOTES) . $m[2];
        }, $html);
        $html = preg_replace_callback('/\bsrcset\s*=\s*(["\'])([^"\']*)\1/i', static function ($m) use ($abs, $dir) {
            $out = array_map(static function ($c) use ($abs, $dir) { $c = trim($c); $sp = preg_split('/\s+/', $c, 2); $u = $abs($dir, $sp[0]); return ($u ?? $sp[0]) . (isset($sp[1]) ? ' ' . $sp[1] : ''); }, explode(',', $m[2]));
            return 'srcset=' . $m[1] . implode(', ', $out) . $m[1];
        }, $html);
        $html = preg_replace_callback('/url\(\s*(["\']?)([^"\')]+)\1\s*\)/i', static function ($m) use ($abs, $dir) {
            $u = $abs($dir, trim($m[2]));
            return $u === null ? $m[0] : "url('{$u}')";
        }, $html);

        $token = md5('works:' . $it['path']);
        $title = mb_substr(trim((string) ($it['title'] ?? '')) ?: (string) $it['name'], 0, 120);
        $device = preg_match('/(mobile|-m\.html|390)/i', $it['path']) ? 'mobile' : 'pc';
        $note = mb_substr((string) $g['label'], 0, 1000);
        $at = date('Y-m-d H:i:s', (int) ($it['mtime'] ?? time()));
        if ($dry) { $ins++; continue; }

        $ex = $pdo->prepare('SELECT id FROM mock_mockups WHERE token = ?'); $ex->execute([$token]); $mid = $ex->fetchColumn();
        if ($mid) {
            $pdo->prepare('UPDATE mock_mockups SET owner_user_id=?, visibility=\'public\', title=?, device=?, html=?, bytes=?, published_at=COALESCE(published_at, NOW(3)), deleted_at=NULL WHERE id=?')
                ->execute([$owner, $title, $device, $html, strlen($html), $mid]);
            $upd++;
        } else {
            $pid = substr(str_shuffle(str_repeat('23456789abcdefghjkmnpqrstuvwxyz', 4)), 0, 16);
            $pdo->prepare('INSERT INTO mock_mockups (public_id, owner_user_id, visibility, token, title, ref_id, device, html, bytes, published_at, expires_at, created_at) VALUES (?,?,\'public\',?,?,?,?,?,?,NOW(3),\'2099-12-31\',?)')
                ->execute([$pid, $owner, $token, $title, 'works:' . $it['path'], $device, $html, strlen($html), $at]);
            $mid = (int) $pdo->lastInsertId();
            $ins++;
        }
        $ge = $pdo->prepare('SELECT id FROM mock_gallery WHERE mockup_id = ?'); $ge->execute([$mid]); $gid = $ge->fetchColumn();
        if ($gid) {
            $pdo->prepare('UPDATE mock_gallery SET owner_user_id=?, title=?, device=?, html=?, note=? WHERE id=?')->execute([$owner, $title, $device, $html, $note, $gid]);
        } else {
            $pdo->prepare('INSERT INTO mock_gallery (mockup_id, owner_user_id, title, score, ref_id, device, html, note, status, shared_at, created_at) VALUES (?,?,?,0,?,?,?,?,\'shared\',NOW(3),?)')
                ->execute([$mid, $owner, $title, 'works:' . $it['path'], $device, $html, $note, $at]);
            $gid = (int) $pdo->lastInsertId();
        }
        $tw = "$SRC/" . ($it['thumb'] ?? '');
        if (!empty($it['thumb']) && is_file($tw) && ($im = @imagecreatefromwebp($tw))) {
            imagejpeg($im, "$thumbDir/$gid.jpg", 85); imagedestroy($im); $thumbs++;
            $pdo->prepare('UPDATE mock_mockups SET has_thumb = 1 WHERE id = ?')->execute([$mid]);
        }
    }
}
echo ($dry ? '[dry] ' : '') . "신규 $ins · 갱신 $upd · 썸네일 $thumbs · 파일 없음 $miss\n";
