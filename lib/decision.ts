export type Mode = "text" | "json" | "image";
export type QuestionType = "boolean" | "choice" | "score";

export function isMode(value: unknown): value is Mode {
  return value === "text" || value === "json" || value === "image";
}

export function isQuestionType(value: unknown): value is QuestionType {
  return value === "boolean" || value === "choice" || value === "score";
}
export type Question = {
  id: string;
  name: string;
  title: string;
  type: QuestionType;
  instructions: string;
  options: string[];
  enabled: boolean;
};

export function createQuestion(id: string): Question {
  return {
    id,
    name: `decision_${id.replaceAll("-", "").slice(0, 8)}`,
    title: "Your decision",
    type: "boolean",
    instructions: "",
    options: [],
    enabled: true,
  };
}
export type DecisionConfig = {
  model: string;
  mode: Mode;
  input: string;
  image?: string;
  questions: Question[];
};
export type Answer = {
  type: "predicate" | "choice" | "score" | "refusal";
  name: string;
  probability?: number;
  choice?: string;
  confidence?: number;
  score?: number;
  probabilities?: {
    value: string | number;
    label?: string;
    probability: number;
  }[];
};
export type DecisionResult = {
  model: string;
  answers: Answer[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  provider_metadata?: {
    gateway?: {
      cost?: string;
      generationId?: string;
      routing?: { finalProvider?: string; resolvedProvider?: string };
    };
  };
  timing: { gatewayMs: number; serverMs: number };
};
export type Run = {
  id: string;
  at: string;
  mode: Mode;
  preset: string;
  config: DecisionConfig;
  result: DecisionResult;
  clientMs: number;
};
export type Model = {
  id: string;
  name: string;
  eligible: boolean;
  reason?: string;
};
export const DEFAULT_MODEL = "openai/gpt-6-luna-decisions";
export const MODEL_IDS = [
  DEFAULT_MODEL,
  "typesafe-ai/jev",
  "typesafe-ai/jev-1.13.0",
  "typesafe-ai/jev-1.14.0",
  "liquid/d1",
  "liquid/d1-ultra",
  "microsoft/microsoft-decision-1",
  "perplexity/pplx-decider-v1.1-27b",
  "convaiinnovations/laya",
  "convaiinnovations/laya-free",
  "scaledown/scaledown-classify-1",
];

export class ValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
  );
}

export function validateConfig(value: unknown): DecisionConfig {
  if (!isRecord(value))
    throw new ValidationError("A decision configuration is required.");
  const c = value;
  if (typeof c.model !== "string" || !MODEL_IDS.includes(c.model))
    throw new ValidationError("Choose a supported decision model.");
  if (!isMode(c.mode))
    throw new ValidationError("Choose text, JSON, or image input.");
  if (typeof c.input !== "string" || c.input.length > 24_000 || !c.input.trim())
    throw new ValidationError("Add input between 1 and 24,000 characters.");
  if (c.mode === "json") {
    try {
      JSON.parse(c.input);
    } catch {
      throw new ValidationError("The structured input must be valid JSON.");
    }
  }
  if (
    c.mode === "image" &&
    (typeof c.image !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.image) ||
      c.image.length > 5_600_000)
  )
    throw new ValidationError(
      "Add a PNG, JPEG, or WebP image smaller than 4 MB.",
    );
  if (!Array.isArray(c.questions) || c.questions.length > 8)
    throw new ValidationError("Use up to eight questions per request.");
  const ids = new Set<string>();
  const questions: Question[] = c.questions.map((value: unknown) => {
    if (!isRecord(value) || typeof value.enabled !== "boolean")
      throw new ValidationError(
        "Each question needs a valid configuration and enabled state.",
      );
    if (!isQuestionType(value.type))
      throw new ValidationError("Choose a supported question type.");
    if (
      typeof value.id !== "string" ||
      !value.id.trim() ||
      ids.has(value.id) ||
      typeof value.name !== "string" ||
      typeof value.title !== "string" ||
      typeof value.instructions !== "string" ||
      !isStringArray(value.options)
    )
      throw new ValidationError(
        "Each question needs a unique ID, answer key, display label, instructions, and text options.",
      );
    ids.add(value.id);
    return {
      id: value.id,
      name: value.name.trim(),
      title: value.title.trim(),
      instructions: value.instructions,
      type: value.type,
      enabled: value.enabled,
      options: value.options.map((option) => option.trim()),
    };
  });
  const active = questions.filter((q) => q.enabled);
  if (active.length === 0)
    throw new ValidationError("Enable at least one question.");
  const names = new Set<string>();
  for (const q of active) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/.test(q.name) || names.has(q.name))
      throw new ValidationError(
        "Question keys must be unique, start with a letter, and contain only letters, numbers, or underscores.",
      );
    names.add(q.name);
    if (!q.title || q.title.length > 120)
      throw new ValidationError(
        "Each question needs a display label of up to 120 characters.",
      );
    if (!q.instructions.trim() || q.instructions.length > 2_000)
      throw new ValidationError(
        "Each question needs instructions of up to 2,000 characters.",
      );
    if (
      q.type !== "boolean" &&
      (q.options.length < 2 ||
        q.options.length > 10 ||
        q.options.some((o) => !o || o.length > 120) ||
        new Set(q.options).size !== q.options.length)
    )
      throw new ValidationError(
        "Use 2–10 unique, non-empty choices or scale labels.",
      );
  }
  return {
    model: c.model,
    mode: c.mode,
    input: c.input,
    ...(c.mode === "image" && typeof c.image === "string"
      ? { image: c.image }
      : {}),
    questions,
  };
}

export function buildRequest(c: DecisionConfig, redactImage = false) {
  return {
    model: c.model,
    input:
      c.mode === "image"
        ? [
            {
              role: "user",
              content: [
                { type: "input_text", text: c.input },
                {
                  type: "input_image",
                  image_url: redactImage ? "<base64 image data>" : c.image,
                  detail: "high",
                },
              ],
            },
          ]
        : c.input,
    questions: c.questions
      .filter((q) => q.enabled)
      .map((q) => ({
        type: q.type === "boolean" ? "predicate" : q.type,
        name: q.name,
        instructions: q.instructions,
        ...(q.type === "choice"
          ? { choices: q.options.map((value) => ({ value })) }
          : {}),
        ...(q.type === "score"
          ? { levels: q.options.map((label) => ({ label })) }
          : {}),
      })),
  };
}

export function confidence(answer: Answer): number | undefined {
  if (answer.type === "refusal") return undefined;
  if (answer.type === "predicate" && typeof answer.probability === "number")
    return Math.max(answer.probability, 1 - answer.probability);
  if (typeof answer.confidence === "number") return answer.confidence;
  if (answer.probabilities?.length)
    return Math.max(...answer.probabilities.map((p) => p.probability));
  return undefined;
}

export function disposition(answers: Answer[], threshold: number) {
  return answers.length > 0 &&
    answers.every((a) => (confidence(a) ?? -1) >= threshold)
    ? "Ready to automate"
    : "Human review";
}

export function percentile(values: number[], p: number) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}
