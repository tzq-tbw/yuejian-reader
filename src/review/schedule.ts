import type { ReviewRating } from "../data/types";

/**
 * 词语复习排程的本地确定性实现（浏览器预览与单元测试使用）。
 * 桌面端由 src-tauri/src/review.rs 在同一事务内执行同一套规则：
 * 收藏次日首测；连续记得后间隔 2/4/7/15/30 天，之后每 30 天；
 * 漏复习从实际完成日计算；本轮曾忘记后最终记得则次日再测并重置间隔。
 */
export const REMEMBER_INTERVALS = [2, 4, 7, 15, 30] as const;
export const MAX_STAGE = 5;

export interface ScheduleState {
  stage: number;
  dueDate: string;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function dateParts(value: string): [number, number, number] {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error("日期必须使用 YYYY-MM-DD 格式");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1) {
    throw new Error(`日期不合法：${value}`);
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`日期不合法：${value}`);
  }
  return [year, month, day];
}

export function isValidLocalDate(value: string): boolean {
  try {
    dateParts(value);
    return true;
  } catch {
    return false;
  }
}

/** 本机日历日，不用 UTC，避免晚间跨日错误。 */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addLocalDays(value: string, days: number): string {
  if (!Number.isFinite(days) || !Number.isInteger(days)) {
    throw new Error("间隔天数必须是整数");
  }
  const [year, month, day] = dateParts(value);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

export function initialSchedule(today: string): ScheduleState {
  return { stage: 0, dueDate: addLocalDays(today, 1) };
}

export interface NextScheduleInput {
  stage: number;
  rating: ReviewRating;
  forgottenToday: boolean;
  /** 实际完成复习的本机日历日。 */
  today: string;
}

export function nextSchedule({
  stage,
  rating,
  forgottenToday,
  today,
}: NextScheduleInput): ScheduleState {
  if (!isValidLocalDate(today)) {
    throw new Error("复习日期必须使用 YYYY-MM-DD 格式");
  }
  if (!Number.isFinite(stage)) throw new Error("间隔阶段不合法");
  const safeStage = Math.min(MAX_STAGE, Math.max(0, Math.trunc(stage)));
  if (rating === "forgotten" || forgottenToday) {
    return { stage: 0, dueDate: addLocalDays(today, 1) };
  }
  if (rating !== "remembered") throw new Error("评分只能是记得或忘记");
  const nextStage = Math.min(MAX_STAGE, safeStage + 1);
  return {
    stage: nextStage,
    dueDate: addLocalDays(today, REMEMBER_INTERVALS[nextStage - 1]),
  };
}