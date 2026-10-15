<?php
/**
 * powerGuide REST — /api/v1/guide/* . 토큰·부품·KRDS 지침의 정본(기획 §23 ③, 연구 docs/mcp-materials-research.md §3·§4 안 C).
 * powerGuide 는 무료(기획 §13.2-1 외부 유입 입구) → 로그인 불필요. 키로 부르면 Router 가 범위(guide)·사용량을 본다(MCP 경유는 MCP 가 이미 셌다).
 *
 *   GET  /guide/components                부품 목록(id·이름·분류·한 줄 설명)
 *   GET  /guide/components/{id}?fw=react|vue  소스 파일·사용법·의존성·설치 명령·KRDS 지침
 *   GET  /guide/rules?q=&component=&type=     KRDS 컴포넌트 지침·기본 패턴·검증 체크리스트 검색
 *   GET  /guide/checklist?section=&verdict=&q=  KRDS 검증 체크리스트(항목·판정·근거)
 *   POST /guide/check/code {html, css?}       사용자 AI 가 만든 HTML 결정적 판정(점수·fixes)
 * 데이터 원천은 Pp\Guide\Data 머리 주석 참고.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Config;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Guide\CodeCheck;
use Pp\Guide\Data;

return static function (Router $r): void {
    // 사용량 집계·키 범위(guide)는 Router 가 요청마다 한 번 한다(powerMCP 경유는 Keys::viaMcp HMAC 으로 건너뜀).
    // 예전엔 여기서 X-Requested-With 헤더만 보고 따로 셌다(흉내 낼 수 있는 헤더, MC-33) — 2026-10-15 정리.
    $origin = static function (): string {
        $u = rtrim((string) Config::get('app.url', ''), '/');
        if ($u !== '') {
            return $u;
        }
        $https = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off';
        return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    };
    // 지침 검색 동의어 — KRDS 원문은 "초점"·"본인 확인"처럼 쓰는데 사용자는 "포커스"·"로그인"으로 찾는다(2026-10-10 MCP 시험에서 0건).
    $syn = [
        '포커스' => ['포커스', '초점', 'focus'], '초점' => ['초점', '포커스', 'focus'],
        '로그인' => ['로그인', '인증', '본인 확인', '본인확인', '개인 식별', '아이디', '비밀번호'],
        '에러' => ['에러', '오류'], '오류' => ['오류', '에러'], '모달' => ['모달', '대화상자', '레이어'],
        '드롭다운' => ['드롭다운', '셀렉트', '선택'], '버튼' => ['버튼', 'button'], '색' => ['색', '색상', '대비'],
        '대비' => ['대비', '명도'], '키보드' => ['키보드', 'tab', '탭 키'], '스크린리더' => ['스크린리더', '보조기기', '스크린 리더'],
        // 영어로 찾는 말 — KRDS 원문은 한글이라 contrast·modal 이 0건이었다(2026-10-10 MCP 시험 결함 4)
        'contrast' => ['contrast', '대비', '명도'], 'focus' => ['focus', '초점', '포커스'], 'keyboard' => ['keyboard', '키보드'],
        'modal' => ['modal', '모달', '대화상자'], 'dialog' => ['dialog', '모달', '대화상자'], 'error' => ['error', '오류', '에러'],
        'login' => ['login', '로그인', '인증', '본인 확인', '본인확인', '아이디', '비밀번호'], 'color' => ['color', '색', '색상'],
        'label' => ['label', '레이블', '라벨'], 'alt' => ['alt', '대체 텍스트', '대체텍스트'], 'skip' => ['skip', '건너뛰기'],
        'date' => ['date', '날짜', '달력'], 'calendar' => ['calendar', '달력', '날짜'], 'button' => ['button', '버튼'],
        'touch' => ['touch', '터치'],
    ];
    /** 낱말마다 동의어 중 하나라도 들어 있으면 일치. */
    $matchAll = static function (string $hay, array $terms) use ($syn): bool {
        foreach ($terms as $t) {
            $ok = false;
            foreach ($syn[$t] ?? [$t] as $alt) {
                if (str_contains($hay, mb_strtolower($alt))) {
                    $ok = true;
                    break;
                }
            }
            if (!$ok) {
                return false;
            }
        }
        return true;
    };
    $verdicts = ['P' => '통과','F' => '미흡', '수정됨' => '수정해 통과', '의도' => '의도된 차이', '?' => '판단 불가', '사이트' => '사이트 담당'];

    // 관리자 덮어쓰기 전체(공개) — 웹 /guide 화면이 코드 원본 위에 합친다(2026-10-14, Pp\Guide\Overrides). 키 없이 읽는다.
    $r->get('/guide/overrides', function (array $p, Actor $a): void {
        header('Cache-Control: public, max-age=60');
        Response::json(\Pp\Guide\Overrides::all());
    });

    // KRDS 컴포넌트 지침 목록(관리자 덮어쓰기 반영 — 숨긴 항목 빠짐, note 덧붙음). MCP guide_krds 가 공용 분류표(id·공식 링크) 위에 합친다(2026-10-14).
    $r->get('/guide/krds', function (array $p, Actor $a): void {
        $kc = Data::krdsComponents();
        // id = 키트 부품 id(guide_get_component 로 바로 부를 수 있는 것, 없으면 빈 값), krds_id = KRDS 대응표 원래 id — 이름 체계를 키트 id 하나로(2026-10-10 MCP 시험 결함 3)
        $items = array_map(static fn (array $c): array => ['id' => $c['kit_id'] ?? ''] + $c, $kc['items'] ?? []);
        Response::json($items, 200, ['meta' => ['categories' => $kc['categories'] ?? [],
            'id_note' => 'id·kit_id 는 powerGuide 키트 부품 id(guide_get_component 에 그대로), krds_id 는 KRDS 대응표 id 입니다. id 가 비면 대응 부품이 없습니다.',
            'source' => 'KRDS(대한민국 디지털 정부 디자인 시스템, krds.go.kr) 공식 컴포넌트 지침을 powerGuide 가 정리 · 관리자 덮어쓰기 반영']], true);
    });

    $r->get('/guide/components', function (array $p, Actor $a): void {
        $reg = Data::registry();
        $groups = [];
        foreach ($reg['groups'] ?? [] as [$gid, $label]) {
            $groups[$gid] = $label;
        }
        // /guide/components/ (id 빈 문자열)도 이 경로로 떨어진다 — 목록 대신 오류(2026-10-12 MCP 시험: 빈 id 에 목록 25KB 가 부품 응답으로 나갔다)
        $path = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '');
        if (str_ends_with($path, '/components/')) {
            throw new HttpError('INVALID', '부품 id 가 비어 있습니다.', 400, 'id(예: button) 나 한글 이름(예: 버튼)을 넣으세요. 목록은 guide_list_components 로 봅니다.');
        }
        $g = (string) ($_GET['group'] ?? '');
        if ($g !== '' && !isset($groups[$g])) {
            // 한글 분류 이름(예: 오버레이)도 받는다
            $byLabel = array_search($g, $groups, true);
            if ($byLabel === false) {
                $list = implode(', ', array_map(static fn ($k, $v) => "{$k}({$v})", array_keys($groups), $groups));
                throw new HttpError('INVALID', "분류 '{$g}' 가 없습니다.", 400, "쓸 수 있는 분류: {$list}. 비우면 전체입니다.");
            }
            $g = (string) $byLabel;
        }
        $q = mb_strtolower(trim((string) ($_GET['q'] ?? '')));
        $qAlts = $q !== '' ? Data::searchTerms($q) : [];
        $rows = [];
        foreach ($reg['metas'] ?? [] as $m) {
            if ($g !== '' && $m['group'] !== $g) {
                continue;
            }
            // note 가 빈 부품(accordion 등)은 부품 문서의 머리 설명으로 채운다
            $summary = (string) ($m['note'] ?? '');
            if ($summary === '') {
                $summary = Data::docSummary((string) $m['id']);
            }
            if ($q !== '') {
                // 요약(summary)·KRDS 이름(한·영)도 찾는다 — id·제목·note 만 봐서 영어·설명 낱말이 0건이던 것(2026-10-10 MCP 시험 결함 4)
                $krdsNames = implode(' ', array_map(static fn (array $c): string => $c['ko'] . ' ' . $c['en'], Data::krdsFor((string) $m['id'])));
                $hay = mb_strtolower($m['id'] . ' ' . $m['title'] . ' ' . $summary . ' ' . $krdsNames);
                $hit1 = false;
                foreach ($qAlts as $alt) {
                    if (str_contains($hay, $alt)) {
                        $hit1 = true;
                        break;
                    }
                }
                if (!$hit1) {
                    continue;
                }
            }
            $rows[] = [
                'id' => $m['id'], 'title' => $m['title'], 'group' => $m['group'], 'group_label' => $groups[$m['group']] ?? $m['group'],
                'source' => $m['source'] ?? '', 'summary' => $summary,
            ];
        }
        // 0건은 이유를 말한다(MC-25) — 없는 부품을 지어내 만들지 않게
        $hint = ($rows === [] && $q !== '')
            ? "'{$q}' 에 맞는 부품이 키트 77종에 없습니다. 비슷한 부품을 조합하거나(guide_get_component) KRDS 지침(guide_search_rules)을 근거로 직접 만드세요. 다른 낱말(한글·영어)로도 찾아 보세요."
            : null;
        Response::json($rows, 200, [
            'total' => count($rows),
            'meta' => ['version' => $reg['version'] ?? '', 'groups' => $groups, 'frameworks' => ['react', 'vue'], 'hint' => $hint],
        ], true);
    });

    $r->get('/guide/components/{id}', function (array $p, Actor $a) use ($origin): void {
        $asked = rawurldecode((string) $p['id']);
        // 경로 문자·제어 문자 — 부품 id 가 아니다(../../etc 같은 값에 일반 404 대신 이유를 말한다)
        if (preg_match('#[/\\\\.\x00-\x1F]#u', $asked) || trim($asked) === '') {
            throw new HttpError('INVALID', "'{$asked}' 는 부품 id 형식이 아닙니다.", 400, 'id 는 영문 소문자·숫자·하이픈(예: date-input) 이거나 한글 이름(예: 날짜 입력)입니다. 목록은 guide_list_components 로 봅니다.');
        }
        // 한글 이름(날짜 입력)·KRDS 이름(날짜 입력 필드)·띄어쓰기 다른 id 도 받는다(2026-10-12 MCP 시험: '날짜 입력' → 404)
        $found = Data::resolveComponent($asked);
        $id = $found['id'] ?? $asked;
        $doc = $found['id'] !== null ? Data::doc($id) : null;
        if ($doc === null) {
            $cands = $found['candidates'];
            // KRDS 에는 있지만 키트 부품이 없는 컴포넌트(이미지·파비콘·플로팅 버튼 등)는 그렇다고 말한다
            $nk = mb_strtolower(preg_replace('/[\s_\-]+/u', '', $asked) ?? $asked);
            foreach (Data::krdsComponents()['items'] ?? [] as $c) {
                $names = [$c['ko'], $c['en'], $c['krds_id']];
                if ($c['kit_id'] === null && in_array($nk, array_map(static fn ($s) => mb_strtolower(preg_replace('/[\s_\-]+/u', '', (string) $s) ?? ''), $names), true)) {
                    throw new HttpError('NOT_FOUND', "KRDS 「{$c['ko']}」 에 대응하는 키트 부품은 없습니다.", 404, "지침은 guide_search_rules(query='{$c['ko']}') 로 보고 직접 만드세요. 부품 목록은 guide_list_components 로 봅니다.");
                }
            }
            $hint = $cands
                ? '이 부품을 찾으셨나요: ' . implode(', ', array_map(static fn ($c) => "{$c['id']}({$c['title']})", $cands)) . '. id 나 한글 이름으로 다시 부르세요.'
                : 'guide_list_components(또는 /guide/components?q=) 로 목록을 보세요. id 대신 한글 이름(예: 날짜 입력)도 받습니다.';
            throw new HttpError('NOT_FOUND', "부품 '{$asked}' 이(가) 없습니다.", 404, $hint);
        }
        $fw = ($_GET['fw'] ?? 'react') === 'vue' ? 'vue' : 'react';
        $f = $doc[$fw] ?? ['demo' => '', 'files' => [], 'deps' => []];
        $deps = array_values($f['deps'] ?? []);
        // 예시(demo)가 쓰는 다른 키트 부품 — React 만 따로 모았다(Vue files 에는 예시가 쓰는 부품이 이미 들어 있다)
        $needs = array_values(array_filter($f['demoNeeds'] ?? [], static fn ($x) => is_string($x) && $x !== ''));
        $demoFiles = array_map(static fn (array $x): array => ['path' => $x['path'], 'code' => $x['code']], $f['demoFiles'] ?? []);
        $base = $origin();
        $install = [
            'common' => [
                'what' => '키트 공통(kit.css · 글꼴 · 아이콘)은 프로젝트에 한 번만 둡니다. 부품을 감싸는 곳에 hb-kit 클래스를 붙입니다.',
                // 배포 파일 이름은 packages/kit/scripts/publish-web.mjs 가 정한다 — 옛 homebox-kit-krds.zip 을 주던 것(2026-10-10 MCP 시험 결함 6)
                'download' => "{$base}/kit-files/powerguide-kit-krds.zip",
                'css' => "{$base}/kit-files/kit.css",
                // kit.css 는 부품과 같은 폴더(target_dir)에 둔다 — 예전 안내('./kit/kit.css')는 target_dir 과 경로가 달랐다
                'css_path' => 'components/kit/kit.css',
                'code' => $fw === 'vue' ? "// main.ts — kit.css 를 src/components/kit/kit.css 에 둡니다\nimport \"@/components/kit/kit.css\";\n\n<!-- 레이아웃 바깥에 -->\n<div class=\"hb-kit\">…</div>" : "// main.tsx — kit.css 를 src/components/kit/kit.css 에 둡니다\nimport \"@/components/kit/kit.css\";\n\n// 레이아웃 바깥에\n<div className=\"hb-kit\">…</div>",
            ],
            'deps' => $deps,
            'deps_command' => $deps ? 'npm install ' . implode(' ', $deps) : null,
            'target_dir' => 'components/kit/',
        ];
        if ($fw === 'react' && Data::hasRegistryItem($id)) {
            $install['registry_url'] = "{$base}/kit-files/r/{$id}.json";
            $urls = ["{$base}/kit-files/r/{$id}.json"];
            foreach ($needs as $nid) {
                if (Data::hasRegistryItem($nid)) {
                    $urls[] = "{$base}/kit-files/r/{$nid}.json";
                }
            }
            // 예시가 쓰는 부품까지 한 번에 받는다(dialog 예시 → button)
            $install['command'] = 'npx shadcn@latest add ' . implode(' ', $urls);
        } else {
            $install['command'] = null;
            $install['manual'] = '아래 files 를 components/kit/ 에 그대로 붙여 넣습니다.';
        }
        if ($needs) {
            $install['demo_needs'] = $needs;
            $install['demo_note'] = '예시(demo)는 ' . implode(', ', $needs) . ' 부품도 씁니다. 예시를 그대로 돌리려면 demo_files 도 components/kit/ 에 둡니다(설치 명령에 함께 들어 있습니다).';
        }
        $krds = array_map(static fn (array $c): array => [
            'ko' => $c['ko'], 'en' => $c['en'], 'category' => $c['cat'],
            'usage' => $c['usage'], 'accessibility' => $c['a11y'], 'interaction' => $c['interaction'], 'dev' => $c['dev'], 'kwcag' => $c['kwcag'],
        ], Data::krdsFor($id));
        // summary 끝에 note 가 그대로 붙어 있으면(빌드 산출물이 '제목 — 설명 note' 꼴) 떼어 같은 문장이 두 번 나오지 않게
        $summary = trim((string) ($doc['summary'] ?? ''));
        $note = trim((string) ($doc['note'] ?? ''));
        if ($note !== '' && $summary !== '') {
            $flat = static fn (string $s): string => preg_replace('/\s+/u', ' ', $s) ?? $s;
            $fs = $flat($summary); $fn = $flat($note);
            if ($fs === $fn) {
                $note = '';
            } else {
                // 앞 문장(마침표·— 앞)이 겹치는 부분도 뗀다
                $head = preg_split('/(?<=[.。])\s+|\s—\s/u', $fn)[0] ?? '';
                if (mb_strlen($head) >= 8 && str_contains($fs, $head)) {
                    $fs = trim(str_replace($head, '', $fs), " \t—-·");
                    $summary = $fs !== '' ? $fs : $summary;
                }
            }
        }
        Response::json([
            'id' => $doc['id'], 'title' => $doc['title'], 'group' => $doc['group'], 'group_label' => $doc['groupLabel'] ?? '',
            'source' => $doc['source'] ?? '', 'summary' => $summary, 'note' => $note,
            'resolved_from' => $asked !== $id ? $asked : null,
            'notes' => $doc['notes'] ?? [],
            'usage' => $doc['usage'] ?? '',
            'usage_note' => $fw === 'vue' ? 'usage 는 React 표기입니다. Vue 사용법은 files 의 머리 주석과 demo 를 보세요.' : null,
            'framework' => $fw,
            'files' => array_map(static fn (array $x): array => ['path' => $x['path'], 'code' => $x['code']], $f['files'] ?? []),
            'demo' => $f['demo'] ?? '',
            'demo_needs' => $needs,
            'demo_files' => $demoFiles,
            'install' => $install,
            'krds' => $krds,
            'krds_note' => $krds ? null : '이 부품에 맞는 KRDS 컴포넌트 지침이 없습니다(KRDS 55종 밖이거나 shadcn 부품). 접근성은 guide_get_checklist 와 guide_check_code 로 확인하세요.',
            'doc_url' => "{$base}/guide/components/{$id}",
            'preview_url' => "{$base}/kit-files/preview/{$fw}/index.html?bare=1&c={$id}",
        ], 200, [], true);
    });

    $r->get('/guide/rules', function (array $p, Actor $a) use ($verdicts, $matchAll): void {
        $q = mb_strtolower(trim(mb_substr((string) ($_GET['q'] ?? ''), 0, 100)));
        $comp = trim((string) ($_GET['component'] ?? ''));
        $type = (string) ($_GET['type'] ?? '');
        if ($type !== '' && !in_array($type, ['component', 'pattern', 'checklist', 'token'], true)) {
            throw HttpError::invalid("type '{$type}' 은 없습니다.", '허용값: component(컴포넌트 지침)·pattern(기본 패턴)·checklist(검증 체크리스트)·token(부품 치수 토큰). 비우면 전부입니다.');
        }
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 30)));
        $terms = array_values(array_filter(preg_split('/\s+/u', $q) ?: [], static fn (string $t): bool => $t !== ''));
        $fields = ['usage' => '사용', 'a11y' => '접근성', 'interaction' => '상호작용', 'dev' => '개발', 'kwcag' => 'KWCAG'];
        $entries = [];
        // component 는 키트 id·한글 이름·KRDS id(top-navigation 등) 무엇이든 키트 id 로 푼다
        $compAsked = $comp;
        if ($comp !== '') {
            $comp = Data::resolveComponent($comp)['id'] ?? $comp;
        }
        if ($type === '' || $type === 'component') {
            $kc = Data::krdsComponents();
            $items = $comp !== '' ? Data::krdsFor($comp) : ($kc['items'] ?? []);
            foreach ($items as $c) {
                foreach ($fields as $f => $label) {
                    foreach ($c[$f] ?? [] as $t) {
                        // kit_id = guide_get_component 로 바로 부를 수 있는 키트 부품 id(대응 부품이 없으면 null), krds_id = KRDS 대응표 id
                        $entries[] = ['type' => 'component', 'name' => $c['ko'], 'en' => $c['en'], 'category' => $c['cat'], 'kit_id' => $c['kit_id'], 'krds_id' => $c['krds_id'] ?: null, 'field' => $label, 'text' => $t];
                    }
                }
            }
        }
        if (($type === '' || $type === 'pattern') && $comp === '') {
            foreach (Data::krdsPatterns()['items'] ?? [] as $pt) {
                $entries[] = ['type' => 'pattern', 'name' => $pt['ko'], 'en' => null, 'category' => '기본 패턴', 'kit_id' => null, 'field' => '설명', 'text' => $pt['desc']];
                foreach ($fields as $f => $label) {
                    foreach ($pt[$f] ?? [] as $t) {
                        $entries[] = ['type' => 'pattern', 'name' => $pt['ko'], 'en' => null, 'category' => '기본 패턴', 'kit_id' => null, 'field' => $label, 'text' => $t];
                    }
                }
            }
        }
        // 부품 치수 기준(터치 대상 최소 크기·컨트롤 높이 등) — 정본 토큰 설명에 근거가 있다(2026-10-10 MCP 시험 결함 19: 터치 영역 크기 기준 0건)
        if (($type === '' || $type === 'token') && $comp === '') {
            $flat = Data::webRoot() . '/guide-files/solideo-tokens.flat.json';
            $tj = is_file($flat) ? json_decode((string) file_get_contents($flat), true) : null;
            foreach ((array) ($tj['tokens'] ?? []) as $name => $t) {
                if (!str_starts_with((string) $name, 'component-') || trim((string) ($t['description'] ?? '')) === '') {
                    continue;
                }
                $entries[] = ['type' => 'token', 'name' => "--{$name}", 'en' => null, 'category' => '부품 치수 토큰', 'kit_id' => null, 'field' => '값 ' . $t['value'], 'text' => (string) $t['description']];
            }
        }
        if (($type === '' || $type === 'checklist') && $comp === '') {
            foreach (Data::checklist()['rows'] ?? [] as $row) {
                $entries[] = ['type' => 'checklist', 'name' => (string) $row['component'], 'en' => null, 'category' => (string) $row['section'], 'kit_id' => null, 'field' => '검증 항목 #' . $row['idx'], 'text' => $row['text'], 'verdict' => $verdicts[$row['verdict']] ?? $row['verdict']];
            }
        }
        $isCount = $terms && preg_match('/개수|몇\s?개|최대|이내|갯수/u', $q);
        if ($isCount) {
            // '몇·개·개수' 같은 낱말은 글자 찾기에서 빼고, 대신 숫자·개수 표현이 든 지침만 남긴다
            $nameOnly = array_values(array_filter($terms, static fn (string $t): bool => !preg_match('/^(개수|갯수|몇|개|몇개|최대|이내|제한|까지)$/u', $t)));
            if ($nameOnly) {
                $entries = array_values(array_filter($entries, static function (array $e) use ($nameOnly, $matchAll): bool {
                    return $matchAll(mb_strtolower($e['name'] . ' ' . ($e['en'] ?? '')), $nameOnly) && preg_match('/\d+\s?개|개수|이내로|이하로/u', $e['text']);
                }));
                $terms = [];
            }
        }
        if ($terms) {
            $entries = array_values(array_filter($entries, static function (array $e) use ($terms, $matchAll): bool {
                $hay = mb_strtolower($e['text'] . ' ' . $e['name'] . ' ' . ($e['en'] ?? '') . ' ' . $e['category'] . ' ' . $e['field']);
                return $matchAll($hay, $terms);
            }));
        }
        $hint = null;
        if (!$entries && $comp !== '' && !$terms) {
            $hint = "부품 '{$compAsked}' 에 대응하는 KRDS 컴포넌트 지침이 없습니다(KRDS 55종 밖이거나 shadcn 부품). component 를 빼고 query 로 찾거나 guide_get_checklist 를 보세요.";
        }
        if (!$entries && $terms) {
            $hint = $type === 'pattern'
                ? 'KRDS 기본 패턴 12종(개인 식별 정보 입력·도움·동의·목록 탐색·사용자 피드백·상세 정보 확인·오류·입력폼·첨부 파일·필터링·정렬·확인·모바일)에 이 낱말이 없습니다. type 을 빼고 다시 찾거나 패턴 이름으로 찾으세요.'
                : '일치하는 지침이 없습니다. 더 짧은 낱말이나 다른 표현(예: 초점·오류·대비)으로 찾으세요.';
        }
        // 개수 질문('탭 몇 개'·'탭 개수')은 이름이 겹치는 컴포넌트를 모두 보여 준다 — 탭바(모바일)만 나오고 탭(웹)이 빠지던 것(2026-10-12 MCP 시험)
        $countRules = null;
        if ($isCount) {
            $nameTerms = array_values(array_filter(preg_split('/\s+/u', $q) ?: [], static fn (string $t): bool => !preg_match('/^(개수|갯수|몇|개|몇개|최대|이내|제한|까지)$/u', $t)));
            if ($nameTerms) {
                $countRules = [];
                foreach (Data::krdsComponents()['items'] ?? [] as $c) {
                    $ko = mb_strtolower((string) $c['ko']);
                    $hitName = false;
                    foreach ($nameTerms as $t) if (str_contains($ko, $t)) { $hitName = true; break; }
                    if (!$hitName) continue;
                    $rule = null;
                    foreach ($fields as $f => $label) {
                        foreach ($c[$f] ?? [] as $t) {
                            if (preg_match('/\d+\s?개|개수|이내로|이하로/u', $t)) { $rule = $t; break 2; }
                        }
                    }
                    $countRules[] = [
                        'name' => $c['ko'], 'en' => $c['en'], 'krds_id' => $c['krds_id'] ?: null,
                        // 키트 부품 id(guide_get_component 로 바로 부를 수 있게, tab-bar → tabs)
                        'kit_id' => $c['kit_id'],
                        'scope' => preg_match('/바$/u', (string) $c['ko']) || preg_match('/bar$/i', (string) $c['en']) ? '모바일 하단 탭바' : (str_contains((string) $c['ko'], '탭') ? '페이지 안 탭' : null),
                        'count_rule' => $rule ?? '개수 지침 없음',
                        'has_limit' => $rule !== null,
                    ];
                }
            }
        }
        $byType = array_count_values(array_column($entries, 'type'));
        Response::json(array_slice($entries, 0, $limit), 200, [
            'total' => count($entries),
            'meta' => ['q' => $q, 'hint' => $countRules ? null : $hint, 'component' => $comp ?: null, 'component_asked' => $compAsked !== $comp ? $compAsked : null, 'by_type' => $byType,
                'count_rules' => $countRules, // 개수 질문일 때만 — 이름이 겹치는 컴포넌트마다 개수 지침(없으면 '개수 지침 없음')
                'source' => 'KRDS(대한민국 디지털 정부 디자인 시스템) 공식 지침 · powerGuide 키트 검증 결과', 'guide_url' => 'https://www.krds.go.kr/html/site/component/component_summary.html'],
        ], true);
    });

    $r->get('/guide/checklist', function (array $p, Actor $a) use ($verdicts, $matchAll): void {
        $c = Data::checklist();
        $section = (string) ($_GET['section'] ?? '');
        $verdict = (string) ($_GET['verdict'] ?? '');
        $q = mb_strtolower(trim((string) ($_GET['q'] ?? '')));
        // '접근성' 주제 — 체크리스트 문장에 '접근성' 낱말이 거의 없어 q='접근성' 이 0건이었다(2026-10-12 MCP 시험).
        // 주제 낱말(접근성·a11y·웹접근성·KWCAG·WCAG)은 글자 찾기 대신 접근성 관련 항목(초점·키보드·대비·레이블·대체 텍스트·건너뛰기 등) 묶음으로 바꾼다.
        $topicWords = ['접근성', '웹접근성', '웹 접근성', 'a11y', 'kwcag', 'wcag', 'accessibility'];
        $terms = array_values(array_filter(preg_split('/\s+/u', $q) ?: [], static fn (string $t): bool => $t !== ''));
        $topic = (string) ($_GET['topic'] ?? '');
        if (array_intersect($terms, $topicWords)) {
            $topic = 'a11y';
            $terms = array_values(array_diff($terms, $topicWords));
        }
        $a11yRe = '/키보드|초점|포커스|대비|명도|스크린 ?리더|보조 ?기기|레이블|대체 ?텍스트|\balt\b|읽기 순서|숨긴|음성|접근성|확대|탐색 순서|건너뛰기|aria-|role=|화면 낭독|색상만|색만|kwcag|wcag|tabindex/iu';
        $rows = [];
        foreach ($c['rows'] ?? [] as $row) {
            if ($section !== '' && $row['section'] !== $section) {
                continue;
            }
            if ($verdict !== '' && $row['verdict'] !== $verdict) {
                continue;
            }
            if ($topic === 'a11y' && !preg_match($a11yRe, $row['text'] . ' ' . ($row['fix'] ?? ''))) {
                continue;
            }
            if ($terms && !$matchAll(mb_strtolower($row['text'] . ' ' . $row['component'] . ' ' . ($row['evidence'] ?? '') . ' ' . ($row['fix'] ?? '')), $terms)) {
                continue;
            }
            $rows[] = [
                'idx' => $row['idx'], 'section' => $row['section'], 'component' => str_replace('|', ' · ', (string) $row['component']),
                'text' => $row['text'], 'verdict' => $row['verdict'], 'verdict_label' => $verdicts[$row['verdict']] ?? $row['verdict'],
                'evidence' => $row['evidence'] ?? null, 'fix' => $row['fix'] ?? null,
            ];
        }
        $hint = null;
        if (!$rows && ($q !== '' || $topic !== '' || $section !== '' || $verdict !== '')) {
            $hint = "일치하는 검증 항목이 없습니다. 쓸 수 있는 분류: section = style(스타일)·component(컴포넌트)·pattern(기본 패턴)·service(사이트 담당), "
                . "verdict = " . implode('·', array_keys($verdicts)) . ", 주제 q='접근성'(또는 topic=a11y). 낱말은 '초점'·'레이블'·'건너뛰기'·'대비'처럼 짧게 찾으세요.";
        }
        Response::json($rows, 200, [
            'total' => count($rows),
            'meta' => [
                'q' => $q, 'topic' => $topic ?: null, 'hint' => $hint,
                'topics' => ['a11y' => '접근성(초점·키보드·대비·레이블·대체 텍스트·건너뛰기·보조기기) — q 에 접근성·a11y·웹접근성·KWCAG·WCAG 를 넣어도 같습니다.'],
                'checked_at' => $c['at'] ?? null, 'summary' => $c['summary'] ?? [], 'verdicts' => $verdicts,
                'sections' => ['style' => '스타일', 'component' => '컴포넌트', 'pattern' => '기본 패턴', 'service' => '서비스(사이트 담당)'],
                'note' => 'KRDS 자체 검증 체크리스트를 powerGuide 키트에 적용한 결과입니다. "사이트 담당" 항목은 부품이 아니라 그 부품을 쓰는 사이트가 지켜야 합니다.',
            ],
        ], true);
    });

    $r->post('/guide/check/code', function (array $p, Actor $a): void {
        $in = Response::input();
        $html = (string) ($in['html'] ?? '');
        $css = (string) ($in['css'] ?? '');
        if (trim($html) === '') {
            throw HttpError::invalid('html 이 비어 있습니다.', '판정할 HTML(또는 HTML 조각)을 html 에 넣으세요. 따로 둔 CSS 는 css 에.');
        }
        if (strlen($html) > 400_000 || strlen($css) > 200_000) {
            throw HttpError::invalid('너무 큽니다(html 400KB · css 200KB 이하).', '판정할 화면이나 부품 하나만 보내세요.');
        }
        Response::json(CodeCheck::run($html, $css));
    });
};
