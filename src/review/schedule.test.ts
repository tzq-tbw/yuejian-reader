import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  initialSchedule,
  isValidLocalDate,
  localDateKey,
  nextSchedule,
} from "./schedule";

describe("词语复习排程", () => {
  it("收藏次日首测", () => {
    expect(initialSchedule("2026-11-23")).toEqual({
      stage: 0,
      dueDate: "2026-11-24",
    });
  });

  it("次日记得后间隔 2 天，连续记得为 2/4/7/15/30，此后每 30 天", () => {
    // 周一 11-23 收藏，周二 11-24 首测记得，周四 11-26 再测。
    let state = nextSchedule({
      stage: 0,
      rating: "remembered",
      forgottenToday: false,
      today: "2026-11-24",
    });
    expect(state).toEqual({ stage: 1, dueDate: "2026-11-26" });

    let today = state.dueDate;
    for (const days of [4, 7, 15, 30, 30, 30]) {
      state = nextSchedule({
        stage: state.stage,
        rating: "remembered",
        forgottenToday: false,
        today,
      });
      expect(state.dueDate).toBe(addLocalDays(today, days));
      today = state.dueDate;
    }
    expect(state.stage).toBe(5);
  });

  it("漏一天从实际完成日计算下一次", () => {
    // 原定 11-24，实际 11-25 才记得：下一次从 11-27 起算，而不是 11-26。
    expect(
      nextSchedule({
        stage: 0,
        rating: "remembered",
        forgottenToday: false,
        today: "2026-11-25",
      }),
    ).toEqual({ stage: 1, dueDate: "2026-11-27" });

    // 阶段 1 逾期后完成：从实际完成日 +4 天。
    expect(
      nextSchedule({
        stage: 1,
        rating: "remembered",
        forgottenToday: false,
        today: "2026-12-03",
      }),
    ).toEqual({ stage: 2, dueDate: "2026-12-07" });
  });

  it("同轮忘记后最终答对：次日再测并重置间隔", () => {
    expect(
      nextSchedule({
        stage: 3,
        rating: "remembered",
        forgottenToday: true,
        today: "2026-11-26",
      }),
    ).toEqual({ stage: 0, dueDate: "2026-11-27" });
    expect(
      nextSchedule({
        stage: 4,
        rating: "forgotten",
        forgottenToday: true,
        today: "2026-11-26",
      }),
    ).toEqual({ stage: 0, dueDate: "2026-11-27" });
  });

  it("跨月、跨年和闰日按公历推进", () => {
    expect(addLocalDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addLocalDays("2026-01-31", 2)).toBe("2026-02-02");
    expect(addLocalDays("2026-12-30", 30)).toBe("2027-01-29");
    expect(addLocalDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addLocalDays("2026-11-24", -1)).toBe("2026-11-23");
  });

  it("本机日历日不受 UTC 偏移影响，非法日期被拒绝", () => {
    const local = new Date(2026, 10, 23, 0, 30);
    expect(localDateKey(local)).toBe("2026-11-23");
    expect(isValidLocalDate("2026-11-23")).toBe(true);
    expect(isValidLocalDate("2026-02-30")).toBe(false);
    expect(isValidLocalDate("2026-13-01")).toBe(false);
    expect(() => addLocalDays("2026/11/23", 1)).toThrow("YYYY-MM-DD");
  });
});