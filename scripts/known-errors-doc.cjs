// engine/known_errors.json → docs/장표-기본규칙-오류체크리스트.md (사람이 보는 판). 원천은 json 하나 — 문서를 손으로 고치지 않는다.
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')
const j = JSON.parse(fs.readFileSync(path.join(root, 'engine/known_errors.json'), 'utf8'))
const cell = (s) => String(s ?? '').split('|').join('\\|').split('\n').join(' ')
let md = `# 장표 기본 규칙 · 오류 체크리스트

> 생성 파일 — 원천은 \`engine/known_errors.json\`. 고칠 땐 json 을 고치고 \`node scripts/known-errors-doc.cjs\` 로 다시 만든다.

한 번 나온 오류는 세 곳에 동시에 남는다.

1. **기본 규칙** — 다듬기 지시문의 \`{{BASE_RULES}}\` 자리에 rule 문장이 실린다(engine/design.py base_rules_text).
2. **게이트** — 코드가 결과를 원본과 견줘 되돌린다(sizeguard·cardfit·textlines). 되돌리면 \`GUARD: slug|장|개수\` 를 남긴다.
3. **개선 체크리스트** — \`known:<slug>\` 줄이 '고침' 상태로 심겨 있다(마이그레이션 0036). 게이트가 다시 잡으면 열림·다시 걸림으로 바뀌고, 다음 작업 지시문에 규칙이 한 번 더 실린다(관리자 > powerDeck > 개선 체크리스트).
4. **회귀 시험** — \`engine/tests/test_known.py\` 의 같은 이름 함수. \`scripts/deploy-engine.sh\` 가 배포 전에 돌리고, 하나라도 실패하면 올리지 않는다.

## 목록 (${j.items.length}개)

| 번호 | slug | 분야 | 증상 | 원인 | 규칙(지시문) | 막는 장치 | 시험 | 처음 | 커밋 |
|:---:|---|:---:|---|---|---|---|:---:|:---:|:---:|
`
j.items.forEach((x, i) => {
  md += `| ${i + 1} | ${x.slug} | ${x.area} | ${cell(x.symptom)} | ${cell(x.cause)} | ${cell(x.rule)} | ${cell(x.gate)} | ${x.test || '—'} | ${x.since || ''} | ${x.commit || ''} |\n`
})
md += `
## 새 오류를 고쳤을 때 (절차)

1. 원인을 고친다(지시문 문장만 고치지 말고, 셀 수 있으면 게이트 코드로).
2. \`engine/known_errors.json\` 에 한 줄: slug(영문 소문자·하이픈) · area · title · symptom · cause · rule(다음 작업에 실릴 문장 한 줄) · gate(코드 위치) · test(시험 함수 이름) · since · commit.
3. 게이트가 그 오류를 되돌리면 \`GUARD: <slug>|<장>|<개수>\` 를 출력하게 한다(engine/sizeguard.py 참고).
4. \`engine/tests/test_known.py\` 에 같은 이름 함수 — 합성 pptx 로 오류를 만들고 게이트가 막는지 본다. \`test_registry_consistent\` 가 이름이 빠지면 실패시킨다.
5. \`node scripts/known-errors-sql.cjs db/migrations/<새 번호>_known_errors.sql\` → 새 마이그레이션(INSERT IGNORE 라 기존 줄은 그대로).
6. \`node scripts/known-errors-doc.cjs\` → 이 문서.
7. \`python3 engine/tests/test_known.py\` 통과 → 커밋 → \`scripts/deploy.sh\`(마이그레이션) → \`scripts/deploy-engine.sh\`.
`
fs.writeFileSync(path.join(root, 'docs/장표-기본규칙-오류체크리스트.md'), md)
console.log('docs ' + j.items.length + ' rows')
