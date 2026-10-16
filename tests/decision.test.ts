import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRequest,
  confidence,
  createQuestion,
  DEFAULT_MODEL,
  disposition,
  isMode,
  isQuestionType,
  percentile,
  validateConfig,
  type DecisionConfig,
} from "../lib/decision.ts";

const config = (): DecisionConfig => ({
  model: DEFAULT_MODEL,
  mode: "text",
  input: "Synthetic request: please refund my damaged item.",
  questions: [
    {
      id: "refund",
      name: "refund",
      title: "Refund?",
      type: "boolean",
      instructions: "Is a refund requested?",
      options: [],
      enabled: true,
    },
    {
      id: "route",
      name: "route",
      title: "Route",
      type: "choice",
      instructions: "Which team?",
      options: ["Billing", "Technical"],
      enabled: true,
    },
    {
      id: "urgency",
      name: "urgency",
      title: "Urgency",
      type: "score",
      instructions: "How urgent?",
      options: ["Low", "High"],
      enabled: false,
    },
  ],
});

test("mixed questions become a valid native Decisions API contract, excluding disabled questions", () => {
  const request = buildRequest(validateConfig(config()));
  assert.equal(request.questions.length, 2);
  assert.equal(request.questions[0].type, "predicate");
  assert.deepEqual(request.questions[1].choices, [
    { value: "Billing" },
    { value: "Technical" },
  ]);
});

test("image context uses inline image data and request preview never contains image bytes", () => {
  const c = {
    ...config(),
    mode: "image" as const,
    image: "data:image/png;base64,YWJj",
  };
  validateConfig(c);
  const input = buildRequest(c).input;
  assert.ok(Array.isArray(input));
  assert.equal(input[0].content[1].image_url, c.image);
  assert.ok(!JSON.stringify(buildRequest(c, true)).includes("YWJj"));
});

test("invalid JSON, duplicate keys, empty questions, unknown models and external images fail validation", () => {
  assert.throws(
    () => validateConfig({ ...config(), mode: "json", input: "{" }),
    /valid JSON/,
  );
  const duplicate = config();
  duplicate.questions[1].name = "refund";
  assert.throws(() => validateConfig(duplicate), /unique/);
  assert.throws(
    () => validateConfig({ ...config(), questions: [] }),
    /at least one/,
  );
  assert.throws(
    () => validateConfig({ ...config(), model: "not/a-model" }),
    /supported decision model/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...config(),
        mode: "image",
        image: "https://example.com/photo.png",
      }),
    /PNG, JPEG, or WebP/,
  );
});

test("a confident negative boolean can automate; ambiguous, missing-confidence and refused answers require review", () => {
  const no = { type: "predicate" as const, name: "refund", probability: 0.01 };
  assert.equal(confidence(no), 0.99);
  assert.equal(disposition([no], 0.85), "Ready to automate");
  assert.equal(
    disposition([{ ...no, probability: 0.51 }], 0.85),
    "Human review",
  );
  assert.equal(
    disposition([{ type: "choice", name: "route", choice: "Billing" }], 0.85),
    "Human review",
  );
  assert.equal(
    disposition([{ type: "refusal", name: "refund" }], 0.5),
    "Human review",
  );
  assert.equal(disposition([], 0.85), "Human review");
});

test("changing a local threshold changes the policy outcome without changing the answer", () => {
  const answer = {
    type: "choice" as const,
    name: "route",
    choice: "Billing",
    confidence: 0.9,
  };
  assert.equal(disposition([answer], 0.85), "Ready to automate");
  assert.equal(disposition([answer], 0.95), "Human review");
  assert.equal(answer.confidence, 0.9);
});

test("latency percentiles use measured samples and leave an empty series unreported", () => {
  assert.equal(percentile([], 0.5), undefined);
  assert.equal(percentile([380, 120, 250], 0.5), 250);
  assert.equal(percentile([380, 120, 250], 0.95), 380);
});

test("custom questions preserve boolean, choice and score contracts across context formats", () => {
  const questions = [
    {
      ...createQuestion("custom-boolean"),
      name: "ready",
      instructions: "Is the synthetic task ready to start?",
    },
    {
      ...createQuestion("custom-choice"),
      name: "next_step",
      type: "choice" as const,
      instructions: "Choose the next step.",
      options: ["Start", "Wait"],
    },
    {
      ...createQuestion("custom-score"),
      name: "effort",
      type: "score" as const,
      instructions: "Assess the effort needed.",
      options: ["Small", "Medium", "Large"],
    },
  ];
  for (const mode of ["text", "json", "image"] as const) {
    const request = buildRequest(
      validateConfig({
        model: DEFAULT_MODEL,
        mode,
        input:
          mode === "json"
            ? '{"task":"synthetic demo","ready":true}'
            : "Synthetic task: everything is ready; estimated effort is small.",
        image: mode === "image" ? "data:image/png;base64,YWJj" : undefined,
        questions,
      }),
    );
    assert.deepEqual(
      request.questions.map((q) => q.type),
      ["predicate", "choice", "score"],
    );
    assert.deepEqual(request.questions[1].choices, [
      { value: "Start" },
      { value: "Wait" },
    ]);
    assert.deepEqual(request.questions[2].levels, [
      { label: "Small" },
      { label: "Medium" },
      { label: "Large" },
    ]);
    assert.equal(Array.isArray(request.input), mode === "image");
  }
});

test("custom configuration rejects incomplete questions and malformed runtime types before inference", () => {
  assert.throws(() => validateConfig({ ...config(), input: "" }), /Add input/);
  assert.throws(
    () => validateConfig({ ...config(), questions: [createQuestion("blank")] }),
    /instructions/,
  );
  const original = config().questions[0];
  for (const invalid of [
    { ...original, type: "free_text" },
    { ...original, title: 42 },
    { ...original, instructions: true },
    { ...original, options: [42] },
    { ...original, enabled: "true" },
  ]) {
    assert.throws(() => validateConfig({ ...config(), questions: [invalid] }));
  }
  assert.throws(
    () =>
      validateConfig({ ...config(), questions: [{ ...original, title: " " }] }),
    /display label/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...config(),
        questions: [
          { ...original, type: "choice", options: ["Start", " Start "] },
        ],
      }),
    /unique/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...config(),
        questions: [{ ...original, type: "score", options: ["Low"] }],
      }),
    /2–10/,
  );
  assert.throws(
    () => validateConfig({ ...config(), mode: "image" }),
    /PNG, JPEG, or WebP/,
  );
  assert.equal(isMode("audio"), false);
  assert.equal(isQuestionType("string"), false);
  assert.equal(isMode("json"), true);
  assert.equal(isQuestionType("score"), true);
});
