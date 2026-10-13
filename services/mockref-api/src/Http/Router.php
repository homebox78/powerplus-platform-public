<?php
declare(strict_types=1);

namespace Homebox\Http;

/**
 * 아주 작은 라우터. 패턴 `/api/sites/{slug}` → 핸들러(array $params): void
 * 핸들러는 Response::json / Response::error 로 끝난다.
 */
final class Router
{
    /** @var list<array{method:string, regex:string, keys:list<string>, handler:callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $keys = [];
        $regex = preg_replace_callback('#\{(\w+)(\+?)\}#', static function (array $m) use (&$keys): string {
            $keys[] = $m[1];
            return $m[2] === '+' ? '(.+)' : '([^/]+)'; // {name+} = 슬래시가 든 나머지 경로
        }, $pattern);
        $this->routes[] = ['method' => strtoupper($method), 'regex' => '#^' . $regex . '/?$#', 'keys' => $keys, 'handler' => $handler];
    }

    public function get(string $pattern, callable $handler): void { $this->add('GET', $pattern, $handler); }
    public function post(string $pattern, callable $handler): void { $this->add('POST', $pattern, $handler); }
    public function patch(string $pattern, callable $handler): void { $this->add('PATCH', $pattern, $handler); }
    public function delete(string $pattern, callable $handler): void { $this->add('DELETE', $pattern, $handler); }

    /** 요청 경로 — 서브디렉터리 배포(/homebox/api/...)에서도 /api/... 로 정규화 */
    public static function path(): string
    {
        $uri = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $pos = strpos($uri, '/api/');
        return $pos === false ? $uri : substr($uri, $pos);
    }

    public function dispatch(string $method, string $path): void
    {
        $method = strtoupper($method);
        $allowed = [];
        foreach ($this->routes as $r) {
            if (!preg_match($r['regex'], $path, $m)) {
                continue;
            }
            if ($r['method'] !== $method) {
                $allowed[] = $r['method'];
                continue;
            }
            array_shift($m);
            $params = $r['keys'] === [] ? [] : array_combine($r['keys'], array_map('urldecode', $m));
            ($r['handler'])($params);
            return;
        }
        if ($allowed !== []) {
            Response::error(405, 'METHOD_NOT_ALLOWED', '허용되지 않은 메서드입니다.', ['allow' => $allowed]);
        }
        Response::error(404, 'NOT_FOUND', '경로를 찾을 수 없습니다.');
    }
}
