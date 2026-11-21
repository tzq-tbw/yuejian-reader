//! 词语复习排程：本机日历日与确定性间隔计算。
//!
//! 收藏次日首测；连续记得后依次间隔 2、4、7、15、30 天，之后每 30 天。
//! 漏复习从实际完成日计算下一次；本轮曾忘记的卡最终记得后次日再测并重置间隔。
//! 日期格式统一为 `YYYY-MM-DD`，计算使用公历天数，不依赖时区或系统时钟。

pub const REMEMBER_INTERVALS: [i64; 5] = [2, 4, 7, 15, 30];
pub const MAX_STAGE: i64 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rating {
    Remembered,
    Forgotten,
}

impl Rating {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "remembered" => Ok(Rating::Remembered),
            "forgotten" => Ok(Rating::Forgotten),
            _ => Err("评分只能是 remembered 或 forgotten".into()),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Rating::Remembered => "remembered",
            Rating::Forgotten => "forgotten",
        }
    }
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let day_of_year = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let day_of_era =
        year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let days = days + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    (if month <= 2 { year + 1 } else { year }, month, day)
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        _ => 0,
    }
}

pub fn parse_date(value: &str) -> Result<(i64, i64, i64), String> {
    let bytes = value.as_bytes();
    let shape_ok = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());
    if !shape_ok {
        return Err("日期必须使用 YYYY-MM-DD 格式".into());
    }
    let year: i64 = value[0..4].parse().map_err(|_| "日期格式不合法")?;
    let month: i64 = value[5..7].parse().map_err(|_| "日期格式不合法")?;
    let day: i64 = value[8..10].parse().map_err(|_| "日期格式不合法")?;
    if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
        return Err(format!("日期不合法：{value}"));
    }
    Ok((year, month, day))
}

pub fn is_valid_date(value: &str) -> bool {
    parse_date(value).is_ok()
}

fn format_date(year: i64, month: i64, day: i64) -> String {
    format!("{year:04}-{month:02}-{day:02}")
}

pub fn add_days(date: &str, days: i64) -> Result<String, String> {
    let (year, month, day) = parse_date(date)?;
    let (year, month, day) = civil_from_days(days_from_civil(year, month, day) + days);
    Ok(format_date(year, month, day))
}

/// 收藏当天的次日作为首次测试日期。
pub fn initial_due_date(today: &str) -> Result<String, String> {
    add_days(today, 1)
}

/// 根据评分与当天是否已有忘记记录，计算新的间隔阶段与到期日期。
///
/// - 忘记：间隔重置，次日再测；
/// - 本轮曾忘记后最终记得：同样次日再测并重置；
/// - 连续记得：阶段前进，按 2/4/7/15/30 天排下一次；
/// - 漏复习时以实际完成日（today）为基准，不按原到期日补算。
pub fn next_schedule(
    stage: i64,
    rating: Rating,
    forgotten_today: bool,
    today: &str,
) -> Result<(i64, String), String> {
    if rating == Rating::Forgotten || forgotten_today {
        return Ok((0, add_days(today, 1)?));
    }
    let stage = stage.clamp(0, MAX_STAGE);
    let next_stage = (stage + 1).min(MAX_STAGE);
    let interval = REMEMBER_INTERVALS[(next_stage - 1) as usize];
    Ok((next_stage, add_days(today, interval)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collection_is_due_the_next_day() {
        assert_eq!(initial_due_date("2026-11-23").unwrap(), "2026-11-24");
    }

    #[test]
    fn first_remember_after_next_day_waits_two_days() {
        let (stage, due) = next_schedule(0, Rating::Remembered, false, "2026-11-24").unwrap();
        assert_eq!(stage, 1);
        assert_eq!(due, "2026-11-26");
    }

    #[test]
    fn missed_review_counts_from_the_actual_completion_day() {
        // 原定 11-24，实际 11-27 才记得：下一次从 11-27 起算 2 天，而补齐漏掉的日期。
        let (stage, due) = next_schedule(0, Rating::Remembered, false, "2026-11-27").unwrap();
        assert_eq!(stage, 1);
        assert_eq!(due, "2026-11-29");
        // 阶段 1 漏掉后完成：从实际完成日 +4 天。
        let (stage, due) = next_schedule(1, Rating::Remembered, false, "2026-12-03").unwrap();
        assert_eq!(stage, 2);
        assert_eq!(due, "2026-12-07");
    }

    #[test]
    fn forgotten_then_remembered_in_the_same_round_resets_to_next_day() {
        let (stage, due) = next_schedule(3, Rating::Remembered, true, "2026-11-26").unwrap();
        assert_eq!(stage, 0);
        assert_eq!(due, "2026-11-27");
        let (stage, due) = next_schedule(4, Rating::Forgotten, true, "2026-11-26").unwrap();
        assert_eq!(stage, 0);
        assert_eq!(due, "2026-11-27");
    }

    #[test]
    fn stages_follow_two_four_seven_fifteen_then_every_thirty_days() {
        let mut stage = 0;
        let mut today = "2026-11-24".to_string();
        for expected_days in [2, 4, 7, 15, 30, 30, 30] {
            let (next_stage, due) =
                next_schedule(stage, Rating::Remembered, false, &today).unwrap();
            let expected_due = add_days(&today, expected_days).unwrap();
            assert_eq!(due, expected_due);
            if next_stage < MAX_STAGE {
                assert_eq!(next_stage, stage + 1);
            } else {
                assert_eq!(next_stage, MAX_STAGE);
            }
            stage = next_stage;
            today = due;
        }
    }

    #[test]
    fn date_math_crosses_month_and_year_boundaries() {
        assert_eq!(add_days("2026-01-31", 1).unwrap(), "2026-02-01");
        assert_eq!(add_days("2026-01-31", 2).unwrap(), "2026-02-02");
        assert_eq!(add_days("2026-12-30", 30).unwrap(), "2027-01-29");
        assert_eq!(add_days("2028-02-28", 1).unwrap(), "2028-02-29");
        assert_eq!(add_days("2026-11-24", 2).unwrap(), "2026-11-26");
    }

    #[test]
    fn invalid_dates_are_rejected() {
        assert!(initial_due_date("2026-02-30").is_err());
        assert!(initial_due_date("2026/11/24").is_err());
        assert!(initial_due_date("2026-13-01").is_err());
        assert!(is_valid_date("2026-11-24"));
    }
}