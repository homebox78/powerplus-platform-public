# powerPlus 카드 애니메이션 한 세트를 만든다.
#   main/  메인 카드 4종 (16:9, 1200x670)
#   steps/ 단계 카드 17종 (1:1, 400x400)
# 사용: python src/build.py
import os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
HEAD = open(os.path.join(HERE, 'head.html'), encoding='utf-8').read()
SQUARE = HEAD.replace('width:1200px;height:670px', 'width:400px;height:400px').replace('/1200,innerHeight/670', '/400,innerHeight/400')
ns = {}
exec(open(os.path.join(HERE, 'main.py'), encoding='utf-8').read(), ns)
exec(open(os.path.join(HERE, 'steps.py'), encoding='utf-8').read(), ns)

# 메인: 장면별 화면 중심(cx, cy)과 배율
FRAME = {'assets': (672, 300, '1.08'), 'deck': (693, 340, '1.07'), 'mock': (622, 318, '.98'), 'guide': (624, 305, '1.0')}
TITLE = {'assets': 'powerAssets', 'deck': 'powerDeck', 'mock': 'powerMock', 'guide': 'powerGuide'}
for d in ('main', 'steps'):
    os.makedirs(os.path.join(ROOT, d), exist_ok=True)
for name, js in ns['MAIN'].items():
    cx, cy, s = FRAME[name]
    open(os.path.join(ROOT, 'main', f'{name}.html'), 'w', encoding='utf-8').write(HEAD % {'title': TITLE[name], 'css': '', 'js': js, 'cx': cx, 'cy': cy, 's': s})
for name, js in ns['STEPS'].items():
    open(os.path.join(ROOT, 'steps', f'{name}.html'), 'w', encoding='utf-8').write(SQUARE % {'title': name, 'css': '', 'js': js, 'cx': 200, 'cy': 198, 's': '.98'})
print(len(ns['MAIN']), 'main +', len(ns['STEPS']), 'steps')
