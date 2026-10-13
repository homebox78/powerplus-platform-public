const fs=require('fs');const j=JSON.parse(fs.readFileSync('engine/known_errors.json','utf8'));
const q=s=>"'"+String(s??'').split("\\").join("\\\\").split("'").join("''")+"'";
const area={type:'type',plan:'plan',wire:'wire',assets:'assets',engine:'engine'};
let out=`-- 0036 자가 개선 — 한 번 나온 오류(engine/known_errors.json)를 개선 체크리스트에 '고침' 상태로 심는다.
-- 엔진 게이트가 다시 잡으면 Checklist::record 가 open·다시 걸림으로 되돌리고, fix_note(규칙)가 다음 작업 지시문에 실린다.
-- 이 파일은 scripts/known-errors-sql.cjs 로 생성. 새 오류는 known_errors.json 에 한 줄 추가 후 새 마이그레이션으로 다시 생성.
`;
for(const x of j.items){out+=`INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES (${q('known:'+x.slug)}, ${q(area[x.area]||'misc')}, ${q(x.title)}, ${q('증상: '+x.symptom+' / 원인: '+x.cause+' / 막는 장치: '+x.gate)}, 'manual', 'fixed', ${q(x.rule)}, ${q(x.commit)}, NOW(3), '[]');
`}
fs.writeFileSync(process.argv[2]||'db/migrations/0036_known_errors.sql',out);
console.log(j.items.length+' rows');
