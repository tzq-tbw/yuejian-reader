export const WORDLIST_SELECTION_KEY = "yuejian.vocabulary.selected";

export function readWordlistSelection(enabledIds: string[]): string[] {
  try {
    const raw = window.localStorage.getItem(WORDLIST_SELECTION_KEY);
    if (raw === null) return enabledIds;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return enabledIds;
    const allowed = new Set(enabledIds);
    return [...new Set(parsed.filter((id): id is string => typeof id === "string" && allowed.has(id)))];
  } catch {
    return enabledIds;
  }
}

export function writeWordlistSelection(ids: string[]) {
  try {
    window.localStorage.setItem(WORDLIST_SELECTION_KEY, JSON.stringify(ids));
  } catch {
    // 选择仍对当前页面生效；存储不可用时不阻断阅读。
  }
}
