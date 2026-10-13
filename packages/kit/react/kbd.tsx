"use client";
// 키보드 키 — shadcn Kbd · KbdGroup (KRDS 토큰, 본문 글꼴 그대로)
//   <Kbd>Tab</Kbd>
//   <KbdGroup><Kbd>Ctrl</Kbd><span>+</span><Kbd>K</Kbd></KbdGroup>
import * as React from "react";
import { cx } from "./utils";

export const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(function Kbd({ className, ...props }, ref) {
  return <kbd ref={ref} className={cx("hb-kbd", className)} {...props} />;
});

export const KbdGroup = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(function KbdGroup({ className, ...props }, ref) {
  return <kbd ref={ref} className={cx("hb-kbd-group", className)} {...props} />;
});
