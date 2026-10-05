export type AnswerType = "noul" | "choice";

export interface JevRequest {
  model: string;
  prompt: string;
}

export interface JevAnswer {
  question_id: string;
  type: AnswerType;
  noul: number | null;
  choice: string | null;
  confidence: number | null;
  probabilities: Record<string, number> | null;
}

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JevResponse {
  model: string;
  answers: JevAnswer[];
  usage: JevUsage;
}
