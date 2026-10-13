<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 경로 라우터: {name} 한 단, {name+} 여러 단. 핸들러 시그니처 fn(array $params, Actor $actor).
 * 출처: homebox-handoff api/src/Http/Router.php (접두를 /api/v1 로, Actor 전달·auth/role 옵션 추가)
 */
final class Router
{
    /** @var array<string, array<int, array{re:string, names:string[], h:callable, opt:array}>> */
    private array $routes = [];

    /** 요청 경로를 /api/v1 뒤로 정규화. 옛 주소(/homebox/api, /powerPlus/api)도 같은 규칙으로 받는다. */
    public static function path(): string
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $p = parse_url($uri, PHP_URL_PATH) ?: '/';
        $p = preg_replace('#//+#', '/', $p) ?? '/';
        if (preg_match('#/api/v1(/.*)?$#', $p, $m)) {
            $p = $m[1] ?? '/';
        } elseif (preg_match('#/api(/.*)?$#', $p, $m)) {
            $p = $m[1] ?? '/';
        }
        $p = rtrim($p, '/');
        return $p === '' ? '/' : $p;
    }

    public function add(string $method, string $pattern, callable $handler, array $opt = []): self
    {
        $names = [];
        $re = preg_replace_callback('#\{(\w+)(\+)?\}#', static function (array $m) use (&$names): string {
            $names[] = $m[1];
            return isset($m[2]) && $m[2] === '+' ? '(.+)' : '([^/]+)';
        }, $pattern);
        $this->routes[strtoupper($method)][] = ['re' => '#^' . $re . '$#', 'p' => $pattern, 'names' => $names, 'h' => $handler, 'opt' => $opt];
        return $this;
    }

    public function get(string $p, callable $h, array $o = []): self { return $this->add('GET', $p, $h, $o); }
    public function post(string $p, callable $h, array $o = []): self { return $this->add('POST', $p, $h, $o); }
    public function put(string $p, callable $h, array $o = []): self { return $this->add('PUT', $p, $h, $o); }
    public function patch(string $p, callable $h, array $o = []): self { return $this->add('PATCH', $p, $h, $o); }
    public function delete(string $p, callable $h, array $o = []): self { return $this->add('DELETE', $p, $h, $o); }

    public function dispatch(string $method, string $path): void
    {
        $method = strtoupper($method);
        if ($method === 'HEAD') {
            $method = 'GET';
        }
        $other = false;
        foreach ($this->routes as $m => $list) {
            foreach ($list as $r) {
                if (!preg_match($r['re'], $path, $mm)) {
                    continue;
                }
                if ($m !== $method) {
                    $other = true;
                    continue;
                }
                $params = [];
                foreach ($r['names'] as $i => $n) {
                    $params[$n] = rawurldecode($mm[$i + 1]);
                }
                $actor = Auth::actor();
                // 테스트 계정 = 읽기 전용 + 다른 회원 정보 가림 + 관리자 열람 기록(TestLogin::guard 한 곳)
                TestLogin::guard($actor, $method, $path);
                if (!empty($r['opt']['auth']) && $actor->user === null) {
                    throw HttpError::unauthorized();
                }
                // 가입 동의(만 14세·약관·개인정보·국외 이전) 전에는 로그인이 필요한 기능을 막는다 — 웹은 동의 화면을 띄운다.
                if ((!empty($r['opt']['auth']) || !empty($r['opt']['role'])) && Consents::blocks($actor) && !Consents::allowed($method, $path)) {
                    throw new HttpError('CONSENT_REQUIRED', '이용약관 등 필수 항목에 동의해야 이용할 수 있습니다.', 428, '로그인 후 나오는 동의 화면에서 동의해 주세요.');
                }
                if (!empty($r['opt']['role']) && !$actor->hasRole((string) $r['opt']['role'])) {
                    throw HttpError::forbidden();
                }
                // MCP-006: 키로 REST 를 직접 부르면 여기서 한 번 센다 → 일 한도 넘으면 429.
                // /keys/verify 는 자기가 센다(powerMCP 경유), powerMCP 를 거친 REST 는 Keys::hit 이 건너뛴다.
                if ($actor->via === 'key' && $path !== '/keys/verify') {
                    Keys::hit($actor, 'rest:' . $method . ' ' . $r['p']);
                }
                ($r['h'])($params, $actor);
                return;
            }
        }
        if ($other) {
            Response::error('METHOD_NOT_ALLOWED', '허용되지 않은 메서드입니다.', 405);
        }
        Response::error('NOT_FOUND', '경로를 찾을 수 없습니다.', 404);
    }
}
