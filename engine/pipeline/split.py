# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/split.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""pptx 를 슬라이드 1장짜리 낱장들로 분할(zip 수술).
  - presentation.xml sldIdLst 에서 대상 1장만 남기고 섹션 목록 제거
  - 그 슬라이드가 쓰는 layout 만 남기도록 slideMaster 를 가지치기 → 미디어가 딸려오지 않음
  - notesMaster / handoutMaster 도 제거(낱장엔 불필요)
  - 도달 가능성 클로저로 파트 선별 + [Content_Types].xml 재작성
사용: python split.py <src.pptx> <outdir>
"""
import os, sys, zipfile
from xml.etree import ElementTree as ET

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
}
for k, v in NS.items():
    ET.register_namespace("" if k == "ct" else k, v)
RID = "{%s}id" % NS["r"]
T_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
T_LAYOUT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
T_MASTER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
T_NOTESM = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster"
T_HANDOUT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/handoutMaster"

src = os.path.abspath(sys.argv[1])
outdir = os.path.abspath(sys.argv[2])
os.makedirs(outdir, exist_ok=True)
zin = zipfile.ZipFile(src)
cache = {n: zin.read(n) for n in zin.namelist()}
zin.close()

relpath_of = lambda part: "{}/_rels/{}.rels".format(*os.path.split(part))


def parse_rels(part, blob=None):
    rp = relpath_of(part)
    data = blob if blob is not None else cache.get(rp)
    if data is None:
        return {}
    root = ET.fromstring(data)
    base = os.path.dirname(part)
    out = {}
    for rel in root:
        tgt, mode = rel.get("Target"), rel.get("TargetMode", "")
        if mode == "External":
            out[rel.get("Id")] = (tgt, rel.get("Type"), mode)
        else:
            out[rel.get("Id")] = (os.path.normpath(os.path.join(base, tgt)).replace("\\", "/"), rel.get("Type"), mode)
    return out


def strip_rels(part, drop_ids=(), drop_types=()):
    """rels 에서 특정 rId/Type 제거한 XML 바이트 반환."""
    root = ET.fromstring(cache[relpath_of(part)])
    for rel in list(root):
        if rel.get("Id") in drop_ids or rel.get("Type") in drop_types:
            root.remove(rel)
    return ET.tostring(root, encoding="UTF-8", xml_declaration=True)


pres = "ppt/presentation.xml"
pres_rels = parse_rels(pres)
proot = ET.fromstring(cache[pres])
slides = [(sid, pres_rels[sid.get(RID)][0]) for sid in proot.find("p:sldIdLst", NS)]
print(f"슬라이드 {len(slides)}장")

CT = ET.fromstring(cache["[Content_Types].xml"])
default_ext = {d.get("Extension").lower(): d.get("ContentType") for d in CT if d.tag.endswith("Default")}
overrides = {o.get("PartName").lstrip("/"): o.get("ContentType") for o in CT if o.tag.endswith("Override")}

for idx, (sid, spart) in enumerate(slides, start=1):
    keep_rid = sid.get(RID)
    srels = parse_rels(spart)
    layout = next((t for t, ty, m in srels.values() if ty == T_LAYOUT), None)
    master = None
    if layout:
        master = next((t for t, ty, m in parse_rels(layout).values() if ty == T_MASTER), None)

    patched = {}   # 파트경로 -> 새 바이트(본문/rels)

    # ── 마스터 가지치기: 이 슬라이드가 쓰는 layout 만 남긴다
    if master:
        mrels = parse_rels(master)
        keep_lay_rid = next((rid for rid, (t, ty, m) in mrels.items() if ty == T_LAYOUT and t == layout), None)
        mroot = ET.fromstring(cache[master])
        lst = mroot.find("p:sldLayoutIdLst", NS)
        drop = []
        if lst is not None:
            for e in list(lst):
                if e.get(RID) != keep_lay_rid:
                    drop.append(e.get(RID)); lst.remove(e)
        patched[master] = ET.tostring(mroot, encoding="UTF-8", xml_declaration=True)
        patched[relpath_of(master)] = strip_rels(master, drop_ids=set(drop))

    # ── presentation: 이 슬라이드만 + 섹션/노트마스터/유인물 제거
    pr = ET.fromstring(cache[pres])
    lst = pr.find("p:sldIdLst", NS)
    for e in list(lst):
        if e.get(RID) != keep_rid:
            lst.remove(e)
    for tag in ("p:notesMasterIdLst", "p:handoutMasterIdLst"):
        el = pr.find(tag, NS)
        if el is not None:
            pr.remove(el)
    ext = pr.find("p:extLst", NS)
    if ext is not None:
        for e in list(ext):
            if "sectionLst" in ET.tostring(e, encoding="unicode"):
                ext.remove(e)
        if len(ext) == 0:
            pr.remove(ext)
    patched[pres] = ET.tostring(pr, encoding="UTF-8", xml_declaration=True)

    prr = ET.fromstring(cache[relpath_of(pres)])
    for rel in list(prr):
        ty = rel.get("Type", "")
        if (ty == T_SLIDE and rel.get("Id") != keep_rid) or ty in (T_NOTESM, T_HANDOUT):
            prr.remove(rel)
    patched[relpath_of(pres)] = ET.tostring(prr, encoding="UTF-8", xml_declaration=True)

    # ── 슬라이드 rels: 노트슬라이드 제거
    srel_root = ET.fromstring(cache[relpath_of(spart)])
    for rel in list(srel_root):
        if rel.get("Type", "").endswith("/notesSlide"):
            srel_root.remove(rel)
    patched[relpath_of(spart)] = ET.tostring(srel_root, encoding="UTF-8", xml_declaration=True)

    # ── 클로저(패치된 rels 반영)
    seen, stack = set(), [pres, spart]
    while stack:
        p = stack.pop()
        if p in seen or (p not in cache and p not in patched):
            continue
        seen.add(p)
        rp = relpath_of(p)
        blob = patched.get(rp, cache.get(rp))
        if blob is None:
            continue
        seen.add(rp)
        for tgt, _ty, mode in parse_rels(p, blob).values():
            if mode != "External" and tgt in cache and tgt not in seen:
                stack.append(tgt)

    keep = set(seen) | {"[Content_Types].xml", "_rels/.rels"}
    keep |= {"docProps/app.xml", "docProps/core.xml"} & set(cache)

    ct = ET.Element("{%s}Types" % NS["ct"])
    used = {os.path.splitext(p)[1].lstrip(".").lower() for p in keep if "." in p}
    for e, t in default_ext.items():
        if e in used:
            d = ET.SubElement(ct, "{%s}Default" % NS["ct"]); d.set("Extension", e); d.set("ContentType", t)
    for p in sorted(keep):
        if p in overrides:
            o = ET.SubElement(ct, "{%s}Override" % NS["ct"]); o.set("PartName", "/" + p); o.set("ContentType", overrides[p])
    patched["[Content_Types].xml"] = ET.tostring(ct, encoding="UTF-8", xml_declaration=True)

    dst = os.path.join(outdir, f"s{idx:02d}.pptx")
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(keep):
            z.writestr(p, patched.get(p, cache[p]))
    print(f"  s{idx:02d}.pptx  {os.path.getsize(dst)/1e6:5.2f}MB")
print("완료")
