export type EssaySeverity = "high" | "medium" | "low";
export type EssayIssueCategory = "grammar" | "word" | "spelling" | "tense" | "collocation" | "other";

export interface EssayIssue {
  severity: EssaySeverity;
  category: EssayIssueCategory;
  location: string;
  original: string;
  suggestion: string;
  explanation: string;
}

export interface EssayReview {
  issues: EssayIssue[];
  polished: string;
}

export interface EssaySession {
  text: string;
  result: EssayReview | null;
  pendingId?: number | null;
}

export interface EssayService {
  review(text: string): Promise<EssayReview>;
}
