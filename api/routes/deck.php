<?php
declare(strict_types=1);

/**
 * powerDeck — 장표 변환 REST v1 라우트.
 * 출처: powerDeck api/index.php 의 라우트 블록 전체를 플랫폼 Router 문법으로 옮겼다(2026-10-06).
 *       핸들러 본문은 powerDeck api/src/{Jobs,Uploads,Script,WireAi,WireLayout,AiKeys,Logos}.php → api/src/Deck/ (namespace Pp\Deck).
 *       옛 /powerDeck/api/<path> → /api/v1/deck/<path>. 하위 경로·메서드·JSON 요청/응답 모양은 옛 것과 같다(계약 §1).
 *       - 옛 json_out(['data'=>X]) 는 Legacy::jsonOut 이 X 로 풀어 넘긴다({data:{data:…}} 이중 봉투 방지).
 *       - 인증: 옛 Bearer 토큰·/auth/* 대신 플랫폼 세션(Actor). 이메일 = Actor->user['email'], admin = Actor->isAdmin().
 *       - 로그인 없이 공유 링크 보기(shared=3) = Actor kind anon(옛 Auth::userOpt()==='' 분기).
 *       - 엔진: Authorization: Bearer pp_worker_… + X-Worker. Actor kind worker, 이름 Actor->key['worker']. /worker/<sub> 그대로.
 *       - 빠진 옛 경로: /auth/*, /health(플랫폼 것 사용).
 */

use Pp\Core\Actor;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Deck\AiKeys;
use Pp\Deck\Jobs;
use Pp\Deck\Legacy;
use Pp\Deck\Links;
use Pp\Deck\Logos;
use Pp\Deck\Script;
use Pp\Deck\Uploads;
use Pp\Deck\WireAi;

return static function (Router $r): void {
    /** 로그인 사용자 [email, admin] — 옛 Auth::user()/isAdmin() */
    $user = static function (Actor $a): array {
        if ($a->user === null || $a->kind === 'worker') {
            throw HttpError::unauthorized();
        }
        // 키 범위(deck)는 Router 가 먼저 본다(403 FORBIDDEN_SCOPE, O-01·O-10).
        return [(string) $a->user['email'], $a->isAdmin()];
    };
    /** 엔진 — 옛 Auth::worker() + heartbeat */
    $worker = static function (Actor $a): string {
        if ($a->kind !== 'worker') {
            throw HttpError::unauthorized('엔진 키(pp_worker_)와 X-Worker 가 필요합니다.');
        }
        $w = (string) ($a->key['worker'] ?? 'worker');
        Jobs::heartbeatWorker($w, (string) ($_SERVER['HTTP_X_WORKER_INFO'] ?? ''));
        return $w;
    };
    $hex16 = static function (string $s): string {
        if (!preg_match('/^[0-9a-f]{16}$/', $s)) {
            throw HttpError::notFound('작업');
        }
        return $s;
    };
    $hex24 = static function (string $s): string {
        if (!preg_match('/^[0-9a-f]{24}$/', $s)) {
            throw HttpError::notFound('업로드');
        }
        return $s;
    };
    $sendFile = static function (string $p, string $type, ?string $attach = null): never {
        set_time_limit(0);
        header('Content-Type: ' . $type);
        header('Content-Length: ' . (string) filesize($p));
        header('Cache-Control: no-store');
        if ($attach !== null) {
            header('Content-Disposition: attachment; filename="' . $attach . '"');
        }
        readfile($p);
        exit;
    };

    // ── 참조 시안 묶음(엔진끼리 나눠 갖는 reference.zip) — 관리자만
    $r->get('/deck/reference.zip', static function (array $p, Actor $a) use ($user, $sendFile): void {
        [, $admin] = $user($a);
        if (!$admin) Legacy::fail('관리자만 받을 수 있습니다.', 403);
        $f = Legacy::dataDir() . '/reference.zip';
        if (!is_file($f)) Legacy::fail('서버에 참조 묶음이 아직 없습니다 (scripts/reference_push.sh 로 올립니다).', 404);
        $sendFile($f, 'application/zip', 'pd_reference.zip');
    });

    // ── 로고 찾기 — powerAssets 로고(공개 등급) 조회. 로그인 없이(Access 가 등급으로 거른다)
    $r->get('/deck/logos', static fn (array $p, Actor $a) => Legacy::jsonOut(Logos::search($a, $_GET)));
    $r->get('/deck/logos/topics', static fn (array $p, Actor $a) => Legacy::jsonOut(Logos::topics($a)));
    $r->get('/deck/logos/file', static function (array $p, Actor $a): void { Logos::file($a, (string) ($_GET['p'] ?? '')); });

    // ── 엔진(워커) ──
    $r->get('/deck/worker/reference.info', static function (array $p, Actor $a) use ($worker): void {
        $worker($a);
        $f = Legacy::dataDir() . '/reference.zip';
        Legacy::jsonOut(is_file($f) ? ['size' => filesize($f), 'mtime' => filemtime($f)] : ['size' => 0, 'mtime' => 0]);
    });
    $r->get('/deck/worker/reference.zip', static function (array $p, Actor $a) use ($worker, $sendFile): void {
        $worker($a);
        $f = Legacy::dataDir() . '/reference.zip';
        if (!is_file($f)) Legacy::fail('서버에 참조 묶음이 아직 없습니다 (scripts/reference_push.sh 로 올립니다).', 404);
        $sendFile($f, 'application/zip');
    });
    $r->post('/deck/worker/claim', static function (array $p, Actor $a) use ($worker): void {
        $w = $worker($a);
        $cj = Jobs::claim($w, !empty(Legacy::body()['light_only']));
        $ce = $cj ? (string) ($cj['email'] ?? '') : '';
        Legacy::jsonOut(['job' => $cj, 'engine_model' => AiKeys::engineModel(), 'text_engine' => AiKeys::textEngine(),
            'image_provider' => $ce !== '' ? AiKeys::imageProviderFor($ce) : AiKeys::imageProvider(), 'hf_key' => AiKeys::hfKey($ce !== '' ? $ce : null)]);
    });
    $r->post('/deck/worker/jobs/{id}/usage', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $w = $worker($a);
        Legacy::jsonOut(Jobs::workerUsage($hex16($p['id']), $w, Legacy::body()));
    });
    // 장표 글 검사(완성 전) — 오타·기획과 다른 숫자·개인 정보(Deck\TextCheck, Jev 1.14). 엔진 마무리 단계가 부르고 확인 목록에 올린다
    $r->post('/deck/worker/jobs/{id}/text-check', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $worker($a);
        $hex16($p['id']);
        $b = Legacy::body();
        Legacy::jsonOut(['findings' => \Pp\Deck\TextCheck::run((array) ($b['plan'] ?? []), array_values((array) ($b['slides'] ?? [])))]);
    });
    $r->get('/deck/worker/jobs/{id}/source', static function (array $p, Actor $a) use ($worker, $hex16, $sendFile): void {
        $worker($a);
        $f = Jobs::dir($hex16($p['id']), 'source') . '/source.pptx';
        if (!is_file($f)) Legacy::fail('원본 없음', 404);
        $sendFile($f, 'application/octet-stream');
    });
    $r->get('/deck/worker/jobs/{id}/files/{kind}/{name+}', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $worker($a);
        if (!in_array($p['kind'], ['pilot', 'draft', 'mockup', 'brand', 'result'], true)) Legacy::fail('Not Found', 404);
        Jobs::workerFile($hex16($p['id']), $p['kind'], $p['name']);
    });
    $r->get('/deck/worker/jobs/{id}/docs', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $worker($a);
        Legacy::jsonOut(['data' => Jobs::docs($hex16($p['id']))]);
    });
    $r->get('/deck/worker/jobs/{id}/docs/{doc}', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $worker($a);
        Jobs::workerDoc($hex16($p['id']), $hex16($p['doc']));
    });
    $r->post('/deck/worker/jobs/{id}/progress', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $w = $worker($a);
        Legacy::jsonOut(Jobs::progress($hex16($p['id']), $w, Legacy::body()));
    });
    $r->post('/deck/worker/jobs/{id}/ai', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $w = $worker($a);
        set_time_limit(320);
        AiKeys::chatForJob(Jobs::forWorker($hex16($p['id']), $w), Legacy::body());   // OpenRouter 응답 JSON 을 그대로 내보낸다(옛 모양)
    });
    $r->post('/deck/worker/dev/test_job', static function (array $p, Actor $a) use ($worker): void {
        $w = $worker($a);
        if (!Legacy::cfgBool('dev_test_job')) Legacy::fail('Not Found', 404);
        Legacy::jsonOut(Jobs::devTestJob($w, Legacy::body()));
    });
    $r->post('/deck/worker/hf_status', static function (array $p, Actor $a) use ($worker): void {
        $worker($a);
        $hb = Legacy::body();
        AiKeys::setHfStatus((string) ($hb['state'] ?? ''), (string) ($hb['message'] ?? ''));
        Legacy::jsonOut(['ok' => true]);
    });
    $r->post('/deck/worker/ai/claim', static function (array $p, Actor $a) use ($worker): void {
        $w = $worker($a);
        Legacy::jsonOut(['task' => AiKeys::claimTask($w)]);
    });
    $r->post('/deck/worker/ai/{n}/done', static function (array $p, Actor $a) use ($worker): void {
        $w = $worker($a);
        if (!ctype_digit($p['n'])) Legacy::fail('Not Found', 404);
        Legacy::jsonOut(AiKeys::finishTask((int) $p['n'], $w, Legacy::body()));
    });
    $r->post('/deck/worker/wire/layout', static function (array $p, Actor $a) use ($worker): void {
        $worker($a);
        Legacy::jsonOut(WireAi::layout((array) (Legacy::body()['slides'] ?? [])));
    });
    $r->put('/deck/worker/jobs/{id}/files/{kind}', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $w = $worker($a);
        if (!in_array($p['kind'], ['result', 'before', 'after', 'extra', 'live', 'frames', 'draft', 'pilot', 'mockup'], true)) Legacy::fail('Not Found', 404);
        Legacy::jsonOut(Jobs::putFile($hex16($p['id']), $w, $p['kind'], (string) ($_GET['name'] ?? ''), isset($_GET['slide']) ? (int) $_GET['slide'] : null));
    });
    // 기획을 먼저 저장(시안 전) — 시안에서 실패해도 다시 돌리면 기획부터 다시 짜지 않게(R81)
    $r->post('/deck/worker/jobs/{id}/plan', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $w = $worker($a);
        Legacy::jsonOut(Jobs::savePlan($hex16($p['id']), $w, Legacy::body()));
    });
    $r->post('/deck/worker/jobs/{id}/finish', static function (array $p, Actor $a) use ($worker, $hex16): void {
        $w = $worker($a);
        Legacy::jsonOut(Jobs::finish($hex16($p['id']), $w, Legacy::body()));
    });
    $r->get('/deck/worker/ping', static function (array $p, Actor $a) use ($worker): void {
        $worker($a);
        Legacy::jsonOut(['ok' => true]);
    });

    // ── 파일(img·다운로드 링크) — 로그인 없이도 shared=3 작업의 그림만(Jobs::view·send 가 거른다)
    $r->get('/deck/jobs/{id}/files/{kind}/{name+}', static function (array $p, Actor $a) use ($hex16): void {
        if (!in_array($p['kind'], Jobs::KINDS, true)) Legacy::fail('Not Found', 404);
        $e = $a->user !== null && $a->kind !== 'worker' ? (string) $a->user['email'] : '';
        // LEGAL-003: AI 가 만든 산출물(결과 장표·시안·초안)에 표시 — 원본(source)·로고(brand)는 사용자 파일이라 뺀다
        if (in_array($p['kind'], ['result', 'after', 'extra', 'draft', 'pilot', 'mockup', 'live', 'frames'], true)) header('X-AI-Generated: true');
        Jobs::send($hex16($p['id']), $e, $e !== '' && $a->isAdmin(), $p['kind'], $p['name'], isset($_GET['download']));
    });

    // ── 산출물 내려받기
    $r->get('/deck/jobs/{id}/plan.md', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        header('X-AI-Generated: true'); // LEGAL-003
        Jobs::sendPlanMd($hex16($p['id']), $e, $admin);
    });
    $r->get('/deck/jobs/{id}/export.zip', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        set_time_limit(120);
        header('X-AI-Generated: true'); // LEGAL-003
        Jobs::export($hex16($p['id']), $e, $admin);
    });
    // 이 장표에 쓰인 서체만(서체 + 라이선스 + 설치 안내) — 결과 pptx 를 따로 받은 사람용(R82)
    $r->get('/deck/jobs/{id}/fonts.zip', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        set_time_limit(120);
        Jobs::exportFonts($hex16($p['id']), $e, $admin);
    });

    // ── 받기 링크(완성 산출물을 URL 로 보내기, 0044) — 만들기·목록·끊기는 주인·관리자, 받기(/d/{토큰})는 로그인 없이
    $r->get('/deck/jobs/{id}/links', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(['data' => Links::list($hex16($p['id']), $e, $admin)]);
    });
    $r->post('/deck/jobs/{id}/links', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        // 로그인 없이 열리는 주소라 화면에서 확인을 한 번 받고 만든다 — 키(MCP)로는 만들지 않는다(엠바고)
        if ($a->via !== 'session') Legacy::fail('받기 링크는 웹 화면에서만 만들 수 있습니다.', 403);
        Legacy::jsonOut(Links::create($hex16($p['id']), $e, $admin, Legacy::body(), $a), 201);
    });
    $r->delete('/deck/jobs/{id}/links/{lid}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        if (!ctype_digit($p['lid'])) Legacy::fail('Not Found', 404);
        Legacy::jsonOut(Links::revoke($hex16($p['id']), (int) $p['lid'], $e, $admin, $a));
    });
    $r->get('/d/{token}', static function (array $p, Actor $a): void {
        Links::download((string) $p['token'], strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'HEAD');
    });

    // 대본 문서(script.html) · 노래방식 연습 화면(practice.html) · 글(script.md)
    foreach (['script.html' => '_발표 대본.html', 'practice.html' => '_발표 연습(노래방식).html', 'script.md' => '_발표 대본.md'] as $file => $suffix) {
        $r->get('/deck/jobs/{id}/' . $file, static function (array $p, Actor $a) use ($user, $hex16, $file, $suffix): void {
            [$e, $admin] = $user($a);
            $j = Jobs::own($hex16($p['id']), $e, $admin);
            set_time_limit(120);
            $out = $file === 'script.html' ? Script::html($j) : ($file === 'practice.html' ? Script::practice($j) : Script::md($j));
            if ($out === '') Legacy::fail('아직 대본이 없습니다.', 404);
            $html = str_ends_with($file, '.html');
            header('Content-Type: ' . ($html ? 'text/html' : 'text/markdown') . '; charset=utf-8');
            header('X-Frame-Options: SAMEORIGIN');
            header('X-AI-Generated: true'); // LEGAL-003
            if (isset($_GET['dl'])) header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode(preg_replace('/[\\\\\/:*?"<>|]/', '_', (string) $j['title']) . $suffix));
            echo $out;
        });
    }

    // ── 로그인 사용자 ──
    $r->get('/deck/engine', static function (array $p, Actor $a) use ($user): void {
        [$e] = $user($a);
        Legacy::jsonOut(Jobs::engine($e));
    });

    // AI 키·모델 — 설정은 관리자만
    $r->get('/deck/ai/settings', static function (array $p, Actor $a) use ($user): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(AiKeys::settings($e, $admin));
    });
    $r->get('/deck/ai/key/check', static function (array $p, Actor $a) use ($user): void {
        [$e] = $user($a);
        Legacy::jsonOut(AiKeys::check($e));
    });
    $r->get('/deck/admin/usage', static function (array $p, Actor $a) use ($user): void {
        [, $admin] = $user($a);
        if (!$admin) Legacy::fail('관리자만 볼 수 있습니다.', 403);
        Legacy::jsonOut(AiKeys::adminUsage((int) ($_GET['days'] ?? 30)));
    });
    $r->put('/deck/ai/budget', static function (array $p, Actor $a) use ($user): void {
        [, $admin] = $user($a);
        if (!$admin) Legacy::fail('관리자만 바꿀 수 있습니다.', 403);
        Legacy::jsonOut(AiKeys::saveBudget(Legacy::body()));
    });
    $r->put('/deck/ai/admin', static function (array $p, Actor $a) use ($user): void {
        [, $admin] = $user($a);
        if (!$admin) Legacy::fail('관리자만 바꿀 수 있습니다.', 403);
        Legacy::jsonOut(AiKeys::saveAdmin(Legacy::body()));
    });

    // 분할 업로드
    $r->post('/deck/uploads', static function (array $p, Actor $a) use ($user): void {
        [$e] = $user($a);
        Legacy::jsonOut(Uploads::create($e, Legacy::body()), 201);
    });
    $r->get('/deck/uploads/{id}', static function (array $p, Actor $a) use ($user, $hex24): void {
        [$e] = $user($a);
        Legacy::jsonOut(Uploads::status($e, $hex24($p['id'])));
    });
    $r->put('/deck/uploads/{id}/{n}', static function (array $p, Actor $a) use ($user, $hex24): void {
        [$e] = $user($a);
        if (!ctype_digit($p['n'])) Legacy::fail('Not Found', 404);
        Legacy::jsonOut(Uploads::chunk($e, $hex24($p['id']), (int) $p['n']));
    });
    $r->post('/deck/uploads/{id}/complete', static function (array $p, Actor $a) use ($user, $hex24): void {
        [$e] = $user($a);
        Legacy::jsonOut(Uploads::complete($e, $hex24($p['id']), Legacy::body()), 201);
    });

    // 작업
    $r->get('/deck/jobs', static function (array $p, Actor $a) use ($user): void {
        [$e, $admin] = $user($a);
        $list = Jobs::list($e, $admin && isset($_GET['all']));
        if ($list === [] && !isset($_SERVER['HTTP_X_WORKER'])) {
            // 빈 목록이면 어디서 시작하는지 알려 준다(MCP·외부 호출이 빈 배열만 받고 멈추지 않게).
            // hint 는 봉투 바깥에 둔다 — 안에 두면 data.data 로 두 번 감싸진다(2026-10-12 MCP 시험).
            Response::json([], 200, ['hint' => '아직 장표 작업이 없습니다. ' . rtrim((string) \Pp\Core\Config::get('app.url', 'https://powerplus.hom2box.com'), '/') . '/deck 에서 시작하세요.', 'start' => rtrim((string) \Pp\Core\Config::get('app.url', 'https://powerplus.hom2box.com'), '/') . '/deck']);
        }
        Legacy::jsonOut(['data' => $list]);
    });
    $r->post('/deck/jobs/design', static function (array $p, Actor $a) use ($user): void {   // /jobs/{id} 보다 먼저
        [$e] = $user($a);
        Legacy::jsonOut(Jobs::createDesign($e, Legacy::body()), 201);
    });
    $r->get('/deck/jobs/{id}', static function (array $p, Actor $a) use ($user, $hex16): void {
        $id = $hex16($p['id']);
        if ($a->user === null || $a->kind === 'worker') {   // 로그인 없이 링크로 보기(shared=3) — 읽기만
            Legacy::jsonOut(Jobs::get($id, '', false));
        }
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::get($id, $e, $admin));
    });
    $r->patch('/deck/jobs/{id}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::patch($hex16($p['id']), $e, $admin, Legacy::body()));
    });
    $r->delete('/deck/jobs/{id}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::delete($hex16($p['id']), $e, $admin));
    });
    $r->get('/deck/jobs/{id}/events', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        $id = $hex16($p['id']);
        Jobs::get($id, $e, $admin);   // 권한 확인
        Legacy::jsonOut(['data' => Jobs::events($id, (int) ($_GET['after'] ?? 0))]);
    });
    $r->get('/deck/jobs/{id}/comments', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        $id = $hex16($p['id']);
        Jobs::get($id, $e, $admin);
        Legacy::jsonOut(['data' => Jobs::comments($id)]);
    });
    $r->post('/deck/jobs/{id}/comments', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::addComment($hex16($p['id']), $e, $admin, Legacy::body()), 201);
    });
    $r->post('/deck/jobs/{id}/comments/{cid}/replies', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::addReply($hex16($p['id']), (int) $p['cid'], $e, $admin, Legacy::body()), 201);
    });
    $r->patch('/deck/jobs/{id}/comments/{cid}/replies/{rid}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::editReply($hex16($p['id']), (int) $p['cid'], (int) $p['rid'], $e, $admin, Legacy::body()));
    });
    $r->delete('/deck/jobs/{id}/comments/{cid}/replies/{rid}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::editReply($hex16($p['id']), (int) $p['cid'], (int) $p['rid'], $e, $admin, [], true));
    });
    $r->patch('/deck/jobs/{id}/comments/{cid}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::editComment($hex16($p['id']), (int) $p['cid'], $e, $admin, Legacy::body()));
    });
    $r->delete('/deck/jobs/{id}/comments/{cid}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::editComment($hex16($p['id']), (int) $p['cid'], $e, $admin, [], true));
    });
    $r->post('/deck/wire/tpl', static function (array $p, Actor $a) use ($user): void {   // 배치 틀에 상자 끼우기
        $user($a);
        Legacy::jsonOut(WireAi::tpl(Legacy::body()));
    });
    $r->post('/deck/jobs/{id}/wire', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        set_time_limit(300);
        Legacy::jsonOut(WireAi::make($hex16($p['id']), $e, $admin, Legacy::body()));
    });
    $r->post('/deck/jobs/{id}/script', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        set_time_limit(300);
        Legacy::jsonOut(Script::make(Jobs::own($hex16($p['id']), $e, $admin), Legacy::body()));
    });
    $r->put('/deck/jobs/{id}/script', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Script::save(Jobs::own($hex16($p['id']), $e, $admin), Legacy::body()));
    });
    $r->post('/deck/jobs/{id}/edits', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::edits($hex16($p['id']), $e, $admin, Legacy::body()));
    });
    $r->post('/deck/jobs/{id}/cancel', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::cancel($hex16($p['id']), $e, $admin));
    });
    $r->post('/deck/jobs/{id}/back', static function (array $p, Actor $a) use ($user, $hex16): void {   // 기획 멈추고 내용 입력(hold)으로
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::back($hex16($p['id']), $e, $admin));
    });
    $r->put('/deck/jobs/{id}/brand/{which}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        if (!in_array($p['which'], ['client', 'vendor', 'client_white', 'vendor_white'], true)) Legacy::fail('Not Found', 404);
        Legacy::jsonOut(Jobs::putBrand($hex16($p['id']), $e, $admin, $p['which']));
    });
    $r->post('/deck/jobs/{id}/start', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::start($hex16($p['id']), $e, $admin));
    });
    $r->delete('/deck/jobs/{id}/docs/{doc}', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::deleteDoc($hex16($p['id']), $hex16($p['doc']), $e, $admin));
    });
    $r->post('/deck/jobs/{id}/slides/order', static function (array $p, Actor $a) use ($user, $hex16): void {   // 장 순서 바꾸기·지우기
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::reorder($hex16($p['id']), $e, $admin, Legacy::body()));
    });
    $r->post('/deck/jobs/{id}/approve', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::approve($hex16($p['id']), $e, $admin, Legacy::body()));
    });
    $r->post('/deck/jobs/{id}/retry', static function (array $p, Actor $a) use ($user, $hex16): void {
        [$e, $admin] = $user($a);
        Legacy::jsonOut(Jobs::retry($hex16($p['id']), $e, $admin));
    });
};
