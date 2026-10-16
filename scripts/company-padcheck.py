# 회사소개서 테마 C 크림 면 규칙 검사(R59) — 구역(data-zone) 외곽과 면 좌표 차이가 네 방향 모두 PAD 인지. 음성 대조: 구역 없는 쪽은 '면 없음'. python scripts/company-padcheck.py [톤]
import sys, json, os
ROOT = r'D:\powerplus-platform'
sys.path.insert(0, os.path.join(ROOT, 'engine'))
import company
tone = sys.argv[1] if len(sys.argv) > 1 else 'emerald'
d = json.load(open(os.path.join(ROOT, 'engine', 'templates', 'company', 'sample-solideo.json'), encoding='utf-8'))
for x in d['slides']:
    x['_company'] = '㈜솔리데오'
r = company.render(d['slides'], os.path.join(ROOT, 'storage', 'tmp', 'company-rule'), log=lambda m: None, ctone=tone, ctheme='c')
from playwright.sync_api import sync_playwright
ZONE_JS = "() => { const e=[...document.querySelectorAll('[data-zone]')]; if(!e.length) return null; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const el of e){const b=el.getBoundingClientRect(); x0=Math.min(x0,b.left);y0=Math.min(y0,b.top);x1=Math.max(x1,b.right);y1=Math.max(y1,b.bottom);} return [x0,y0,x1,y1]; }"
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch(args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    for i, (x, rr) in enumerate(zip(d['slides'], r), 1):
        if x.get('_tone') != 'light':
            continue
        pg.goto('file:///' + rr['html'].replace('\\', '/'))
        pg.wait_for_load_state('networkidle')
        box = pg.evaluate(company.C_PAD_JS, {"pad": company.PAD, "r": company.PAD_R})
        zone = pg.evaluate(ZONE_JS)
        if not box:
            print(f'{i:02d} {x["kind"]:10s} 면 없음')
            continue
        l, t, r_, bt = zone[0] - box[0], zone[1] - box[1], (box[0] + box[2]) - zone[2], (box[1] + box[3]) - zone[3]
        ok = all(abs(v - company.PAD) < 0.6 for v in (l, t, r_, bt))
        bad += not ok
        print(f'{i:02d} {x["kind"]:10s} 여백 L{l:.0f} T{t:.0f} R{r_:.0f} B{bt:.0f} {"OK" if ok else "!!"}')
    b.close()
print('어긋남', bad)
