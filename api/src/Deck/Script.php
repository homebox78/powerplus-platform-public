<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Db;
use Pp\Core\Config;
use Pp\Core\Response;
use Pp\Core\HttpError;

/*
 * 출처: powerDeck api/src/Script.php (D:\powerDeck, 2026-10-06 이식). 로직·JSON 모양은 그대로 두고
 * 전역 Db/Config/fail/json_out → Pp\Core(Db·Config·Response·HttpError) 어댑터(Legacy), 테이블은 deck_ 접두, 설정은 Config 'deck.<key>' 로 바꿨다.
 */
/**
 * 발표 대본 — 확정된 장표의 장마다 읽을 말과, 발표자가 들고 가는 대본 문서를 만든다.
 * 대본은 mockup/script.json 에 둔다:
 *   { made_at, model, goal(목표 초), slides: [{ n, title, sec(배정 초), keep, screen, cues[], lines[], notes[], cut }],
 *     brief: { thesis, lede, parts:[{name, from, to, aim, never_cut}], checklist:{때:[..]}, recover:[{s, sign, act}], facts:[{k, v}] } }
 * 내보내는 것 둘: 대본 문서(script.html — 구간·시간·남길 문장·화면·점검·어긋났을 때·예상 질문)와 노래방식 연습 화면(practice.html).
 */
final class Script
{
    private const SYSTEM = <<<'T'
너는 공공·SI 제안 발표의 대본 작가다. 발표자가 손에 들고 **그대로 소리 내어 읽는** 대본을 쓴다.
기준은 잘 쓴 사내 발표 대본이다 — 짧고 단정한 문장, 구체적인 말, 군더더기 없음. 듣는 사람은 평가위원이다.

장마다 다음을 쓴다.
- keep(남길 문장): 이 장이 끝났을 때 평가위원 머리에 남아야 할 **한 문장**(25~50자). 시간이 모자라 다른 말을 다 빼도 이 문장은 말한다. lines 안에도 그대로 들어 있어야 한다.
- screen(화면): 이 장에서 화면에 무엇이 떠 있고 어디로 시선을 모을지 한 줄. 예: "3단 흐름도. 가운데 '통합 신청' 칸을 가리킨다"
- cues(동작): 꼭 필요한 것만 0~3개. 대괄호 동작 + 대상. 예: "[가리킨다] 오른쪽 표의 처리 기간 열", "[멈춤] 53% 를 말한 뒤 한 박자", "[넘김] 마지막 문장과 함께"
- lines(읽을 말): 아래 말투·형식 규칙대로.
- notes(말하는 법): 이 장에서 발표자가 실수하기 쉬운 것 0~2개. 예: "숫자는 천천히, 53퍼센트 뒤에 한 박자 쉰다", "약점을 먼저 인정하고 대책으로 넘어간다". '자신감 있게' 같은 뻔한 말은 쓰지 않는다.
- cut(줄이는 법): 시간이 모자랄 때 이 장을 어떻게 줄이는지 한 줄. 예: "근거 두 번째 문장을 빼고 남길 문장으로 바로 넘어간다"

말투:
- 합니다체 구어. 한 문장 40자 안팎, 길면 둘로 나눈다. 결론을 문장 앞에.
- 장표 글을 읽어 주지 않는다. 장표의 숫자·이름을 다 말하지 않는다 — **핵심 수치 2~3개만** 골라 짚고, 나머지는 화면에 맡긴다. 그래서 무엇이 달라지는지를 말한다.
- 화면의 목록을 하나씩 나열하지 않는다(첫째·둘째·셋째… 로 그대로 읽지 않는다). 묶어서 한 문장으로 말하고, 가장 중요한 하나만 풀어 말한다.
- 장마다 첫 문장은 그 장의 결론. 근거 2~3가지. 끝은 다음 장으로 잇는 한마디(마지막 장 제외).
- 쓰지 않는 말: 혁신적, 획기적, 최고의, 극대화, 시너지, 원스톱, 고도화된, "~할 것으로 기대됩니다", "다음 장표를 보시면", "보시는 바와 같이", "말씀드리겠습니다"의 반복. 과장 대신 근거, 약속 대신 방법.
- 약속은 단정형으로: "할 수 있습니다", "고려하겠습니다", "검토하겠습니다", "예정입니다", "가능합니다" 대신 "합니다", "하겠습니다"와 수치·기한. 제안요청서가 이런 표현을 이행 불가로 보는 경우가 많다.
- 발표자는 PM 본인이다 — 1인칭("저는 이 사업의 PM으로서")으로 책임을 말한다. 사업 요약의 발표 규정이 블라인드 평가면 회사명·제품명 대신 "저희 제안사"로 부른다.
- 수치·고유명사·실적은 주어진 자료에 있는 것만 쓴다(지어내지 않는다). 없으면 그 문장을 쓰지 않는다.
- 전체의 첫 장은 인사 없이 바로 문제로 시작한다. 전체의 마지막 장은 요청·약속 한두 문장 뒤 "감사합니다."로 끝낸다.
- 장마다 주어진 **목표 초**에 맞춘다(공백 포함 대략 주어진 글자 수). 목표보다 짧은 건 괜찮고 넘치면 안 된다.

lines 형식:
- 한 항목은 **한 문장**(25~60자)이다. 문장 중간에서 끊지 않는다. 줄 안에 줄바꿈·마크다운·괄호 지문을 넣지 않는다.
- 빈 줄("")은 **생각이 바뀌는 곳에만** 넣는다(결론 뒤, 근거 묶음 뒤 — 한 장에 1~3개). 문장마다 넣지 않는다.
- 힘줘 말할 낱말·구절은 `**이렇게**` 감싼다 — 장마다 2~4곳(핵심 수치, 결론, 우리만의 강점). 줄 전체를 감싸지 않는다.

JSON 만 출력한다: {"slides":[{"n":1,"keep":"…","screen":"…","cues":["[가리킨다] …"],"lines":["…","…",""],"notes":["…"],"cut":"…"}]}
T;

    /** 대본 문서의 앞뒤 — 장별 대본을 다 쓴 뒤 한 번 만든다 */
    private const BRIEF_SYSTEM = <<<'T'
너는 공공 입찰 제안 발표의 코치다. 장별 대본을 다 쓴 발표를 보고, 발표자가 들고 갈 **대본 문서의 앞과 뒤**를 만든다.
- thesis: 발표 전체를 한 문장으로(30~50자). 문서 맨 위 제목이다. 평가위원이 발표장을 나가며 기억할 말.
- lede: 이 발표를 어떻게 끌고 가는지 2~3문장 — 무엇을 먼저 보이고, 어디에 시간을 가장 많이 쓰고, 남는 시간은 어디에 쓰는지. 발표자에게 하는 말(합니다체).
- parts: 장을 순서대로 4~8개 구간으로 묶는다. [{"name":"문제 제기","from":1,"to":2,"aim":"이 구간이 끝나면 평가위원이 알아야 할 것 한 줄","never_cut":false}] — 쪽 번호가 빠짐없이 이어져야 한다. 결론·요청 구간은 never_cut true.
- checklist: 발표 전 점검. {"전날":[3~5개],"당일 아침":[2~4개],"시작 10분 전":[3~5개],"연결 직후":[2~4개]} — **이 발표에 맞춘** 구체적인 할 일. 대본에 나온 수치·이름 중 확인이 필요한 것은 "6쪽 처리 기간 수치를 최신 자료와 대조"처럼 콕 집는다. 파일 백업(PDF·USB), 발표·질의 시간 재확인, 발표장 PC에서 서체·그림 깨짐 확인, 리모컨 같은 기본도 넣되 일반론으로 채우지 않는다.
- recover: 어긋났을 때 4~6개 [{"s":"상황","sign":"알아채는 조짐","act":"그 자리에서 할 일(구체적으로, 해명하지 않는다)"}]. 반드시 넣는다: 시간 초과(어느 구간을 몇 초로 줄이고 어느 구간은 줄이지 않는지 이 발표의 구간 이름으로), 발표 중간에 질문이 끼어듦, 화면·파일 문제, 수치·이름이 생각나지 않음.
- facts: 자료(사업 요약)에 발표 조건이 있으면 0~3개 [{"k":"발표 시간","v":"20분 + 질의 10분"}] — 자료에 없으면 빈 배열.
수치·이름은 주어진 대본·자료에 있는 것만 쓴다. JSON 만 출력한다: {"thesis":"…","lede":"…","parts":[…],"checklist":{…},"recover":[…],"facts":[…]}
T;

    /** 발표 Q&A — 평가위원이 던질 압박 질문과 30초 답변. 근거는 장표·기획·사업 요약에 있는 것만 */
    private const QA_SYSTEM = <<<'T'
너는 공공 입찰 제안 발표의 Q&A 코치다. 평가위원이 발표 직후 던질 **압박 질문**과 발표자가 바로 말할 **답변**을 준비한다.
- 질문 8~10개. 반드시 포함: 실행 가능성("정말 이 일정·인력으로 됩니까?"), 기대효과를 숫자로, 예산·인력 배분, 일정·위험 대응, 경쟁사(기존 방식) 대비 차별성, 유사 실적, 그리고 사업 요약의 'RFP 해독'에서 발주처가 걱정하는 것. 배점이 큰 평가 항목마다 질문이 적어도 하나 가게 한다.
- 답변은 합니다체 구어 2~4문장(약 30초). 첫 문장에 결론. 근거는 장표 글·기획·사업 요약에 있는 수치·이름·실적만 쓴다(지어내지 않는다). 근거가 자료에 없으면 답을 꾸미지 말고 need 에 '준비할 것'을 적는다.
- 약점을 묻는 질문은 인정하고 극복 방안으로 답한다. slide 는 답의 근거가 되는 장 번호(없으면 0).
JSON 만 출력한다: {"qa":[{"q":"질문","a":"답변","slide":3,"kind":"실행 가능성|기대효과|예산·인력|일정·위험|차별성|실적|발주처 우려|기타","need":"(근거가 없을 때만) 준비할 자료"}]}
T;

    /** 읽는 속도(초당 글자, 공백·** 제외)와 쉼 — 연습 화면(script_player.html)과 같은 값 */
    private const CPS = 5.5, GAP = 0.45, REST = 1.0, SGAP = 1.2;

    public static function qaPath(string $id): string
    {
        return Jobs::dir($id, 'mockup') . '/qa.json';
    }

    public static function qaLoad(string $id): ?array
    {
        $p = self::qaPath($id);
        $d = is_file($p) ? json_decode((string) file_get_contents($p), true) : null;
        return is_array($d) && !empty($d['qa']) ? $d : null;
    }

    /** 장마다 완성 장표의 글(워커가 올림) — 없으면 기획 내용 */
    private static function deckText(string $id): array
    {
        $deck = [];
        $dp = Jobs::dir($id, 'mockup') . '/deck_text.json';
        foreach ((is_file($dp) ? json_decode((string) file_get_contents($dp), true) : null) ?: [] as $d) $deck[(int) ($d['n'] ?? 0)] = (string) ($d['text'] ?? '');
        return $deck;
    }

    private static function planOf(array $j): ?array
    {
        $plan = is_array($j['plan'] ?? null) ? $j['plan'] : json_decode((string) ($j['plan'] ?? ''), true);
        return $plan && !empty($plan['slides']) ? $plan : null;
    }

    private static function context(string $id): string
    {
        $ctx = Jobs::dir($id, 'mockup') . '/context.md';
        return is_file($ctx) ? (string) file_get_contents($ctx) : '';
    }

    private static function json(array $d): ?array
    {
        $out = json_decode(AiKeys::jsonClean((string) ($d['choices'][0]['message']['content'] ?? '')), true);
        return is_array($out) ? $out : null;
    }

    /** 예상 질문 만들기 — 장표 전체(제목·전달할 것·장표 글)와 사업 요약(RFP 해독)을 한 번에 본다 */
    public static function qa(array $j, array $b): array
    {
        if (($j['kind'] ?? '') !== 'design' || $j['status'] !== 'done') Legacy::fail('장표가 완성된 뒤에 예상 질문을 만들 수 있습니다.', 409);
        $id = (string) $j['id'];
        $plan = self::planOf($j);
        if (!$plan) Legacy::fail('이 작업에는 기획이 없습니다.', 409);
        $deck = self::deckText($id);
        $src = [];
        foreach ($plan['slides'] as $s) {
            $n = (int) ($s['n'] ?? 0);
            $src[] = '## ' . $n . '쪽 — ' . str_replace('**', '', (string) ($s['title'] ?? '')) . "\n전달할 것: " . ($s['message'] ?? '') . "\n"
                . mb_substr(isset($deck[$n]) && trim($deck[$n]) !== '' ? $deck[$n] : (string) ($s['content'] ?? ''), 0, 700);
        }
        $ctx = self::context($id);
        $user = '발표 제목: ' . (($plan['title'] ?? '') ?: $j['title']) . (!empty($plan['core']) ? "\n핵심 한 문장: " . $plan['core'] : '')
            . ($ctx !== '' ? "\n\n# 사업 요약(자료에서 뽑은 것)\n" . mb_substr($ctx, 0, 9000) : '')
            . "\n\n# 장표\n" . mb_substr(implode("\n\n", $src), 0, 24000)
            . (trim((string) ($b['note'] ?? '')) !== '' ? "\n\n발표자 요청: " . mb_substr(trim((string) $b['note']), 0, 500) : '');
        $d = AiKeys::ask($j, 'script', [
            'messages' => [['role' => 'system', 'content' => self::QA_SYSTEM . self::langRule($j)], ['role' => 'user', 'content' => $user]],
            'response_format' => ['type' => 'json_object'], 'max_tokens' => 5000,
        ]);
        $out = self::json($d);
        $qa = [];
        foreach ((array) ($out['qa'] ?? []) as $x) {
            if (!is_array($x) || trim((string) ($x['q'] ?? '')) === '') continue;
            $qa[] = ['q' => mb_substr(trim((string) $x['q']), 0, 300), 'a' => mb_substr(trim((string) ($x['a'] ?? '')), 0, 1200), 'slide' => (int) ($x['slide'] ?? 0),
                     'kind' => mb_substr((string) ($x['kind'] ?? ''), 0, 20), 'need' => mb_substr(trim((string) ($x['need'] ?? '')), 0, 300)];
        }
        if (!$qa) Legacy::fail('예상 질문을 만들지 못했습니다. 다시 눌러 주세요.', 502);
        file_put_contents(self::qaPath($id), json_encode(['made_at' => date('Y-m-d H:i:s'), 'qa' => $qa], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        Jobs::event($id, 'info', '발표 예상 질문 ' . count($qa) . '개');
        return ['ok' => true, 'script' => self::info($id, $j)];
    }

    /**
     * 줄 정리 — 빈 줄("")은 쉼(숨 고르는 자리)이다. 맨 앞·맨 뒤·연달은 빈 줄은 없앤다.
     * 쉼이 하나도 없는 대본이면(auto) 세 문장마다 쉼을 넣는다 — 줄줄이 붙어 랩처럼 읽히지 않게.
     */
    public static function paused(array $lines, bool $auto = true): array
    {
        $lines = array_map(static fn($l) => trim((string) $l), $lines);
        $has = in_array('', $lines, true);
        $out = [];
        $ends = 0;
        foreach ($lines as $l) {
            if ($l === '') { if ($out && end($out) !== '') $out[] = ''; continue; }
            $out[] = $l;
            // 쉼이 없는 대본이면 세 문장마다 한 번 쉰다(문장마다 쉬면 줄이 너무 잘게 갈라진다)
            if ($auto && !$has && preg_match('/[.?!。…]["”’)]?$/u', $l) && ++$ends % 3 === 0) $out[] = '';
        }
        while ($out && end($out) === '') array_pop($out);
        return $out;
    }

    /** 읽는 데 걸리는 초 — 연습 화면과 같은 셈(글자/속도 + 줄 사이 쉼 + 빈 줄 쉼 + 장 넘김) */
    public static function secOf(array $lines): float
    {
        $t = self::SGAP;
        foreach ($lines as $l) {
            $l = (string) $l;
            $t += self::GAP + ($l === '' ? self::REST : max(0.8, mb_strlen((string) preg_replace('/[\s*]/u', '', $l)) / self::CPS));
        }
        return $t;
    }

    public static function path(string $id): string
    {
        return Jobs::dir($id, 'mockup') . '/script.json';
    }

    public static function load(string $id): ?array
    {
        $p = self::path($id);
        $d = is_file($p) ? json_decode((string) file_get_contents($p), true) : null;
        if (!is_array($d) || empty($d['slides'])) return null;
        foreach ($d['slides'] as &$s) $s['lines'] = self::paused((array) ($s['lines'] ?? []));   // 쉼이 없는 예전 대본도 문장 끝에서 쉬게
        unset($s);
        return $d;
    }

    private static function store(string $id, array $doc): void
    {
        file_put_contents(self::path($id), json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    /** 목표 발표 시간(분) — 요청 값 > 지난 대본 > 자료(사업 요약)의 '발표 N분' > 15분 */
    private static function goalMin(string $id, array $b, ?array $doc): int
    {
        $m = (int) ($b['minutes'] ?? 0);
        if ($m >= 3 && $m <= 90) return $m;
        if (!empty($doc['goal'])) return (int) round($doc['goal'] / 60);
        // 정하지 않으면 장마다 기본 분량(PER_SLIDE 초)으로 — 자료의 '발표 20분'은 전체 덱 기준이라 몇 장만 만든 작업에 나누면 한 장이 몇 분짜리가 된다
        return max(3, (int) ceil(max(1, (int) ($b['_slides'] ?? 0)) * self::PER_SLIDE / 60));
    }

    /** 한 번에 만드는 장 수 — 화면이 이만큼씩 나눠 부른다(장이 많아도 시간 제한에 걸리지 않게) */
    public const BATCH = 8;
    /** 한 장의 기본 발표 분량(초) — 제안 발표는 보통 한 장 1분 안팎 */
    public const PER_SLIDE = 60;
    /** 한 장에 쓸 수 있는 최대(초) — 전체 시간을 장 수로 나눠도 이보다 길게 쓰지 않는다 */
    public const MAX_SLIDE = 100;

    private const LANG_NAMES = ['en' => '영어', 'ja' => '일본어', 'zh' => '중국어(간체)', 'fr' => '프랑스어', 'es' => '스페인어', 'de' => '독일어', 'vi' => '베트남어'];

    /** 작업의 제작 언어가 한국어가 아니면 대본·질문을 그 언어로 쓰라는 규칙 */
    private static function langRule(array $j): string
    {
        $o = is_array($j['opts'] ?? null) ? $j['opts'] : (json_decode((string) ($j['opts'] ?? ''), true) ?: []);
        $name = self::LANG_NAMES[(string) ($o['lang'] ?? 'ko')] ?? null;
        if (!$name) return '';
        return "\n\n# 제작 언어 = {$name}\n발표 대본·예상 질문·답변·제목은 모두 {$name}로 쓴다. 한국어 문장을 섞지 않는다. JSON 키와 형식은 위 지시 그대로.";
    }

    /**
     * 대본 만들기. only(쪽 번호 배열)를 주면 그 장만 만들어 기존 대본에 합친다 — 최대 BATCH 장.
     * 목표 시간(minutes)을 장마다 나눠(글이 많은 장에 조금 더) 장마다 '목표 초'를 준다. 끝의 여유는 남겨 둔다.
     * 글은 완성 장표의 글(mockup/deck_text.json, 워커가 올림)을 우선 쓰고, 없으면 기획 내용을 쓴다.
     */
    public static function make(array $j, array $b): array
    {
        if (!empty($b['qa'])) return self::qa($j, $b);       // 예상 질문
        if (!empty($b['brief'])) return self::brief($j, $b); // 대본 문서의 앞뒤
        if (($j['kind'] ?? '') !== 'design') Legacy::fail("발표 대본은 '내용으로 장표 만들기' 작업에서만 만들 수 있습니다.", 409);
        if ($j['status'] !== 'done') Legacy::fail('장표가 완성된 뒤에 대본을 만들 수 있습니다.', 409);
        $id = (string) $j['id'];
        $plan = self::planOf($j);
        if (!$plan) Legacy::fail('이 작업에는 기획이 없어 대본을 만들 수 없습니다.', 409);
        $deck = self::deckText($id);
        $only = array_values(array_unique(array_map('intval', (array) ($b['only'] ?? []))));
        $all = array_map(static fn($s) => (int) ($s['n'] ?? 0), $plan['slides']);
        $want = $only ? array_values(array_intersect($all, $only)) : $all;
        if (!$want) Legacy::fail('만들 장이 없습니다.');
        if (count($want) > self::BATCH) Legacy::fail('대본은 한 번에 ' . self::BATCH . '장까지 만듭니다. 나눠서 요청해 주세요.', 400);
        $old = !empty($b['keep']) ? self::load($id) : null;
        $goal = self::goalMin($id, $b + ['_slides' => count($all)], $old ?? self::load($id)) * 60;
        $goal = min($goal, count($all) * self::MAX_SLIDE + 30);   // 한 장이 몇 분짜리가 되지 않게

        // 장마다 목표 초 — 여유(8%, 최소 30초)를 빼고, 글이 많은 장에 조금 더(0.7~1.5배)
        $len = [];
        foreach ($plan['slides'] as $s) {
            $n = (int) ($s['n'] ?? 0);
            $len[$n] = mb_strlen(isset($deck[$n]) && trim($deck[$n]) !== '' ? $deck[$n] : (string) ($s['content'] ?? ''));
        }
        $avg = max(1, array_sum($len) / max(1, count($len)));
        $w = array_map(static fn($l) => 0.7 + 0.4 * min(2, $l / $avg), $len);
        $speak = $goal - max(30, $goal * 0.08);
        $sec = [];
        foreach ($w as $n => $x) $sec[$n] = max(20, (int) round($speak * $x / array_sum($w) / 5) * 5);

        $src = [];
        $titles = [];
        $last = end($all);
        foreach ($plan['slides'] as $i => $s) {
            $n = (int) ($s['n'] ?? 0);
            $titles[$n] = str_replace('**', '', (string) ($s['title'] ?? ''));
            if (!in_array($n, $want, true)) continue;
            $body = isset($deck[$n]) && trim($deck[$n]) !== '' ? "완성 장표의 글:\n" . mb_substr($deck[$n], 0, 1800) : "내용:\n" . mb_substr((string) ($s['content'] ?? ''), 0, 1800);
            $src[] = '## ' . $n . '쪽 (전체 ' . count($all) . '장 중 ' . ($i + 1) . '번째' . ($i === 0 ? ' — 전체의 첫 장' : ($n === $last ? ' — 전체의 마지막 장' : '')) . ') — ' . $titles[$n]
                . "\n목표: " . $sec[$n] . '초 (읽을 말 공백 포함 약 ' . (int) round($sec[$n] * 4.6) . '자)'
                . "\n전달할 것: " . ($s['message'] ?? '') . "\n장면: " . ($s['scene'] ?? '') . "\n" . $body;
        }
        $note = trim(mb_substr((string) ($b['note'] ?? ''), 0, 500));
        $toc = implode(' / ', array_map(static fn($n) => $n . '. ' . mb_substr($titles[$n], 0, 24), $all));
        $user = '발표 제목: ' . (($plan['title'] ?? '') ?: $j['title']) . (!empty($plan['core']) ? "\n핵심 한 문장: " . $plan['core'] : '')
            . "\n목표 발표 시간: " . ($goal / 60) . "분\n전체 흐름: " . $toc . ($note !== '' ? "\n발표자 요청: $note" : '')
            . "\n\n아래 " . count($src) . "장의 대본만 쓴다(n 은 쪽 번호 그대로).\n\n" . implode("\n\n", $src);
        $d = AiKeys::ask($j, 'script', [
            'messages' => [['role' => 'system', 'content' => self::SYSTEM . self::langRule($j)], ['role' => 'user', 'content' => $user]],
            'response_format' => ['type' => 'json_object'], 'max_tokens' => 750 * count($src) + 800,
        ]);
        $out = self::json($d);
        if (!$out || empty($out['slides'])) Legacy::fail('대본을 만들지 못했습니다. 다시 눌러 주세요.', 502);
        $doc = $old ?? ['slides' => []];
        $by = [];
        foreach ($doc['slides'] as $s) $by[(int) $s['n']] = $s;
        $str = static fn($v, int $max) => mb_substr(trim((string) preg_replace('/\s+/u', ' ', (string) $v)), 0, $max);
        $list = static fn($v, int $k, int $max) => array_values(array_filter(array_map(static fn($x) => mb_substr(trim((string) $x), 0, $max), array_slice((array) $v, 0, $k)), 'strlen'));
        foreach ($out['slides'] as $s) {
            $n = (int) ($s['n'] ?? 0);
            $lines = self::paused(array_map(static fn($l) => (string) preg_replace('/\s+/u', ' ', (string) $l), (array) ($s['lines'] ?? [])));
            if (!$lines || !in_array($n, $want, true)) continue;
            $by[$n] = ['n' => $n, 'title' => $titles[$n] ?? '', 'sec' => $sec[$n], 'keep' => $str($s['keep'] ?? '', 160), 'screen' => $str($s['screen'] ?? '', 200),
                       'cues' => $list($s['cues'] ?? [], 3, 120), 'lines' => $lines, 'notes' => $list($s['notes'] ?? [], 2, 160), 'cut' => $str($s['cut'] ?? '', 160)];
        }
        if (!$by) Legacy::fail('대본이 비어 있습니다. 다시 눌러 주세요.', 502);
        ksort($by);
        $doc['made_at'] = date('Y-m-d H:i:s');
        $doc['model'] = $d['model'] ?? '';
        $doc['goal'] = $goal;
        $doc['slides'] = array_values($by);
        if (empty($b['keep'])) unset($doc['brief']);   // 처음부터 다시 쓰면 앞뒤도 다시
        self::store($id, $doc);
        Jobs::event($id, 'info', '발표 대본 생성 — ' . implode(',', $want) . '쪽');
        return ['ok' => true, 'script' => self::info($id, $j)];
    }

    /** 대본 문서의 앞뒤 — 한 문장 요약, 진행 방법, 구간, 발표 전 점검, 어긋났을 때 */
    public static function brief(array $j, array $b): array
    {
        $id = (string) $j['id'];
        $doc = self::load($id);
        if (!$doc) Legacy::fail('먼저 대본을 만들어 주세요.', 409);
        $plan = self::planOf($j) ?? ['slides' => []];
        $sec = 0;
        $src = [];
        foreach ($doc['slides'] as $s) {
            $t = self::secOf($s['lines']);
            $src[] = '## ' . $s['n'] . '쪽 — ' . $s['title'] . ' (' . self::mmss($sec) . ' 시작, ' . (int) round($t) . "초)\n남길 문장: " . ($s['keep'] ?? '')
                . "\n대본: " . mb_substr(str_replace('**', '', implode(' ', array_filter($s['lines'], 'strlen'))), 0, 600);
            $sec += $t;
        }
        $ctx = self::context($id);
        $user = '발표 제목: ' . (($plan['title'] ?? '') ?: $j['title']) . (!empty($plan['core']) ? "\n핵심 한 문장: " . $plan['core'] : '')
            . "\n목표 시간: " . self::mmss((float) ($doc['goal'] ?? 900)) . ' · 대본 길이: ' . self::mmss($sec)
            . ($ctx !== '' ? "\n\n# 사업 요약(자료에서 뽑은 것)\n" . mb_substr($ctx, 0, 6000) : '')
            . "\n\n# 장별 대본\n" . mb_substr(implode("\n\n", $src), 0, 26000);
        $d = AiKeys::ask($j, 'script', [
            'messages' => [['role' => 'system', 'content' => self::BRIEF_SYSTEM . self::langRule($j)], ['role' => 'user', 'content' => $user]],
            'response_format' => ['type' => 'json_object'], 'max_tokens' => 4000,
        ]);
        $o = self::json($d);
        if (!$o) Legacy::fail('대본 문서의 앞뒤를 만들지 못했습니다. 다시 눌러 주세요.', 502);
        $ns = array_map(static fn($s) => (int) $s['n'], $doc['slides']);
        $parts = [];
        foreach ((array) ($o['parts'] ?? []) as $p) {
            if (!is_array($p) || trim((string) ($p['name'] ?? '')) === '') continue;
            $parts[] = ['name' => mb_substr(trim((string) $p['name']), 0, 30), 'from' => (int) ($p['from'] ?? 0), 'to' => (int) ($p['to'] ?? 0),
                        'aim' => mb_substr(trim((string) ($p['aim'] ?? '')), 0, 160), 'never_cut' => !empty($p['never_cut'])];
        }
        $chk = [];
        foreach ((array) ($o['checklist'] ?? []) as $k => $v) {
            $items = array_values(array_filter(array_map(static fn($x) => mb_substr(trim((string) $x), 0, 160), array_slice((array) $v, 0, 6)), 'strlen'));
            if ($items) $chk[mb_substr((string) $k, 0, 20)] = $items;
        }
        $rec = [];
        foreach (array_slice((array) ($o['recover'] ?? []), 0, 7) as $r) {
            if (is_array($r) && trim((string) ($r['s'] ?? '')) !== '')
                $rec[] = ['s' => mb_substr(trim((string) $r['s']), 0, 40), 'sign' => mb_substr(trim((string) ($r['sign'] ?? '')), 0, 120), 'act' => mb_substr(trim((string) ($r['act'] ?? '')), 0, 300)];
        }
        $facts = [];
        foreach (array_slice((array) ($o['facts'] ?? []), 0, 3) as $f) if (is_array($f) && trim((string) ($f['k'] ?? '')) !== '') $facts[] = ['k' => mb_substr((string) $f['k'], 0, 20), 'v' => mb_substr((string) ($f['v'] ?? ''), 0, 60)];
        $doc['brief'] = ['thesis' => mb_substr(trim((string) ($o['thesis'] ?? '')), 0, 120), 'lede' => mb_substr(trim((string) ($o['lede'] ?? '')), 0, 500),
                         'parts' => self::fixParts($parts, $ns), 'checklist' => $chk, 'recover' => $rec, 'facts' => $facts, 'made_at' => date('Y-m-d H:i:s')];
        self::store($id, $doc);
        return ['ok' => true, 'script' => self::info($id, $j)];
    }

    /** 구간이 쪽을 빠짐없이 순서대로 덮게 고친다 — 어긋나면 기획의 section 으로 묶는다(fallback) */
    private static function fixParts(array $parts, array $ns): array
    {
        $out = [];
        $i = 0;
        foreach ($parts as $p) {
            $take = [];
            while ($i < count($ns) && $ns[$i] <= $p['to']) $take[] = $ns[$i++];
            if ($take) $out[] = ['name' => $p['name'], 'aim' => $p['aim'], 'never_cut' => $p['never_cut'], 'ns' => $take];
        }
        if ($i < count($ns)) {
            if ($out) $out[count($out) - 1]['ns'] = array_merge($out[count($out) - 1]['ns'], array_slice($ns, $i));
            else return [];
        }
        return $out;
    }

    private static function mmss(float $s): string
    {
        $s = (int) round($s);
        return intdiv($s, 60) . ':' . str_pad((string) ($s % 60), 2, '0', STR_PAD_LEFT);
    }

    /** 사용자가 고친 대본 저장 — 읽을 말과 남길 문장 */
    public static function save(array $j, array $b): array
    {
        $doc = self::load((string) $j['id']);
        if (!$doc) Legacy::fail('대본이 없습니다.', 404);
        $by = [];
        foreach ((array) ($b['slides'] ?? []) as $s) $by[(int) ($s['n'] ?? 0)] = $s;
        foreach ($doc['slides'] as &$s) {
            $x = $by[$s['n']] ?? null;
            if (!$x) continue;
            $lines = self::paused(array_map(static fn($l) => mb_substr((string) $l, 0, 200), (array) ($x['lines'] ?? [])), false);
            if ($lines) $s['lines'] = $lines;
            if (isset($x['keep'])) $s['keep'] = mb_substr(trim((string) $x['keep']), 0, 160);
        }
        unset($s);
        $doc['made_at'] = date('Y-m-d H:i:s');   // 손으로 고친 것도 '지금 판 기준'으로 본다
        self::store((string) $j['id'], $doc);
        return ['ok' => true, 'script' => self::info((string) $j['id'], $j)];
    }

    /** stale = 대본을 만든 뒤 장표를 다시 제작했다(대본이 예전 판 기준) */
    public static function info(string $id, ?array $j = null): ?array
    {
        $d = self::load($id);
        $q = self::qaLoad($id);
        if (!$d) return $q ? ['made_at' => '', 'slides' => [], 'chars' => 0, 'stale' => false, 'batch' => self::BATCH, 'qa' => $q['qa'], 'none' => true] : null;
        $chars = 0;
        $total = 0.0;
        foreach ($d['slides'] as $s) { $chars += mb_strlen(implode('', $s['lines'])); $total += self::secOf($s['lines']); }
        $stale = $j && !empty($j['finished_at']) && strtotime((string) $j['finished_at']) > strtotime((string) $d['made_at']) + 5;
        return ['made_at' => $d['made_at'], 'slides' => $d['slides'], 'chars' => $chars, 'sec' => (int) round($total), 'goal' => (int) ($d['goal'] ?? 0),
                'brief' => !empty($d['brief']), 'stale' => (bool) $stale, 'batch' => self::BATCH, 'qa' => $q['qa'] ?? []];
    }

    /** 대본 문서에 들어갈 것 전부 — 구간(없으면 기획의 section 으로 묶음)·시작 시각·점검·어긋났을 때·예상 질문 */
    private static function docData(array $j, bool $img): ?array
    {
        $id = (string) $j['id'];
        $d = self::load($id);
        if (!$d) return null;
        $plan = self::planOf($j) ?? ['slides' => []];
        $secOf = [];
        foreach ($plan['slides'] as $s) $secOf[(int) ($s['n'] ?? 0)] = trim((string) ($s['section'] ?? ''));
        $br = $d['brief'] ?? [];
        $parts = $br['parts'] ?? [];
        if (!$parts) {   // 앞뒤를 아직 안 만들었으면 기획의 section 으로 묶는다
            foreach ($d['slides'] as $s) {
                $name = ($secOf[$s['n']] ?? '') ?: $s['n'] . '쪽';
                if ($parts && $parts[count($parts) - 1]['name'] === $name) $parts[count($parts) - 1]['ns'][] = $s['n'];
                else $parts[] = ['name' => $name, 'aim' => '', 'never_cut' => false, 'ns' => [$s['n']]];
            }
            $parts[count($parts) - 1]['never_cut'] = true;
        }
        $by = [];
        foreach ($d['slides'] as $s) $by[$s['n']] = $s;
        $t = 0.0;
        $outParts = [];
        foreach ($parts as $p) {
            $ps = ['name' => $p['name'], 'aim' => $p['aim'], 'never_cut' => $p['never_cut'], 'start' => (int) round($t), 'slides' => []];
            foreach ($p['ns'] as $n) {
                if (!isset($by[$n])) continue;
                $s = $by[$n];
                $sec = self::secOf($s['lines']);
                $ps['slides'][] = ['n' => $n, 'title' => $s['title'], 'start' => (int) round($t), 'sec' => (int) round($sec), 'goal' => (int) ($s['sec'] ?? 0),
                                   'keep' => $s['keep'] ?? '', 'screen' => $s['screen'] ?? '', 'cues' => $s['cues'] ?? [], 'lines' => $s['lines'],
                                   'notes' => $s['notes'] ?? [], 'cut' => $s['cut'] ?? '', 'img' => $img ? self::img($id, $n, 560) : ''];
                $t += $sec;
            }
            $ps['sec'] = (int) round($t) - $ps['start'];
            if ($ps['slides']) $outParts[] = $ps;
        }
        $goal = (int) ($d['goal'] ?? 0) ?: (int) (ceil($t / 60) * 60);
        $q = self::qaLoad($id);
        return ['id' => $id, 'title' => (string) $j['title'], 'made' => substr((string) $d['made_at'], 0, 10),
                'thesis' => ($br['thesis'] ?? '') ?: str_replace('**', '', (string) (($plan['core'] ?? '') ?: (($plan['title'] ?? '') ?: $j['title']))),
                'lede' => $br['lede'] ?? '', 'facts' => $br['facts'] ?? [], 'goal' => $goal, 'total' => (int) round($t), 'count' => count($d['slides']),
                'parts' => $outParts, 'checklist' => ($br['checklist'] ?? []) ?: self::defaultChecklist(), 'recover' => ($br['recover'] ?? []) ?: self::defaultRecover($outParts),
                'qa' => $q['qa'] ?? [], 'brief' => !empty($br)];
    }

    private static function defaultChecklist(): array
    {
        return [
            '전날' => ['발표 파일을 PDF 로도 저장해 USB 와 메일 두 곳에 둔다', '대본을 소리 내어 끝까지 한 번 읽고 시간을 잰다', '발표·질의 시간과 순서를 발주처 공지로 다시 확인한다', '예상 질문 답을 소리 내어 한 번씩 말해 본다'],
            '당일 아침' => ['대본에 나온 수치를 최신 자료와 대조한다', '남길 문장만 이어서 읽어 보며 흐름을 머리에 넣는다'],
            '시작 10분 전' => ['발표장 PC 에서 파일을 열어 서체·그림이 깨지지 않는지 본다', '뒷자리에서 화면 글자가 읽히는지 확인한다', '리모컨·포인터 배터리와 시계 위치를 확인한다'],
            '연결 직후' => ['슬라이드 쇼 모드에서 첫 장이 뜨는지 확인한다', '대본은 손에 들고, 화면은 장표만 띄운다'],
        ];
    }

    private static function defaultRecover(array $parts): array
    {
        $keep = array_values(array_map(static fn($p) => $p['name'], array_filter($parts, static fn($p) => $p['never_cut'])));
        return [
            ['s' => '시간 초과', 'sign' => '중간 지점에서 예정 시각보다 1분 넘게 늦다', 'act' => '남은 장은 남길 문장과 근거 한 가지만 말한다.' . ($keep ? ' ' . implode('·', $keep) . ' 구간은 줄이지 않는다.' : '')],
            ['s' => '중간에 질문이 들어옴', 'sign' => '평가위원이 손을 들거나 말을 끊는다', 'act' => '한 문장으로 답하고 "자세한 내용은 ○쪽에서 말씀드리겠습니다"로 돌아온다. 길게 답하지 않는다.'],
            ['s' => '화면·파일 문제', 'sign' => '서체가 깨지거나 그림이 안 보인다', 'act' => '해명하지 않고 PDF 백업으로 바꿔 띄운다. 그동안 대본은 멈추지 않는다.'],
            ['s' => '수치·이름이 생각나지 않음', 'sign' => '말이 막힌다', 'act' => '화면의 숫자를 가리키며 읽는다. 기억에 의존해 다른 숫자를 말하지 않는다.'],
        ];
    }

    /** 장 그림 — 결과 렌더(after) 우선, 없으면 시안. 폭을 줄여 넣는다(GD 가 없으면 원본) */
    private static function img(string $id, int $n, int $w): string
    {
        foreach ([Jobs::dir($id, 'after'), Jobs::dir($id, 'mockup')] as $dir) {
            $f = sprintf('%s/s%02d.jpg', $dir, $n);
            if (!is_file($f)) continue;
            if ($w > 0 && function_exists('imagecreatefromjpeg') && ($im = @imagecreatefromjpeg($f))) {
                $sw = imagesx($im);
                if ($sw > $w) {
                    $sm = imagescale($im, $w);
                    ob_start();
                    imagejpeg($sm, null, 78);
                    return 'data:image/jpeg;base64,' . base64_encode((string) ob_get_clean());
                }
            }
            return 'data:image/jpeg;base64,' . base64_encode((string) file_get_contents($f));
        }
        return '';
    }

    public static function md(array $j): string
    {
        $x = self::docData($j, false);
        if (!$x) return '';
        $m = static fn($s) => self::mmss((float) $s);
        $md = ['# ' . $x['title'] . ' — 발표 대본', '', '**' . $x['thesis'] . '**', ''];
        if ($x['lede'] !== '') array_push($md, $x['lede'], '');
        $md[] = '목표 ' . $m($x['goal']) . ' · 대본 ' . $m($x['total']) . ' · ' . $x['count'] . '장' . implode('', array_map(static fn($f) => ' · ' . $f['k'] . ' ' . $f['v'], $x['facts']));
        array_push($md, '', '## 발표 전 점검', '');
        foreach ($x['checklist'] as $k => $items) { $md[] = '**' . $k . '**'; foreach ($items as $i) $md[] = '- [ ] ' . $i; $md[] = ''; }
        array_push($md, '## 대본', '', '> 남길 문장은 시간이 모자라도 반드시 말한다.', '');
        foreach ($x['parts'] as $pi => $p) {
            array_push($md, '### 구간 ' . ($pi + 1) . ' · ' . $p['name'] . ' (' . $m($p['start']) . ' · ' . $p['sec'] . '초' . ($p['never_cut'] ? ' · 줄이지 않음' : '') . ')', '');
            if ($p['aim'] !== '') array_push($md, '_' . $p['aim'] . '_', '');
            foreach ($p['slides'] as $s) {
                array_push($md, '#### ' . $s['n'] . '쪽. ' . $s['title'] . ' — ' . $m($s['start']) . ' · ' . $s['sec'] . '초', '');
                if ($s['keep'] !== '') array_push($md, '> 남길 문장 — ' . $s['keep'], '');
                if ($s['screen'] !== '' || $s['cues']) array_push($md, '`화면` ' . $s['screen'] . ($s['cues'] ? ' ' . implode(' ', $s['cues']) : ''), '');
                $md[] = implode("\n", array_map(static fn($l) => $l === '' ? '' : $l . '  ', $s['lines']));
                $md[] = '';
                foreach ($s['notes'] as $nt) $md[] = '— ' . $nt;
                if ($s['cut'] !== '') $md[] = '— 줄일 때: ' . $s['cut'];
                $md[] = '';
            }
        }
        array_push($md, '## 어긋났을 때', '', '| 상황 | 조짐 | 그 자리에서 할 일 |', '|---|---|---|');
        foreach ($x['recover'] as $r) $md[] = '| ' . $r['s'] . ' | ' . $r['sign'] . ' | ' . $r['act'] . ' |';
        $md[] = '';
        if ($x['qa']) {
            array_push($md, '## 예상 질문', '');
            foreach ($x['qa'] as $i => $q) {
                array_push($md, '**Q' . ($i + 1) . '. ' . $q['q'] . '**' . ($q['slide'] ? ' (' . $q['slide'] . '쪽)' : ''), '', $q['a']);
                if (!empty($q['need'])) array_push($md, '', '> 준비할 것: ' . $q['need']);
                $md[] = '';
            }
        }
        return implode("\n", $md);
    }

    /** 대본 문서 — 발표자가 들고 가는 것. 상단 타임라인·리허설 타이머, 구간별 대본, 점검, 어긋났을 때, 예상 질문(인터넷 없이 열림) */
    public static function html(array $j): string
    {
        $x = self::docData($j, true);
        if (!$x) return '';
        $data = json_encode($x, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG);
        $tpl = (string) file_get_contents(__DIR__ . '/script_doc.html');
        return str_replace(['{{TITLE}}', '"{{DATA}}"'], [htmlspecialchars((string) $j['title']), $data], $tpl);
    }

    /** 노래방식 연습 화면 — 장표 그림과 대본을 한 파일에 담는다(인터넷 없이 열림) */
    public static function practice(array $j): string
    {
        $id = (string) $j['id'];
        $d = self::load($id);
        if (!$d) return '';
        $slides = [];
        foreach ($d['slides'] as $s) $slides[] = ['n' => $s['n'], 'title' => $s['title'], 'lines' => $s['lines'], 'img' => self::img($id, (int) $s['n'], 0)];
        $data = json_encode(['title' => $j['title'], 'slides' => $slides], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG);
        $tpl = (string) file_get_contents(__DIR__ . '/script_player.html');
        return str_replace(['{{TITLE}}', '"{{DATA}}"'], [htmlspecialchars((string) $j['title']), $data], $tpl);
    }
}
