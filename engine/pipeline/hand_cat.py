# 출처: powerPlus/tools/ppt-pipeline/hand_cat.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
import json,sys,re
from collections import Counter
sys.stdout.reconfigure(encoding="utf-8")
res=json.load(open(sys.argv[1],encoding="utf-8"))
c=Counter(); ex={}
sz=Counter(); colpairs=Counter(); fontpairs=Counter()
for r in res:
    if r[1]!="변경": continue
    for part in r[4].split("; "):
        f=part.split(" ")[0]; c[f]+=1; ex.setdefault(f,[]).append((r[0],r[3],part[:90]))
        if f=="sizes":
            m=re.findall(r"\[([^\]]*)\]",part)
            if len(m)==2 and m[0] and m[1]:
                a=[float(x) for x in m[0].split(",")]; b=[float(x) for x in m[1].split(",")]
                sz["up" if max(b)>max(a) else "down" if max(b)<max(a) else "same"]+=1
        if f=="cols": colpairs[part[5:90]]+=1
        if f=="fonts": fontpairs[part[6:90]]+=1
print(c); print(sz)
print("COLS",colpairs.most_common(15)); print("FONTS",fontpairs.most_common(10))
for f in ("text","ls","w","h"):
    print("==",f); [print(e) for e in ex.get(f,[])[:12]]
add=[r for r in res if r[1]=="추가"]; dele=[r for r in res if r[1]=="삭제"]
print("추가 글",[ (r[0],r[3]) for r in add if r[3]][:25])
print("삭제 글",[ (r[0],r[3]) for r in dele if r[3]][:25])
