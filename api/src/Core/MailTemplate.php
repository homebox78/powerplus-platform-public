<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 메일 서식 — 모든 메일이 같은 틀(로고·제목·본문·버튼·정보 상자·안내·회사 정보)로 나간다.
 * 메일 프로그램(Gmail·Outlook·네이버)에서 깨지지 않게 표 배치 + 인라인 스타일만 쓴다. 외부 CSS·웹폰트·스크립트 없음.
 * 강조색은 로고 한 곳(주황)만, 버튼은 검정 — 플랫폼 화면 규칙 그대로.
 *
 *   [$subject, $text, $html] = MailTemplate::render('otp', ['code' => '123456']);
 *   Mail::send($to, $subject, $text, $html);
 *
 * 관리자 미리보기: GET /api/v1/admin/mail/templates (api/routes/admin3.php) — 아래 TYPES 의 sample 값으로 전부 그린다.
 */
final class MailTemplate
{
    /** 묶음 → 화면 순서 */
    public const GROUPS = [
        'account' => '계정',
        'support' => '문의·요청',
        'work' => '작업 알림',
        'admin' => '관리 안내',
        'billing' => '결제',
        'news' => '소식',
    ];

    /** 유형 목록 — label·언제 보내나·샘플 값. 새 유형은 여기와 body() 에 한 줄씩. */
    public const TYPES = [
        'otp' => ['group' => 'account', 'label' => '로그인 인증 코드', 'when' => '로그인·가입 화면에서 이메일을 넣었을 때',
            'sample' => ['code' => '482916', 'ttl' => 10]],
        'welcome' => ['group' => 'account', 'label' => '가입 축하', 'when' => '처음 로그인해 계정이 만들어졌을 때',
            'sample' => ['name' => '김솔리', 'points' => 100]],
        'invite' => ['group' => 'account', 'label' => '관리자 초대', 'when' => '관리자가 사용자를 직접 추가하고 초대 메일을 켰을 때',
            'sample' => ['name' => '김솔리', 'email' => 'user@example.com', 'plan' => 'Pro']],
        'login_new' => ['group' => 'account', 'label' => '새 로그인 알림', 'when' => '처음 보는 환경에서 로그인했을 때',
            'sample' => ['when' => '2026-10-07 14:32', 'ip' => '211.55.223.0', 'agent' => 'Windows · Chrome']],
        'key_issued' => ['group' => 'account', 'label' => 'API·MCP 키 발급', 'when' => '마이페이지에서 키를 새로 발급했을 때',
            'sample' => ['key_name' => 'claude.ai 연결', 'masked' => 'pp_live_••••7b2c', 'when' => '2026-10-07 14:35']],
        'withdraw' => ['group' => 'account', 'label' => '탈퇴 완료', 'when' => '마이페이지에서 탈퇴를 마쳤을 때',
            'sample' => ['name' => '김솔리', 'date' => '2026-10-07']],
        'dormant' => ['group' => 'account', 'label' => '장기 미접속 안내', 'when' => '2년 동안 로그인하지 않아 정리 30일 전',
            'sample' => ['name' => '김솔리', 'last' => '2024-10-01', 'date' => '2026-11-06']],

        'contact_received' => ['group' => 'support', 'label' => '문의 접수 확인', 'when' => '문의하기 폼을 보냈을 때',
            'sample' => ['name' => '김솔리', 'topic' => '서비스 이용', 'message' => '에셋을 PowerPoint 2016 에서도 쓸 수 있을까요?']],
        'contact_reply' => ['group' => 'support', 'label' => '문의 답변', 'when' => '관리자가 문의에 답변을 보냈을 때',
            'sample' => ['name' => '김솔리', 'reply' => "PowerPoint 2016 은 작업창 기술이 오래되어 쓸 수 없습니다.\n2019·2021 또는 Microsoft 365 에서 이용해 주세요.", 'message' => '에셋을 PowerPoint 2016 에서도 쓸 수 있을까요?']],
        'removal_received' => ['group' => 'support', 'label' => '삭제요청 접수', 'when' => '삭제요청을 접수했을 때',
            'sample' => ['no' => 'RM2610070012', 'target' => 'https://example.go.kr/notice', 'due' => '2026-10-09 14:00']],
        'removal_result' => ['group' => 'support', 'label' => '삭제요청 처리 결과', 'when' => '삭제요청 상태가 바뀌었을 때',
            'sample' => ['no' => 'RM2610070012', 'status' => '삭제 처리 완료', 'target' => 'https://example.go.kr/notice', 'resolution' => '요청하신 화면과 관련 이미지를 모두 내렸습니다.']],
        'request_done' => ['group' => 'support', 'label' => '자료 요청 반영', 'when' => '요청한 에셋이 등록됐을 때',
            'sample' => ['name' => '김솔리', 'title' => '친환경 에너지 아이콘 세트', 'count' => 24]],

        'deck_done' => ['group' => 'work', 'label' => '장표 완성', 'when' => '장표 변환 작업이 끝났을 때',
            'sample' => ['title' => '2027 스마트시티 제안서', 'slides' => 24, 'minutes' => 38]],
        'deck_plan' => ['group' => 'work', 'label' => '기획 완성', 'when' => '장별 기획 글과 와이어프레임 A·B 가 나와 고르기를 기다릴 때',
            'sample' => ['title' => '2027 스마트시티 제안서', 'slides' => 24, 'minutes' => 14]],
        'deck_mockup' => ['group' => 'work', 'label' => '시안 완성', 'when' => '확정한 와이어로 장별 시안 이미지가 나와 확인을 기다릴 때',
            'sample' => ['title' => '2027 스마트시티 제안서', 'slides' => 24, 'minutes' => 21]],
        'deck_review' => ['group' => 'work', 'label' => '한 장 시안 확인 요청', 'when' => '대표 장 시안이 나와 확인을 기다릴 때',
            'sample' => ['title' => '2027 스마트시티 제안서']],
        'deck_failed' => ['group' => 'work', 'label' => '장표 변환 실패', 'when' => '변환이 실패했을 때',
            'sample' => ['title' => '2027 스마트시티 제안서', 'reason' => '원본 파일을 열 수 없습니다. 암호가 걸려 있는지 확인해 주세요.']],
        'mockup_shared' => ['group' => 'work', 'label' => '시안 공유·좋아요', 'when' => '갤러리에 올린 시안을 다른 사람이 열람했을 때',
            'sample' => ['title' => '한빛시 메인 시안', 'views' => 12, 'likes' => 3, 'points' => 40]],
        'comment_new' => ['group' => 'work', 'label' => '댓글 알림', 'when' => '내 글에 댓글이 달렸을 때(받기를 켠 사람만)',
            'sample' => ['who' => '이디자', 'title' => 'KRDS 탭 부품 질문', 'excerpt' => '저도 같은 문제가 있었는데 kit.css 를 먼저 불러오니 해결됐어요.', 'link' => '/community']],
        'notice_new' => ['group' => 'news', 'label' => '새 공지', 'when' => '공지가 올라왔을 때(받기를 켠 사람만)',
            'sample' => ['title' => 'powerAssets 아이콘 540개 추가', 'link' => '/community?c=notice']],

        'plan_changed' => ['group' => 'admin', 'label' => '플랜 변경', 'when' => '관리자가 플랜을 지정했을 때',
            'sample' => ['name' => '김솔리', 'plan' => 'Pro', 'until' => '2027-01-31']],
        'points_adjusted' => ['group' => 'admin', 'label' => '포인트 지급', 'when' => '관리자가 포인트를 적립했을 때',
            'sample' => ['name' => '김솔리', 'amount' => 500, 'reason' => '사내 출시 이벤트 참여', 'balance' => 620]],
        'blocked' => ['group' => 'admin', 'label' => '이용 제한', 'when' => '관리자가 계정을 차단했을 때',
            'sample' => ['name' => '김솔리', 'reason' => '같은 사람이 여러 계정으로 포인트를 적립했습니다.']],

        'receipt' => ['group' => 'billing', 'label' => '결제 영수증', 'when' => '구독·크레딧 결제가 끝났을 때(결제 공개 뒤 사용)',
            'sample' => ['item' => 'Pro 월 구독', 'amount' => '20,900원', 'paid' => '2026-10-07', 'next' => '2026-11-07', 'no' => 'PP-2610-000123']],
        'renewal_notice' => ['group' => 'billing', 'label' => '자동 갱신 예고', 'when' => '자동 갱신 7일 전(결제 공개 뒤 사용)',
            'sample' => ['item' => 'Pro 월 구독', 'amount' => '20,900원', 'date' => '2026-11-07']],

        'newsletter' => ['group' => 'news', 'label' => '업데이트 소식', 'when' => '마케팅 수신에 동의한 사람에게만',
            'sample' => ['month' => '10월']],
    ];

    private const BRAND = '#E46B37';
    private const INK = '#111111';
    private const INK3 = '#555555';
    private const INK4 = '#888888';
    private const LINE = '#E5E5E5';
    private const GROUND2 = '#F7F7F7';
    // 모바일(600px 이하): 글자·줄간격 15% 축소(사용자 2026-10-07 "모바일에서 너무 크다"). 메일 앱은 인라인 스타일이 기본이라 !important 로 덮는다.
    private const MOBILE_CSS = '<style>@media only screen and (max-width:600px){'
        . '.m-logo{font-size:18.7px!important}.m-card{padding:28px 20px!important}'
        . '.m-title{font-size:20.4px!important;line-height:1.15!important}'
        . '.m-p{font-size:12.75px!important;line-height:1.45!important}'
        . '.m-code{font-size:30.6px!important;padding:20px 12px!important}'
        . '.m-box{font-size:11.9px!important;line-height:1.3!important;padding:10px 12px!important}'
        . '.m-answer{font-size:12.75px!important;line-height:1.49!important}'
        . '.m-quote{font-size:11.9px!important;line-height:1.45!important}'
        . '.m-btn{font-size:12.75px!important;padding:12px 24px!important}'
        . '.m-note{font-size:11px!important;line-height:1.4!important}'
        . '.m-foot{font-size:10.2px!important;line-height:1.36!important}'
        . '}</style>';
    private const FONT = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif";

    /** @return array{0:string,1:string,2:string} [제목, 글 본문, HTML 본문] */
    public static function render(string $type, array $v = []): array
    {
        if (!isset(self::TYPES[$type])) {
            throw new \InvalidArgumentException("unknown mail type: {$type}");
        }
        $v += self::TYPES[$type]['sample'] + ['base' => self::base()];
        $b = self::body($type, $v);
        return [$b['subject'], self::text($b), self::html($b, $type === 'newsletter')];
    }

    /**
     * 실제 발송 — 실패해도 본 작업은 막지 않는다. 탈퇴·더미 주소(.local)·형식 오류면 보내지 않는다.
     * 샘플 값이 섞이지 않게 유형의 샘플 키를 전부 넘겼는지 확인한다(빠지면 보내지 않고 로그만).
     */
    public static function deliver(string $type, ?string $email, array $vars = []): bool
    {
        $email = strtolower(trim((string) $email));
        if ($email === '' || str_ends_with($email, '.local') || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return false;
        }
        $missing = array_diff(array_keys(self::TYPES[$type]['sample'] ?? []), array_keys($vars));
        if ($missing) {
            error_log("[pp-mail] {$type} 값 누락: " . implode(',', $missing));
            return false;
        }
        try {
            [$subj, $text, $html] = self::render($type, $vars);
            return Mail::send($email, $subj, $text, $html);
        } catch (\Throwable $e) {
            error_log("[pp-mail] {$type} 실패: " . $e->getMessage());
            return false;
        }
    }

    public static function base(): string
    {
        return rtrim((string) Config::get('app.url', 'https://powerplus.hom2box.com'), '/');
    }

    /** 유형별 내용 — subject, title, lead[], code?, box?(라벨=>값), quote?, button?[라벨,주소], notes[] */
    private static function body(string $t, array $v): array
    {
        $u = $v['base'];
        $name = isset($v['name']) ? $v['name'] . ' 님' : '';
        return match ($t) {
            'otp' => ['subject' => '[powerPlus] 로그인 인증 코드 ' . $v['code'], 'title' => '로그인 인증 코드',
                'lead' => ['아래 6자리 코드를 로그인 화면에 입력하세요.'], 'code' => $v['code'],
                'notes' => ["코드는 {$v['ttl']}분 동안만 쓸 수 있습니다.", '본인이 요청하지 않았다면 이 메일을 무시하세요. 계정은 안전합니다.']],
            'welcome' => ['subject' => '[powerPlus] 가입을 환영합니다', 'title' => "{$name}, 환영합니다.",
                'lead' => ['SI 실무에 필요한 에셋·장표·목업·디자인 규칙을 한 곳에서 쓸 수 있습니다.', "가입 축하로 {$v['points']} 포인트를 드렸습니다."],
                'box' => ['powerAssets' => 'PowerPoint 에 바로 넣는 아이콘·사진·장표', 'powerDeck' => '자료만 올리면 기획부터 디자인 장표까지', 'powerMock' => 'AI 로 만드는 홈페이지 목업', 'powerGuide' => '토큰·부품·접근성 규칙'],
                'button' => ['시작하기', $u . '/'], 'notes' => ['powerMCP 를 연결하면 쓰던 AI 에서 4개 서비스를 바로 부를 수 있습니다.']],
            'invite' => ['subject' => '[powerPlus] 계정이 만들어졌습니다', 'title' => "{$name}, 계정을 만들어 두었습니다.",
                'lead' => ['관리자가 powerPlus 계정을 만들었습니다.', '비밀번호는 없습니다. 로그인 화면에 이메일을 넣으면 인증 코드가 옵니다.'],
                'box' => ['로그인 이메일' => $v['email'], '이용 플랜' => $v['plan']],
                'button' => ['로그인하기', $u . '/login'], 'notes' => ['본인이 요청하지 않았다면 이 메일을 무시하세요.']],
            'login_new' => ['subject' => '[powerPlus] 새 환경에서 로그인했습니다', 'title' => '새 환경에서 로그인했습니다.',
                'lead' => ['처음 보는 브라우저나 장소에서 계정에 로그인했습니다.'],
                'box' => ['시각' => $v['when'], '접속 위치' => $v['ip'], '환경' => $v['agent']],
                'button' => ['로그인 기록 보기', $u . '/account'], 'notes' => ['본인이 아니라면 마이페이지에서 모든 기기 로그아웃을 누르고 문의해 주세요.']],
            'key_issued' => ['subject' => '[powerPlus] API·MCP 키가 발급되었습니다', 'title' => '새 키가 발급되었습니다.',
                'lead' => ['계정에서 API·MCP 키를 새로 만들었습니다.'],
                'box' => ['키 이름' => $v['key_name'], '키' => $v['masked'], '발급 시각' => $v['when']],
                'button' => ['키 관리', $u . '/account/keys'], 'notes' => ['키 원문은 메일로 보내지 않습니다.', '본인이 만든 키가 아니라면 바로 폐기해 주세요.']],
            'withdraw' => ['subject' => '[powerPlus] 탈퇴가 완료되었습니다', 'title' => '탈퇴가 완료되었습니다.',
                'lead' => ["{$name}, 그동안 powerPlus 를 이용해 주셔서 감사합니다.", '계정 정보는 바로 지웠습니다.'],
                'box' => ['탈퇴일' => $v['date'], '남은 포인트' => '소멸', '결제 기록' => '전자상거래법에 따라 5년 보관'],
                'notes' => ['같은 이메일로 언제든 다시 가입할 수 있습니다.', '본인이 탈퇴하지 않았다면 바로 문의해 주세요.']],
            'dormant' => ['subject' => '[powerPlus] 오래 접속하지 않은 계정 안내', 'title' => '오랫동안 접속하지 않으셨습니다.',
                'lead' => ["{$name}, 2년 동안 로그인 기록이 없어 계정 정리를 안내드립니다."],
                'box' => ['마지막 로그인' => $v['last'], '정리 예정일' => $v['date']],
                'button' => ['로그인해서 유지하기', $u . '/login'], 'notes' => ['예정일 전에 한 번 로그인하면 계정이 그대로 유지됩니다.']],

            'contact_received' => ['subject' => '[powerPlus] 문의가 접수되었습니다', 'title' => '문의를 잘 받았습니다.',
                'lead' => ["{$name}, 보내 주신 문의를 확인하고 있습니다.", '보통 영업일 기준 2일 안에 답변드립니다.'],
                'box' => ['분류' => $v['topic']], 'quote' => $v['message'], 'notes' => ['이 메일에 답장하지 말고 문의하기에서 새로 보내 주세요.']],
            'contact_reply' => ['subject' => '[powerPlus] 문의하신 내용에 답변드립니다', 'title' => '문의에 답변드립니다.',
                'lead' => ["{$name}, 문의해 주셔서 감사합니다."], 'answer' => $v['reply'], 'quote' => $v['message'],
                'button' => ['다시 문의하기', $u . '/contact'], 'notes' => []],
            'removal_received' => ['subject' => "[powerPlus] 삭제요청 접수 {$v['no']}", 'title' => '삭제요청을 접수했습니다.',
                'lead' => ['요청하신 내용을 확인하고 기한 안에 처리하겠습니다.'],
                'box' => ['접수번호' => $v['no'], '대상' => $v['target'], '처리 기한' => $v['due']],
                'button' => ['처리 상태 보기', $u . '/removal'], 'notes' => ['접수번호와 이메일로 처리 상태를 확인할 수 있습니다.']],
            'removal_result' => ['subject' => "[powerPlus] 삭제요청 {$v['no']} — {$v['status']}", 'title' => "삭제요청이 '{$v['status']}' 되었습니다.",
                'lead' => ['요청하신 삭제요청의 처리 상태를 알려 드립니다.'],
                'box' => ['접수번호' => $v['no'], '대상' => $v['target'], '상태' => $v['status']],
                'answer' => $v['resolution'], 'button' => ['처리 상태 보기', $u . '/removal'], 'notes' => []],
            'request_done' => ['subject' => '[powerPlus] 요청하신 자료가 등록되었습니다', 'title' => '요청하신 자료가 들어왔습니다.',
                'lead' => ["{$name}, 요청하신 자료를 등록했습니다."],
                'box' => ['요청' => $v['title']] + ((int) $v['count'] > 0 ? ['등록 수' => $v['count'] . '개'] : []),
                'button' => ['자료 보기', $u . '/assets/browse'], 'notes' => ['PowerPoint 작업창에서도 바로 검색됩니다.']],

            'deck_done' => ['subject' => "[powerPlus] 장표가 완성되었습니다 — {$v['title']}", 'title' => '장표가 완성되었습니다.',
                'lead' => ['맡기신 장표 작업이 끝났습니다.'],
                'box' => ['작업' => $v['title'], '장 수' => $v['slides'] . '장', '걸린 시간' => $v['minutes'] . '분'],
                'button' => ['결과 보기', $u . '/deck/jobs'], 'notes' => ['결과 파일은 7일 동안 받을 수 있습니다.']],
            'deck_plan' => ['subject' => "[powerPlus] 기획이 나왔습니다 — {$v['title']}", 'title' => '기획이 나왔습니다.',
                'lead' => ['장마다 기획 글과 와이어프레임 A·B 가 준비되었습니다.', '장마다 A·B 를 고르고 확정하면 시안 이미지를 만듭니다.'],
                'box' => ['작업' => $v['title'], '장 수' => $v['slides'] . '장', '걸린 시간' => $v['minutes'] . '분'],
                'button' => ['기획 확인하기', $u . '/deck/jobs'], 'notes' => ['와이어를 확정하기 전까지 시안은 만들지 않습니다.']],
            'deck_mockup' => ['subject' => "[powerPlus] 시안이 나왔습니다 — {$v['title']}", 'title' => '시안이 나왔습니다.',
                'lead' => ['확정한 와이어프레임으로 장별 시안 이미지가 준비되었습니다.', '장마다 확인하고 확정하면 장표를 만듭니다.'],
                'box' => ['작업' => $v['title'], '장 수' => $v['slides'] . '장', '걸린 시간' => $v['minutes'] . '분'],
                'button' => ['시안 확인하기', $u . '/deck/jobs'], 'notes' => ['확정하기 전까지 장표는 만들지 않습니다.']],
            'deck_review' => ['subject' => "[powerPlus] 한 장 시안을 확인해 주세요 — {$v['title']}", 'title' => '한 장 시안이 나왔습니다.',
                'lead' => ['대표 장 하나를 먼저 만들었습니다.', '확인하고 의견을 주시면 나머지 장을 같은 톤으로 만듭니다.'],
                'box' => ['작업' => $v['title']], 'button' => ['시안 확인하기', $u . '/deck/jobs'], 'notes' => ['확인 전까지 나머지 장은 만들지 않습니다.']],
            'deck_failed' => ['subject' => "[powerPlus] 장표 변환이 실패했습니다 — {$v['title']}", 'title' => '장표 변환이 실패했습니다.',
                'lead' => ['맡기신 작업을 끝내지 못했습니다.', '사유를 확인하고 다시 돌려 주세요.'],
                'box' => ['작업' => $v['title']], 'answer' => $v['reason'],
                'button' => ['다시 시도하기', $u . '/deck'], 'notes' => ['같은 문제가 반복되면 문의해 주세요.']],
            'mockup_shared' => ['subject' => '[powerPlus] 공유한 시안을 다른 사람들이 보고 있습니다', 'title' => '공유한 시안이 인기입니다.',
                'lead' => ['갤러리에 올린 시안을 다른 사람들이 열람했습니다.'],
                'box' => ['시안' => $v['title'], '열람' => $v['views'] . '회', '좋아요' => $v['likes'] . '개', '받은 포인트' => $v['points'] . 'P'],
                'button' => ['내 시안 보기', $u . '/mock/mockups'], 'notes' => []],
            'comment_new' => ['subject' => "[powerPlus] 「{$v['title']}」에 댓글이 달렸습니다", 'title' => '내 글에 댓글이 달렸습니다.',
                'lead' => ["{$v['who']} 님이 댓글을 남겼습니다."],
                'box' => ['글' => $v['title']], 'answer' => $v['excerpt'],
                'button' => ['댓글 보기', $u . $v['link']], 'notes' => ['댓글 메일은 마이페이지 › 설정 › 알림에서 끌 수 있습니다.']],
            'notice_new' => ['subject' => "[powerPlus] 새 공지 — {$v['title']}", 'title' => '새 공지가 올라왔습니다.',
                'lead' => ['powerPlus 에 새 공지가 있습니다.'],
                'box' => ['공지' => $v['title']],
                'button' => ['공지 보기', $u . $v['link']], 'notes' => ['공지 메일은 마이페이지 › 설정 › 알림에서 끌 수 있습니다.']],

            'plan_changed' => ['subject' => '[powerPlus] 이용 플랜이 바뀌었습니다', 'title' => "이용 플랜이 {$v['plan']} 로 바뀌었습니다.",
                'lead' => ["{$name}, 관리자가 이용 플랜을 지정했습니다."],
                'box' => ['플랜' => $v['plan'], '이용 기한' => $v['until'] ?: '기한 없음'],
                'button' => ['내 플랜 보기', $u . '/account'], 'notes' => ['기한이 지나면 무료 플랜으로 돌아갑니다.']],
            'points_adjusted' => ['subject' => '[powerPlus] 포인트가 적립되었습니다', 'title' => number_format((int) $v['amount']) . ' 포인트가 적립되었습니다.',
                'lead' => ["{$name}, 포인트를 드렸습니다."],
                'box' => ['사유' => $v['reason'], '현재 잔액' => number_format((int) $v['balance']) . 'P'],
                'button' => ['포인트 내역', $u . '/account'], 'notes' => ['포인트는 12개월 동안 쓸 수 있습니다.']],
            'blocked' => ['subject' => '[powerPlus] 계정 이용이 제한되었습니다', 'title' => '계정 이용이 제한되었습니다.',
                'lead' => ["{$name}, 운영 정책에 따라 계정 이용을 멈췄습니다."], 'answer' => $v['reason'],
                'button' => ['이의 신청하기', $u . '/contact'], 'notes' => ['제한 중에는 로그인과 API·MCP 키를 쓸 수 없습니다.']],

            'receipt' => ['subject' => "[powerPlus] 결제가 완료되었습니다 ({$v['amount']})", 'title' => '결제가 완료되었습니다.',
                'lead' => ['결제해 주셔서 감사합니다.'],
                'box' => ['상품' => $v['item'], '결제 금액' => $v['amount'] . ' (부가세 포함)', '결제일' => $v['paid'], '다음 결제일' => $v['next'], '주문번호' => $v['no']],
                'button' => ['결제 내역', $u . '/account'], 'notes' => ['결제 후 7일 안에 쓰지 않았다면 전액 환불됩니다.', '세금계산서는 결제 내역에서 신청할 수 있습니다.']],
            'renewal_notice' => ['subject' => '[powerPlus] 구독이 7일 뒤 자동 갱신됩니다', 'title' => '구독이 곧 자동 갱신됩니다.',
                'lead' => ['다음 결제일에 등록된 카드로 자동 결제됩니다.'],
                'box' => ['상품' => $v['item'], '결제 예정 금액' => $v['amount'], '결제 예정일' => $v['date']],
                'button' => ['구독 관리', $u . '/account'], 'notes' => ['갱신을 원하지 않으면 결제 예정일 전에 해지해 주세요.']],

            'newsletter' => ['subject' => "[powerPlus] {$v['month']} 업데이트 소식", 'title' => "{$v['month']}에 새로 생긴 것들",
                'lead' => ['이번 달 powerPlus 에 추가된 기능을 모았습니다.'],
                'box' => ['powerMCP' => '쓰던 AI 에 연결해 4개 서비스를 한 번에', 'powerDeck' => '한 장 먼저 보고 나머지 진행', 'powerAssets' => '아이콘 540개 추가', 'powerGuide' => '부품 77종 코드 문서'],
                'button' => ['새 기능 보기', $u . '/notice'], 'notes' => []],
        };
    }

    private static function e(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    }

    private static function text(array $b): string
    {
        $out = [$b['title'], ''];
        foreach ($b['lead'] as $l) $out[] = $l;
        if (!empty($b['code'])) $out = [...$out, '', '인증 코드: ' . $b['code']];
        if (!empty($b['box'])) { $out[] = ''; foreach ($b['box'] as $k => $val) $out[] = "{$k}: {$val}"; }
        if (!empty($b['answer'])) $out = [...$out, '', $b['answer']];
        if (!empty($b['quote'])) $out = [...$out, '', '— 보내신 내용 —', $b['quote']];
        if (!empty($b['button'])) $out = [...$out, '', $b['button'][0] . ': ' . $b['button'][1]];
        if (!empty($b['notes'])) { $out[] = ''; foreach ($b['notes'] as $n) $out[] = '· ' . $n; }
        $out = [...$out, '', '— ㈜솔리데오 powerPlus · 발신 전용 메일입니다.'];
        return implode("\n", $out);
    }

    private static function html(array $b, bool $marketing): string
    {
        $f = self::FONT;
        $p = static fn (string $s, string $style = ''): string => '<p class="m-p" style="margin:0 0 8px;font-family:' . $f . ';font-size:15px;line-height:1.7;color:' . self::INK3 . ';' . $style . '">' . self::e($s) . '</p>';
        $rows = '';

        $rows .= '<tr><td class="m-title" style="padding:0 0 12px;font-family:' . $f . ';font-size:24px;font-weight:800;line-height:1.35;letter-spacing:-0.02em;color:' . self::INK . ';">' . self::e($b['title']) . '</td></tr>';
        $lead = '';
        foreach ($b['lead'] as $l) $lead .= $p($l);
        $rows .= '<tr><td style="padding:0 0 20px;">' . $lead . '</td></tr>';

        if (!empty($b['code'])) {
            $rows .= '<tr><td style="padding:0 0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . self::GROUND2 . ';border-radius:12px;"><tr><td class="m-code" align="center" style="padding:24px 16px;font-family:' . $f . ';font-size:36px;font-weight:800;letter-spacing:0.3em;color:' . self::INK . ';">' . self::e($b['code']) . '</td></tr></table></td></tr>';
        }
        if (!empty($b['box'])) {
            $tr = '';
            $i = 0;
            foreach ($b['box'] as $k => $val) {
                $line = $i++ > 0 ? 'border-top:1px solid ' . self::LINE . ';' : '';
                $tr .= '<tr><td class="m-box" width="96" valign="top" style="width:96px;white-space:nowrap;padding:12px 12px 12px 16px;' . $line . 'font-family:' . $f . ';font-size:14px;color:' . self::INK4 . ';">' . self::e((string) $k) . '</td>'
                    . '<td class="m-box" valign="top" style="padding:12px 16px;' . $line . 'font-family:' . $f . ';font-size:14px;font-weight:600;color:' . self::INK . ';word-break:break-all;">' . self::e((string) $val) . '</td></tr>';
            }
            $rows .= '<tr><td style="padding:0 0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' . self::LINE . ';border-radius:12px;border-collapse:separate;">' . $tr . '</table></td></tr>';
        }
        if (!empty($b['answer'])) {
            $rows .= '<tr><td style="padding:0 0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . self::GROUND2 . ';border-radius:12px;"><tr><td class="m-answer" style="padding:18px 20px;font-family:' . $f . ';font-size:15px;line-height:1.75;color:' . self::INK . ';">' . nl2br(self::e($b['answer'])) . '</td></tr></table></td></tr>';
        }
        if (!empty($b['quote'])) {
            $rows .= '<tr><td style="padding:0 0 24px;"><div class="m-note" style="font-family:' . $f . ';font-size:13px;color:' . self::INK4 . ';margin:0 0 6px;">보내신 내용</div><div class="m-quote" style="border-left:3px solid ' . self::LINE . ';padding:2px 0 2px 14px;font-family:' . $f . ';font-size:14px;line-height:1.7;color:' . self::INK3 . ';">' . nl2br(self::e($b['quote'])) . '</div></td></tr>';
        }
        if (!empty($b['button'])) {
            [$label, $href] = $b['button'];
            $rows .= '<tr><td align="center" style="padding:4px 0 28px;"><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="background:' . self::INK . ';border-radius:999px;"><a href="' . self::e($href) . '" class="m-btn" style="display:inline-block;padding:14px 28px;font-family:' . $f . ';font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">' . self::e($label) . '</a></td></tr></table></td></tr>';
        }
        if (!empty($b['notes'])) {
            $n = '';
            foreach ($b['notes'] as $note) $n .= '<p class="m-note" style="margin:0 0 4px;font-family:' . $f . ';font-size:13px;line-height:1.65;color:' . self::INK4 . ';">· ' . self::e($note) . '</p>';
            $rows .= '<tr><td style="padding:16px 0 0;border-top:1px solid ' . self::LINE . ';">' . $n . '</td></tr>';
        }

        $base = self::e(self::base());
        $foot = '<p style="margin:0 0 4px;">㈜솔리데오 · 대표 김숙희 · 서울특별시 영등포구 국제금융로 70, 14층</p>'
            . '<p style="margin:0 0 4px;">발신 전용 메일입니다. 궁금한 점은 <a href="' . $base . '/contact" style="color:' . self::INK3 . ';">문의하기</a>로 보내 주세요.</p>';
        if ($marketing) {
            $foot .= '<p style="margin:0;">이 메일은 소식 받기에 동의하신 분께 보냅니다. <a href="' . $base . '/account" style="color:' . self::INK3 . ';">수신 거부</a></p>';
        }
        $preheader = self::e($b['lead'][0] ?? '');

        return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' . self::e($b['subject']) . '</title>' . self::MOBILE_CSS . '</head>'
            . '<body style="margin:0;padding:0;background:#F2F2F2;-webkit-text-size-adjust:100%;">'
            . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' . $preheader . '</div>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F2;"><tr><td align="center" style="padding:32px 12px;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">'
            . '<tr><td class="m-logo" style="padding:0 4px 18px;font-family:' . $f . ';font-size:22px;font-weight:800;letter-spacing:-0.02em;color:' . self::INK . ';"><a href="' . $base . '" style="color:' . self::INK . ';text-decoration:none;">power<span style="color:' . self::BRAND . ';">Plus</span></a></td></tr>'
            . '<tr><td class="m-card" style="background:#ffffff;border-radius:16px;padding:36px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' . $rows . '</table></td></tr>'
            . '<tr><td class="m-foot" style="padding:20px 8px 0;font-family:' . $f . ';font-size:12px;line-height:1.6;color:' . self::INK4 . ';">' . $foot . '</td></tr>'
            . '</table></td></tr></table></body></html>';
    }
}
