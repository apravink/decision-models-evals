import type { Structured } from "@decision-models-evals/shared";
import type { Env } from "../env";

export interface QuestionSpec {
  question_id: string;
  type: "noul" | "choice" | "score";
  instructions: Structured;
  noul_criteria?: { true?: Structured; false?: Structured };
  choice_criteria?: Record<string, Structured | null>;
  score_criteria?: Structured[];
  resolves_at: string;
}

export interface PendingBatch {
  state: unknown;
  questions: QuestionSpec[];
}

export type Outcome =
  | { kind: "noul"; value: 0 | 1 }
  | { kind: "choice"; value: string }
  | { kind: "score"; value: number };

export interface Suite {
  id: string;
  version(): string;
  pendingQuestions(env: Env, now: Date): Promise<PendingBatch | null>;
  outcomesFor(env: Env, questionIds: string[]): Promise<Map<string, Outcome>>;
}
