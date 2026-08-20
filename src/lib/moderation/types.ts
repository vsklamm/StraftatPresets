type ModerationLevel = 1 | 2 | 3 | 4;

type ModerationDecision = "approved" | "rejected" | "review_required";

export interface ModerationFlag {
  level: ModerationLevel;
  tier: "limits" | "hard_reject" | "profanity_filter" | "quality";
  field: string;
  code: string;
  message: string;
  matchedTerm?: string;
}

export interface ModerationResult {
  decision: ModerationDecision;
  level?: ModerationLevel;
  flags: ModerationFlag[];
  summary?: string;
}

export interface ModeratableField {
  path: string;
  label: string;
  rawText: string;
  cleanText: string;
  hasColorCodes: boolean;
}
