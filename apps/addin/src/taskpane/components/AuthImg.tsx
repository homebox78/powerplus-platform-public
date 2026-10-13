// 썸네일 — 사내 전용 에셋은 로그인 키(Bearer)가 있어야 열리는데 <img> 는 헤더를 못 단다 → 받아서 blob 주소로 보여 준다.
// 플랫폼 밖 주소(data:·mock svg)는 그대로 쓴다. 화면에 들어올 때만 받는다(lazy).
import * as React from "react";
import { getToken, SITE_BASE } from "../api/config";

const cache = new Map<string, Promise<string>>();

function load(src: string): Promise<string> {
  let p = cache.get(src);
  if (!p) {
    const token = getToken();
    p = fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => URL.createObjectURL(b));
    p.catch(() => cache.delete(src));
    cache.set(src, p);
  }
  return p;
}

export default function AuthImg({ src, alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement> & { src?: string }) {
  const ours = !!src && src.startsWith(SITE_BASE + "/api/");
  const [url, setUrl] = React.useState<string | undefined>(ours ? undefined : src);
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    if (!ours || !src) { setUrl(src); return; }
    let alive = true;
    const el = ref.current;
    const go = () => load(src).then((u) => { if (alive) setUrl(u); }).catch(() => undefined);
    if (!el || !("IntersectionObserver" in window)) { go(); return () => { alive = false; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [src, ours]);
  return <img ref={ref} src={url ?? "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"} alt={alt} {...rest} />;
}
