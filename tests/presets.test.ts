import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRESETS, isPresetId } from "../lib/presets.ts";
import {
  DEFAULT_MODEL,
  buildRequest,
  validateConfig,
} from "../lib/decision.ts";

test("every seeded use case produces a valid native request with its actual image asset", () => {
  assert.equal(new Set(PRESETS.map((preset) => preset.id)).size, 9);
  for (const preset of PRESETS.filter((preset) => preset.id !== "custom")) {
    const bytes = preset.image
      ? readFileSync(new URL(`../public${preset.image.src}`, import.meta.url))
      : undefined;
    if (preset.mode === "image") {
      assert.ok(bytes, `${preset.id} must include an image`);
      assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    }
    const config = validateConfig({
      model: DEFAULT_MODEL,
      mode: preset.mode,
      input: preset.input,
      image: bytes
        ? `data:image/png;base64,${bytes.toString("base64")}`
        : undefined,
      questions: preset.questions,
    });
    const request = buildRequest(config);
    assert.equal(request.questions.length, 3, preset.id);
    assert.equal(
      Array.isArray(request.input),
      preset.mode === "image",
      preset.id,
    );
    for (const question of request.questions) {
      if (question.type === "choice") assert.ok(question.choices?.length);
      if (question.type === "score") assert.ok(question.levels?.length);
      assert.ok(!JSON.stringify(question).includes('"boolean"'));
    }
  }
});

test("use case selection rejects unknown values and keeps custom input blank", () => {
  for (const preset of PRESETS) assert.equal(isPresetId(preset.id), true);
  for (const value of [null, {}, 42, "rag", "cache", "unknown"])
    assert.equal(isPresetId(value), false);
  const custom = PRESETS.find((preset) => preset.id === "custom")!;
  assert.equal(custom.input, "");
  assert.throws(
    () => validateConfig({ model: DEFAULT_MODEL, ...custom }),
    /Add input/,
  );
});
