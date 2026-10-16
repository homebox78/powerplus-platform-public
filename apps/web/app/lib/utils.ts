// 공용 작은 도우미 — 클래스 합치기(cn, shadcn 기본)·날짜 표기·화면 제목에서 페이지 이름.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


