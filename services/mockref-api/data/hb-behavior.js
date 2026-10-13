/* 홈박스 목업 동작 스크립트 (hb-behavior) — 마크업에 data-hb 속성만 붙이면 움직인다. 외부 의존 없음.
 * 규약: api/data/hb-behavior.md */
(function () {
  "use strict";
  var d = document;
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function own(root, sel, kind) {
    return all(root, sel).filter(function (el) { return el.closest('[data-hb="' + kind + '"]') === root; });
  }
  function show(el, on) { if (on) el.removeAttribute("hidden"); else el.setAttribute("hidden", ""); }
  function find(sel) { try { return sel ? d.querySelector(sel) : null; } catch (e) { return null; } }
  function asButton(el, label) {
    var tag = el.tagName;
    if (tag !== "BUTTON" && !(tag === "A" && el.hasAttribute("href"))) {
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
      });
    }
    if (tag === "BUTTON" && !el.hasAttribute("type")) el.setAttribute("type", "button");
    if (label && !el.hasAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", label);
    el.style.cursor = "pointer";
  }

  /* ── 캐러셀 ─────────────────────────────────────────── */
  function carousel(root) {
    var slides = own(root, "[data-hb-slide]", "carousel");
    if (!slides.length) return;
    var per = Math.max(1, parseInt(root.getAttribute("data-hb-per") || "1", 10));
    var pages = Math.ceil(slides.length / per);
    var auto = parseInt(root.getAttribute("data-hb-auto") || "0", 10);
    var i = Math.min(pages - 1, Math.max(0, parseInt(root.getAttribute("data-hb-start") || "1", 10) - 1));
    var padN = parseInt(root.getAttribute("data-hb-pad") || "1", 10);
    function pad(n) { var t = String(n); while (t.length < padN) t = "0" + t; return t; }
    var playing = auto > 0 && !REDUCE, held = false, timer = null;
    var cur = own(root, "[data-hb-current]", "carousel"), tot = own(root, "[data-hb-total]", "carousel");
    var dots = own(root, "[data-hb-dot]", "carousel");
    var pause = own(root, "[data-hb-pause]", "carousel");
    function render() {
      slides.forEach(function (s, n) {
        var on = Math.floor(n / per) === i;
        show(s, on);
        s.setAttribute("aria-hidden", on ? "false" : "true");
      });
      cur.forEach(function (c) { c.textContent = pad(i + 1); });
      tot.forEach(function (c) { c.textContent = pad(pages); });
      dots.forEach(function (b, n) {
        if (n === i) { b.setAttribute("aria-current", "true"); b.classList.add("on"); }
        else { b.removeAttribute("aria-current"); b.classList.remove("on"); }
      });
      root.setAttribute("data-hb-index", String(i + 1));
    }
    function go(n) { i = (n + pages) % pages; render(); }
    function tick() {
      clearInterval(timer);
      if (playing && !held && pages > 1) timer = setInterval(function () { go(i + 1); }, auto);
    }
    function setPlaying(p) {
      playing = p;
      pause.forEach(function (b) {
        b.setAttribute("aria-pressed", p ? "false" : "true");
        b.setAttribute("aria-label", p ? "자동 넘김 정지" : "자동 넘김 재생");
        all(b, "[data-hb-when]").forEach(function (ic) { show(ic, ic.getAttribute("data-hb-when") === (p ? "playing" : "paused")); });
      });
      root.setAttribute("data-hb-playing", p ? "1" : "0");
      tick();
    }
    own(root, "[data-hb-prev]", "carousel").forEach(function (b) { asButton(b, "이전"); b.addEventListener("click", function (e) { e.preventDefault(); go(i - 1); tick(); }); });
    own(root, "[data-hb-next]", "carousel").forEach(function (b) { asButton(b, "다음"); b.addEventListener("click", function (e) { e.preventDefault(); go(i + 1); tick(); }); });
    dots.forEach(function (b, n) { asButton(b, (n + 1) + "번째"); b.addEventListener("click", function (e) { e.preventDefault(); go(n); tick(); }); });
    pause.forEach(function (b) { asButton(b, "정지"); b.addEventListener("click", function (e) { e.preventDefault(); setPlaying(!playing); }); });
    root.addEventListener("mouseenter", function () { held = true; tick(); });
    root.addEventListener("mouseleave", function () { held = false; tick(); });
    root.addEventListener("focusin", function () { held = true; tick(); });
    root.addEventListener("focusout", function () { held = false; tick(); });
    root.setAttribute("aria-roledescription", "carousel");
    render(); setPlaying(playing);
  }

  /* ── 탭: 패널 전환 또는 목록 거르기 ─────────────────── */
  function tabs(root) {
    var ts = own(root, "[data-hb-tab]", "tabs");
    if (!ts.length) return;
    var panels = own(root, "[data-hb-panel]", "tabs");
    var items = own(root, "[data-hb-cat]", "tabs");
    var onCls = root.getAttribute("data-hb-on") || "on";
    var empty = own(root, "[data-hb-empty]", "tabs");
    function pick(key) {
      ts.forEach(function (t) {
        var on = t.getAttribute("data-hb-tab") === key;
        t.classList.toggle(onCls, on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.setAttribute("tabindex", on ? "0" : "-1");
      });
      panels.forEach(function (p) { show(p, p.getAttribute("data-hb-panel") === key); });
      var shown = 0;
      items.forEach(function (it) {
        var on = key === "all" || it.getAttribute("data-hb-cat") === key;
        show(it, on); if (on) shown++;
      });
      if (items.length) empty.forEach(function (e) { show(e, shown === 0); });
      root.setAttribute("data-hb-active", key);
    }
    ts.forEach(function (t, n) {
      asButton(t); t.setAttribute("role", "tab");
      t.addEventListener("click", function (e) { e.preventDefault(); pick(t.getAttribute("data-hb-tab")); });
      t.addEventListener("keydown", function (e) {
        var k = e.key, to = -1;
        if (k === "ArrowRight" || k === "ArrowDown") to = (n + 1) % ts.length;
        if (k === "ArrowLeft" || k === "ArrowUp") to = (n - 1 + ts.length) % ts.length;
        if (k === "Home") to = 0;
        if (k === "End") to = ts.length - 1;
        if (to >= 0) { e.preventDefault(); ts[to].focus(); ts[to].click(); }
      });
    });
    panels.forEach(function (p) { p.setAttribute("role", "tabpanel"); });
    var first = ts.filter(function (t) { return t.classList.contains(onCls); })[0] || ts[0];
    pick(first.getAttribute("data-hb-tab"));
  }

  /* ── 주 메뉴: 올리거나 초점이 가면 하위 메뉴가 열린다 ── */
  function menu(root) {
    var its = own(root, "[data-hb-menu]", "menu");
    var closeT = null;
    // 전체 펼침 판 하나를 모든 항목이 같이 쓴다(data-hb-mega) — 항목마다 같은 열을 복제하지 않게(2026-10-03 시험 5건). 열은 data-hb-col="항목 순번(0부터)"
    var mega = root.querySelector("[data-hb-mega]");
    if (mega) show(mega, false);
    function open(it) {
      clearTimeout(closeT);
      if (mega) {
        show(mega, !!it);
        var idx = its.indexOf(it);
        all(mega, "[data-hb-col]").forEach(function (c) { c.classList.toggle("on", String(idx) === c.getAttribute("data-hb-col")); });
        its.forEach(function (o) { var tr = o.querySelector("a,button"); if (tr) tr.setAttribute("aria-expanded", it ? "true" : "false"); });
      }
      its.forEach(function (o) {
        var on = o === it;
        o.classList.toggle("open", on);
        var sub = o.querySelector("[data-hb-sub]"); if (sub) show(sub, on);
        var tr = o.querySelector("a,button"); if (tr && sub) tr.setAttribute("aria-expanded", on ? "true" : "false");
      });
      root.classList.toggle("open", !!it);
    }
    its.forEach(function (it) {
      var sub = it.querySelector("[data-hb-sub]"); if (sub) show(sub, false);
      it.addEventListener("mouseenter", function () { open(it); });
      it.addEventListener("focusin", function () { open(it); });
      var tr = it.querySelector("a,button");
      if (tr && sub) tr.addEventListener("click", function (e) {
        if (tr.getAttribute("href") === "#" || tr.tagName === "BUTTON") { e.preventDefault(); open(it); }
      });
    });
    root.addEventListener("mouseleave", function () { closeT = setTimeout(function () { open(null); }, 120); });
    root.addEventListener("focusout", function (e) { if (!root.contains(e.relatedTarget)) open(null); });
    root.addEventListener("keydown", function (e) { if (e.key === "Escape") open(null); });
  }

  /* ── 레이어 열고 닫기 (검색·전체메뉴·언어·관련사이트) ── */
  var opened = [];
  function layerOf(tr) { return find(tr.getAttribute("data-hb-open")); }
  function setLayer(tr, on) {
    var l = layerOf(tr); if (!l) return;
    show(l, on); tr.setAttribute("aria-expanded", on ? "true" : "false");
    opened = opened.filter(function (o) { return o !== tr; });
    if (on) {
      opened.push(tr);
      var f = l.querySelector("input,[data-hb-focus],a[href],button");
      if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 0);
    }
  }
  function layers() {
    all(d, "[data-hb-open]").forEach(function (tr) {
      var l = layerOf(tr); if (!l) return;
      asButton(tr);
      show(l, false);
      tr.setAttribute("aria-expanded", "false");
      if (l.id) tr.setAttribute("aria-controls", l.id);
      tr.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); var on = l.hasAttribute("hidden"); opened.slice().forEach(function (o) { if (o !== tr && !layerOf(o).contains(tr)) setLayer(o, false); }); setLayer(tr, on); });
    });
    all(d, "[data-hb-close]").forEach(function (b) {
      asButton(b, "닫기");
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var t = find(b.getAttribute("data-hb-close")) || b.closest("[data-hb-layer],[data-hb-dismissable]");
        if (!t) return;
        var tr = opened.filter(function (o) { return layerOf(o) === t; })[0];
        if (tr) { setLayer(tr, false); tr.focus(); } else show(t, false);
      });
    });
    d.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !opened.length) return;
      var tr = opened[opened.length - 1]; setLayer(tr, false); tr.focus();
    });
    d.addEventListener("click", function (e) {
      opened.slice().forEach(function (tr) {
        var l = layerOf(tr);
        if (l && !l.hasAttribute("data-hb-modal") && !l.contains(e.target) && !tr.contains(e.target)) setLayer(tr, false);
      });
    });
    /* 선택 상자: 레이어 안 항목을 고르면 여는 단추의 글이 바뀐다 */
    all(d, "[data-hb-option]").forEach(function (o) {
      asButton(o);
      o.addEventListener("click", function (e) {
        var tr = opened.filter(function (t) { var l = layerOf(t); return l && l.contains(o); })[0];
        if (o.getAttribute("href") === "#" || !o.hasAttribute("href")) e.preventDefault();
        if (!tr) return;
        var l = layerOf(tr);
        var lab = tr.querySelector("[data-hb-label]");
        if (lab) lab.textContent = o.getAttribute("data-hb-option") || o.textContent.trim();
        all(l, "[data-hb-option]").forEach(function (x) {
          x.classList.toggle("on", x === o);
          if (x === o) x.setAttribute("aria-current", "true"); else x.removeAttribute("aria-current");
        });
        setLayer(tr, false); tr.focus();
      });
    });
  }

  /* ── 검색: 이 페이지의 글에서 찾아 결과를 보여 준다 ──── */
  function search(form) {
    var input = form.querySelector("[data-hb-q]") || form.querySelector("input[type=search]") || form.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio])");
    var out = find(form.getAttribute("data-hb-results") || "#hb-results");
    if (!input || !out) return;
    function norm(s) { return s.split(/[ \t\r\n]+/).join(" ").trim(); }
    function run(q) {
      q = norm(q || ""); out.textContent = "";
      var head = d.createElement("p"); head.setAttribute("data-hb-result-head", "");
      if (!q) { head.textContent = "검색어를 입력해 주세요."; out.appendChild(head); out.setAttribute("data-hb-count", "0"); show(out, true); return; }
      var seen = {}, hits = [];
      all(d, "main a, main h2, main h3, main li, main dd").forEach(function (el) {
        if (out.contains(el) || form.contains(el)) return;
        if (el.tagName !== "A" && el.querySelector("a")) return; // 안쪽 링크가 따로 잡힌다(같은 글 두 번 방지)
        var t = norm(el.textContent);
        if (t.length < 2 || t.length > 80 || t.indexOf(q) < 0 || seen[t]) return;
        seen[t] = 1; hits.push({ t: t, el: el });
      });
      head.textContent = "'" + q + "' 검색 결과 " + hits.length + "건";
      out.appendChild(head);
      var ul = d.createElement("ul");
      hits.slice(0, 8).forEach(function (h) {
        var li = d.createElement("li"), a = d.createElement("a");
        a.href = "#"; a.textContent = h.t;
        a.addEventListener("click", function (e) {
          e.preventDefault(); show(out, false);
          if (!h.el.closest("[hidden]")) h.el.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "center" });
        });
        li.appendChild(a); ul.appendChild(li);
      });
      out.appendChild(ul); out.setAttribute("data-hb-count", String(hits.length)); show(out, true);
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); run(input.value); });
    all(d, "[data-hb-query]").forEach(function (a) {
      asButton(a);
      a.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        input.value = a.getAttribute("data-hb-query") || a.textContent.split("#").join("").trim();
        run(input.value); input.focus();
      });
    });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") show(out, false); });
    d.addEventListener("click", function (e) { if (!out.contains(e.target) && !form.contains(e.target)) show(out, false); });
    show(out, false);
  }

  /* ── 접기(아코디언)·맨 위로·빈 링크 ─────────────────── */
  function misc() {
    all(d, "[data-hb-acc]").forEach(function (b) {
      var p = find(b.getAttribute("data-hb-acc")) || b.nextElementSibling;
      if (!p) return;
      asButton(b); b.setAttribute("aria-expanded", p.hasAttribute("hidden") ? "false" : "true");
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var on = p.hasAttribute("hidden"); show(p, on);
        b.setAttribute("aria-expanded", on ? "true" : "false"); b.classList.toggle("on", on);
      });
    });
    all(d, "[data-hb-top]").forEach(function (b) {
      asButton(b, "맨 위로");
      b.addEventListener("click", function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: REDUCE ? "auto" : "smooth" }); });
    });
    d.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href="#"]'); if (a) e.preventDefault();
    });
  }

  function init() {
    if (!d.getElementById("hb-behavior-css")) {
      var st = d.createElement("style"); st.id = "hb-behavior-css";
      st.textContent = "[hidden]{display:none!important}[data-hb-slide]:not([hidden]){animation:hbIn .35s ease}@keyframes hbIn{from{opacity:.35}to{opacity:1}}@media (prefers-reduced-motion:reduce){[data-hb-slide]{animation:none!important}}[data-hb] :focus-visible,[data-hb-open]:focus-visible,[data-hb-close]:focus-visible{outline:2px solid currentColor;outline-offset:2px}";
      d.head.appendChild(st);
    }
    all(d, '[data-hb="carousel"]').forEach(carousel);
    all(d, '[data-hb="tabs"]').forEach(tabs);
    all(d, '[data-hb="menu"]').forEach(menu);
    layers();
    all(d, 'form[data-hb="search"]').forEach(search);
    misc();
    d.documentElement.setAttribute("data-hb-ready", "1");
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
})();
