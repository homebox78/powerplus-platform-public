"use client";
// 알림 — 두 가지
//
// 1) 안내 상자 — shadcn Alert 와 같은 사용법 (KRDS 토큰·아이콘으로 지었다)
//   <Alert variant="warning">
//     <AlertTitle>서비스 점검 안내</AlertTitle>
//     <AlertDescription>9월 27일(토) 02:00~06:00 민원 신청이 멈춥니다.</AlertDescription>
//   </Alert>
//   variant: info(기본) · success · warning · danger · neutral. 아이콘과 숨은 글("주의" 등)로 상태를 알린다(색만 쓰지 않음).
//   danger·warning 은 role="alert"(바로 읽음), 나머지는 role="status". role 을 넘기면 그것을 쓴다.
//
// 2) 긴급 공지 띠 — KRDS 「긴급 공지(critical alerts)」
//   <CriticalAlerts>
//     <CriticalAlert type="danger" href="/notice/1">호우 경보 — 하천변 산책로 출입을 통제합니다.</CriticalAlert>
//   </CriticalAlerts>
//   type: danger(긴급) · ok(안전) · info(안내)
import * as React from "react";
import { cx } from "./utils";

export type AlertVariant = "info" | "success" | "warning" | "danger" | "neutral";

const ALERT_ICON: Record<AlertVariant, string> = {
  info: "ico-information-fill",
  success: "ico-success-fill",
  warning: "hb-ico-warning",
  danger: "ico-error-fill",
  neutral: "ico-information-fill",
};
const ALERT_WORD: Record<AlertVariant, string> = {
  info: "안내",
  success: "완료",
  warning: "주의",
  danger: "오류",
  neutral: "알림",
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  /** 아이콘 숨기기 */
  hideIcon?: boolean;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { variant = "info", hideIcon, role, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role={role ?? (variant === "danger" || variant === "warning" ? "alert" : "status")}
      className={cx("hb-alert", `hb-alert-${variant}`, className)}
      {...props}
    >
      {!hideIcon && <i className={cx("svg-icon", ALERT_ICON[variant], "hb-alert-icon")} aria-hidden="true" />}
      <span className="sr-only">{ALERT_WORD[variant]}: </span>
      <div className="hb-alert-body">{children}</div>
    </div>
  );
});

export const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function AlertTitle({ className, ...props }, ref) {
    return <p ref={ref} className={cx("hb-alert-title", className)} {...props} />;
  },
);

export const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function AlertDescription({ className, ...props }, ref) {
    return <div ref={ref} className={cx("hb-alert-desc", className)} {...props} />;
  },
);

export interface CriticalAlertsProps extends React.HTMLAttributes<HTMLUListElement> {
  "aria-label"?: string;
}

export const CriticalAlerts = React.forwardRef<HTMLUListElement, CriticalAlertsProps>(function CriticalAlerts(
  { className, "aria-label": label = "긴급 공지", ...props },
  ref,
) {
  return (
    <div className="main-urgent-wrap">
      <ul ref={ref} className={cx("krds-critical-alerts", className)} aria-label={label} {...props} />
    </div>
  );
});

const CRITICAL_WORD = { danger: "긴급", ok: "안전", info: "안내" } as const;

export interface CriticalAlertProps extends Omit<React.LiHTMLAttributes<HTMLLIElement>, "children"> {
  type?: "danger" | "ok" | "info";
  /** 뱃지 글자(기본: 긴급·안전·안내) */
  badge?: string;
  /** 자세히 보기 주소 — 없으면 링크를 두지 않는다 */
  href?: string;
  linkText?: string;
  children: React.ReactNode;
}

export const CriticalAlert = React.forwardRef<HTMLLIElement, CriticalAlertProps>(function CriticalAlert(
  { type = "danger", badge, href, linkText = "자세히 보기", className, children, ...props },
  ref,
) {
  const word = badge ?? CRITICAL_WORD[type];
  return (
    <li ref={ref} className={className} {...props}>
      <div className="critical-ban">
        <span className={cx("critical-badge", type)}>{word}</span>
        <p className="critical-txt">{children}</p>
        {href && (
          <a href={href} className="krds-btn medium link basic">
            <span className="m-hide">{linkText}</span>
            <span className="sr-only"> ({word} 공지)</span>
            <i className="svg-icon ico-angle right" aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
});
