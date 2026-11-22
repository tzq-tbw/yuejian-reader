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

export interface EssayRevision {
  id: number;
  documentId: number;
  revisionNo: number;
  text: string;
  result: EssayReview;
  createdAt: string;
}

export interface EssayDocument {
  id: number;
  sequenceNo: number;
  name: string;
  text: string;
  revisions: EssayRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEssayDocumentInput {
  name?: string;
  text: string;
}

export interface AddEssayRevisionInput {
  documentId: number;
  text: string;
  result: EssayReview;
}
