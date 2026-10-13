# 도구 목록 — `D:\powerPlus\tools\ppt-pipeline`

인자는 대부분 `<src> <dst>`. **COM** = PowerPoint 실행 필요(대상 파일이 열려 있으면 실패).

## 실측·렌더 (읽기 전용)
| 도구 | 하는 일 |
|---|---|
| `render.py <pptx> <outdir> [번호...]` | COM 으로 슬라이드 PNG |
| `sheet.py <from> <to>` | `thumbs/s*.png` 4열 번호 컨택트시트 |
| `tone_audit.py <pptx>` | 서체(글상자 기본값 포함)·7pt 미만·팔레트 밖 색·합성 굵게·형제 크기 차 |
| `tone_overflow.py <pptx> <out.json>` | 넘침을 위치 키로 저장(원본 대조용) — COM |
| `line_scan.py <pptx>` | 렌더 줄 기준 어절 끊김·짧은 줄·넘침 — COM |
| `pic_survey.py <pptx> <접두> [최소in²]` | 전 그림 번호 시트 |
| `dump.py` | 슬라이드별 텍스트 |

## 톤 (4단계)
| 도구 | 하는 일 |
|---|---|
| `tone_font.py` | 런 서체 3역할(흰 글자·12pt↑만 강조), 메모 제외 |
| `font_inherit.py` | lstStyle·테마 기본값 서체까지 |
| `tone_fit.py <src> <dst> <fixlist.json>` | 지정 도형 0.25pt 씩 최대 2pt |
| `tone_color.py <src> <dst\|-> [임계]` / `color_snap.py` | 근접색 → 팔레트(그라데이션 스톱 제외) |
| `tone_size.py` | 소수 pt 내림 |
| `smallfont_rule.py` · `unbold_font.py` | 작은 글 서체 · 합성 굵게 해제 |

## 그림 (5·6단계)
| 도구 | 하는 일 |
|---|---|
| `extract.py <pptx> <out> <시작>` | 아이콘 후보 + 가까운 글자 3개 |
| `iconsheet.py <dir>` | 번호·문맥 시트 |
| `find.py <out> "번호:검색어"...` | powerPlus 후보 시트 |
| `set_swap.py <src> <dst> <spec.json>` | 도형 지목 세트 교체(잉크 맞춤·hdphoto·다시칠하기 제거) |
| `swap.py` · `icon_swap_shape.py` | 배치 순서 / 도형 단위 교체 |
| `shape_scan_circle.py` · `shape_scan_cluster.py` | 도형 아이콘 탐지 2방식 |
| `crop_groups.py` · `mark_groups.py` | 자리 크롭 시트 · 번호 마킹 |
| `shapeswap_all.py` · `shapeswap_bbox.py` · `shapeswap_lib.py` · `map.sample.py` | 도형 아이콘 → 자산 |
| `mass_even.py <src> <dst> <targets.json>` | 여백 트림 + 덩어리감 — COM |
| `icon_massnorm.py` · `icon_enlarge.py` · `icon_hashswap.py` · `icon_dedupe.py` | 크기 무리·최소 크기·일괄 교체·중복 제거 |
| `icon_text_align.py` · `badge_text_align.py` · `card_center.py` · `card_icon_left_reflow.py` | 아이콘↔글자·뱃지·카드 중심·재배치 — COM |

## 도식 (7단계)
| 도구 | 하는 일 |
|---|---|
| `diagram/diag.py` | `Diagram(slide, pic, px폭, px높이)` 원본 px 좌표로 box·label·line·table·diamond, `finish()` |
| `diagram/run_diag.py <src> <dst> d_s20 ...` | 명세 적용 |
| `diagram/rebuild_on.py` | 손본 판 위에 도식만 다시 |
| `diagram/absbox.py` | 그룹 변환을 풀어 절대 좌표 |
| `diagram_lines.py` | 선 0.5pt·25%(제외 규칙 내장) |
| `color_unify.py` | 회색·회청 채우기 → 파란 팔레트 밝기표 |
| `diagram_roles.py` | 도식 장 역할 색 통일(시작·처리·판단·보조·종료) |
| `memo_offslide.py <열린문서이름> [apply <저장경로>]` | 노랑 스마일 메모를 슬라이드 오른쪽 밖(+0.3in)으로 — 삭제 없이 슬라이드쇼에서 숨김 — COM |
| `keymsg_color.py <열린문서이름> [apply <저장경로>]` | 전 장 키메시지 색을 기준 장 색으로(열린 문서에 적용 후 SaveCopyAs) — COM |
| `arrow_gradient.py` · `band_round_top.py` | 화살표 그라데이션 · 윗모서리 둥근 밴드(XML) |
| `lines_thin.py` · `lines_alpha.py` | 착수보고 선 규격(0.75/1pt·30%) |

## 마감 (8단계)
| 도구 | 하는 일 |
|---|---|
| `text3d_off.py` | 글상자 3D 제거 |
| `spc_relax.py` | 과한 음수 자간 완화 |
| `fit_breaks.py` | 어절 끊김 — COM |
| `orphan_balance.py` · `orphan_line.py` · `nobreak_korean.py` · `dash_linebreak.py` | 고아 줄·어절·대시 — COM |
| `margin_even.py` | 도형 안 좌측 정렬 글 여백 — COM |
| `guide_align.py <src> <render_dir> <dst> [장]` | 가이드 맞춤(렌더 픽셀) |

## 검수 (9단계)
`audit_checklist.py`(착수보고 13항목) · `fix_audit_residual.example.py`

## 등록 (powerPlus)
`optimize.py` · `split.py` · `stage.py` · `meta.sample.py` · 서버 `server/bin/import-ppt.php`

## 일회성 예시(그대로 재사용 금지, 참고용)
`card_fit_illust.example.py` · `icon_tile_swap.sample_s11.py` · `diagram/d_s*.py` · `set_swap.sample.json` · `*.sample.py`(s16_emph·s16_layout·s22_map·s25_list·s7_fill·v24_batch·guide_right13 — 판별 일회성, 기법 참고용)

## 원본 대조·교정 (OO시 v0.69)
| 도구 | 하는 일 |
|---|---|
| `text_diff.py <원본> <최종> <폴더>` | 장별 원본/최종 글·빠짐 후보·새 문구 txt + 장별 개수 |
| `sample_fix69.py <src> <dst> [--dry]` | 장별 (옛, 새) 문구 치환(런 걸침 합침) + 표 행 기준 쪽 번호 + 칸 아래 설명 줄 추가 예 |
| `linebreak_mark.py <pptx>` | 런 안 `_x000B_` 표시 → 실제 `<a:br/>` |
| `sheet_pick.py <렌더폴더> <out.png> 번호...` | 고른 장만 3열 번호 시트(눈검수 묶음용) |
| `icon_search.py <폴더> 검색어...` | powerPlus 공개 API 아이콘 후보 번호 시트(한글 검색은 git-bash curl 금지, Python urllib) |
| `sample_color68.py` · `sample_swap68.json` | 문맥 점검 색 보정·아이콘 교체 지정표 예(v0.68) |

## OO시 v0.74~v0.78 에서 만든 도구 (전 장 규칙)
| 도구 | 하는 일 | 인자 |
|---|---|---|
| `group_title_lib.py` | `walk()`(그룹 변환 반영 절대 좌표)·`fill_rgb()` 공용 | — |
| `bar_center.py` | 칸 머리 띠 = 18pt·a시월구일3·가운데·아이콘 삭제, 장별 한 줄 띠 크기 통일 | `<src> <dst> [--dry]` |
| `small_font3.py` | 작은 도형 a시월구일4 → 3 | `<src> <dst>` |
| `small_bar.py` | 꽉 찬 작은 띠 15% 축소·13pt 이하(제외 장은 코드 상단) | `<src> <dst>` |
| `vcenter_text.py` | 도형 안 글 잉크 기준 세로 가운데(COM, 41장 12분) | `<src> <dst> [--slides]` |
| `fit_edges.py` | 바탕 도형 끝에 닿는 글 0.5pt 단위 축소(COM) | `<src> <dst> [--dry] [--slides]` |
| `fill_box.py` | 글이 상자보다 작아 휑할 때 줄간격·글자로 88% 채움(COM) | `<src> <dst> --slide N --match 글` |
| `keymsg_color.py` | 키메시지 하이라이트 색 일괄 | `<src> <dst> [색]` |
| `keymsg_top.py` | '키메시지' 도형 세로 위치 통일 | `<src> <dst> [cm] [--skip 4,…]` |
| `restore/sNNb.py` | 장 하나를 원본 기준으로 복원·다듬기 | `<src> <dst>` |
| `restore/v077_chain.sh` | 위를 정해진 순서로 묶은 조립 파일 — 새 장표도 이 틀로 | — |
| `hand_diff.py` · `hand_cat.py` | 내 판 vs 사용자가 손으로 고친 판 — 도형별 위치·크기·글자·줄간격 변경 json + 종류별 집계 | `<내판> <사용자판> <out.json>` / `<out.json>` |
| `text_stats.py` | 글자 크기·줄간격·서체 분포(글자 수 비중) — 기준 판(`제안서/_gold`)과 나란히 | `<pptx> [<pptx>…]` |
