"use client";
// 아바타 — shadcn Avatar · AvatarImage · AvatarFallback (KRDS 토큰)
//   <Avatar size="large">
//     <AvatarImage src="/img/mayor.jpg" alt="한빛시장 김한빛" />
//     <AvatarFallback>김</AvatarFallback>     ← 사진을 못 불러오면 대신 보인다
//   </Avatar>
//
// 사진은 다 불러온 뒤에만 보이고, 실패하거나 없으면 대체 글자가 보인다.
// 대체 글자만 있을 때 스크린리더 이름은 aria-label 로 준다(<Avatar aria-label="담당자 이수민">).
import * as React from "react";
import { cx } from "./utils";

type Status = "idle" | "loading" | "loaded" | "error";
const AvatarCtx = React.createContext<{ status: Status; setStatus: (s: Status) => void }>({ status: "idle", setStatus: () => {} });

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "small" | "medium" | "large" | "xlarge";
  shape?: "circle" | "rounded";
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { size = "medium", shape = "circle", className, role, ...props },
  ref,
) {
  const [status, setStatus] = React.useState<Status>("idle");
  return (
    <AvatarCtx.Provider value={{ status, setStatus }}>
      <span
        ref={ref}
        role={role ?? (props["aria-label"] ? "img" : undefined)}
        className={cx("hb-avatar", size, shape === "rounded" && "rounded", className)}
        {...props}
      />
    </AvatarCtx.Provider>
  );
});

export const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(function AvatarImage(
  { src, className, alt = "", ...props },
  ref,
) {
  const { status, setStatus } = React.useContext(AvatarCtx);
  React.useEffect(() => {
    if (!src) {
      setStatus("error");
      return;
    }
    let live = true;
    setStatus("loading");
    const img = new Image();
    img.onload = () => live && setStatus("loaded");
    img.onerror = () => live && setStatus("error");
    img.src = src;
    return () => {
      live = false;
    };
  }, [src, setStatus]);
  if (status !== "loaded") return null;
  return <img ref={ref} src={src} alt={alt} className={cx("hb-avatar-image", className)} {...props} />;
});

export const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(function AvatarFallback(
  { className, ...props },
  ref,
) {
  const { status } = React.useContext(AvatarCtx);
  if (status === "loaded") return null;
  return <span ref={ref} className={cx("hb-avatar-fallback", className)} {...props} />;
});
