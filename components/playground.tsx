"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
  type Answer,
  type DecisionConfig,
  type DecisionResult,
  type Model,
  type Mode,
  type Question,
  type QuestionType,
  type Run,
} from "@/lib/decision";
import { PRESETS, SUPPORT_ALTERNATES, type PresetId } from "@/lib/presets";
import { Icon, type IconName } from "./icons";
import { UseCasePicker } from "./use-case-picker";

const modeLabels: Record<Mode, string> = {
  text: "Text",
  json: "JSON",
  image: "Image",
};
const typeIcons: Record<QuestionType, IconName> = {
  boolean: "boolean",
  choice: "choice",
  score: "score",
};
const time = (ms: number) =>
  ms < 1_000 ? `${Math.round(ms)} ms` : `${(ms / 1_000).toFixed(2)} s`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const cloneQuestions = (q: Question[]) =>
  q.map((x) => ({ ...x, options: [...x.options] }));

function navigateTabs(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]:not(:disabled)',
    ),
  );
  const index = tabs.indexOf(event.currentTarget);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
}

function Elapsed({ started }: { started: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setElapsed(performance.now() - started),
      50,
    );
    return () => clearInterval(timer);
  }, [started]);
  return <span className="mono">{time(elapsed)}</span>;
}

function OptionRows({
  options,
  type,
  title,
  onChange,
  disabled,
}: {
  options: string[];
  type: "choice" | "score";
  title: string;
  onChange: (options: string[]) => void;
  disabled: boolean;
}) {
  const [rowIds, setRowIds] = useState(() => options.map((_, i) => i));
  const nextId = useRef(options.length);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const focusRow = useRef<number | null>(null);
  const label = type === "score" ? "Level" : "Choice";

  useEffect(() => {
    if (focusRow.current === null) return;
    inputs.current.get(focusRow.current)?.focus();
    focusRow.current = null;
  }, [rowIds]);

  return (
    <fieldset className="option-rows" disabled={disabled}>
      <legend>{type === "score" ? "Scale labels" : "Choices"}</legend>
      <p className="field-hint">
        {type === "score"
          ? "Lowest to highest. 2 to 10 unique labels."
          : "2 to 10 unique choices."}
      </p>
      <div className="option-list">
        {options.map((option, i) => (
          <div className="option-row" key={rowIds[i]}>
            <span className="option-number mono" aria-hidden="true">
              {i + 1}
            </span>
            <input
              ref={(node) => {
                if (node) inputs.current.set(rowIds[i], node);
                else inputs.current.delete(rowIds[i]);
              }}
              aria-label={`${label} ${i + 1} for ${title}`}
              value={option}
              maxLength={120}
              placeholder={`${label} ${i + 1}`}
              onChange={(e) =>
                onChange(
                  options.map((value, j) => (j === i ? e.target.value : value)),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${label.toLowerCase()} ${i + 1} for ${title}`}
              disabled={options.length <= 2}
              onClick={() => {
                focusRow.current = rowIds[i + 1] ?? rowIds[i - 1];
                setRowIds(rowIds.filter((_, j) => j !== i));
                onChange(options.filter((_, j) => j !== i));
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-button add-option"
        disabled={options.length >= 10}
        onClick={() => {
          const id = nextId.current++;
          focusRow.current = id;
          setRowIds([...rowIds, id]);
          onChange([...options, ""]);
        }}
      >
        <Icon name="plus" size={14} />
        Add {label.toLowerCase()}
        <span className="mono">{options.length}/10</span>
      </button>
    </fieldset>
  );
}

function QuestionEditor({
  question: q,
  index,
  onChange,
  onRemove,
  disabled,
}: {
  question: Question;
  index: number;
  onChange: (q: Question) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(!q.instructions.trim());
  return (
    <div className={`question ${q.enabled ? "" : "question-off"}`}>
      <div className="question-top">
        <span className="question-icon">
          <Icon name={typeIcons[q.type]} size={17} />
        </span>
        <button
          className="question-open"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={`Edit decision ${index + 1}: ${q.title}`}
        >
          <span>{q.title}</span>
          <span className="question-summary">
            {q.type === "boolean" ? "Yes / No" : q.options.join(" · ")}
          </span>
        </button>
        <span className="type-badge">{q.type}</span>
        <button
          className={`switch ${q.enabled ? "on" : ""}`}
          role="switch"
          aria-checked={q.enabled}
          aria-label={`Enable ${q.title}`}
          onClick={() => onChange({ ...q, enabled: !q.enabled })}
          disabled={disabled}
        >
          <span />
        </button>
        <button
          className="icon-button edit-toggle"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${q.title}`}
          onClick={() => setExpanded(!expanded)}
        >
          <Icon name="chevron" className={expanded ? "rotate" : ""} size={14} />
        </button>
      </div>
      {expanded && (
        <div className="question-editor">
          <div className="field-pair">
            <label>
              Answer key
              <input
                value={q.name}
                maxLength={48}
                placeholder="decision_key"
                onChange={(e) => onChange({ ...q, name: e.target.value })}
                disabled={disabled}
              />
            </label>
            <label>
              Decision type
              <select
                value={q.type}
                disabled={disabled}
                onChange={(e) => {
                  const type = e.target.value;
                  if (!isQuestionType(type)) return;
                  onChange({
                    ...q,
                    type,
                    options:
                      q.options.length >= 2
                        ? q.options
                        : type === "choice"
                          ? ["Option A", "Option B"]
                          : type === "score"
                            ? ["Low", "Medium", "High"]
                            : [],
                  });
                }}
              >
                <option value="boolean">Boolean</option>
                <option value="choice">Choice</option>
                <option value="score">Score</option>
              </select>
            </label>
          </div>
          <label>
            Display label
            <input
              value={q.title}
              maxLength={120}
              placeholder="What should this decision be called?"
              onChange={(e) => onChange({ ...q, title: e.target.value })}
              disabled={disabled}
            />
          </label>
          <label>
            Instructions
            <textarea
              rows={3}
              value={q.instructions}
              maxLength={2_000}
              placeholder="Describe exactly what to evaluate and how to choose the answer."
              disabled={disabled}
              onChange={(e) => onChange({ ...q, instructions: e.target.value })}
            />
          </label>
          {q.type !== "boolean" && (
            <OptionRows
              key={q.type}
              options={q.options}
              type={q.type}
              title={q.title}
              disabled={disabled}
              onChange={(options) => onChange({ ...q, options })}
            />
          )}
          <button
            className="text-button remove"
            onClick={onRemove}
            disabled={disabled}
          >
            Remove decision
          </button>
        </div>
      )}
    </div>
  );
}

function AnswerCard({
  answer: a,
  question,
  threshold,
}: {
  answer: Answer;
  question?: Question;
  threshold: number;
}) {
  const certainty = confidence(a);
  const passes = certainty !== undefined && certainty >= threshold;
  const kind = a.type === "predicate" ? "boolean" : a.type;
  const levels = question?.options || [];
  const closestLevel =
    typeof a.score === "number"
      ? levels[Math.max(0, Math.min(levels.length - 1, Math.round(a.score)))]
      : undefined;
  return (
    <article className="answer-card">
      <div className="answer-label">
        <span>
          <Icon
            name={kind === "refusal" ? "info" : typeIcons[kind]}
            size={15}
          />
          {question?.title || a.name}
        </span>
        <span className="mono">{kind}</span>
      </div>
      <div className="answer-value">
        <strong>
          {a.type === "refusal"
            ? "Declined to answer"
            : a.type === "predicate"
              ? (a.probability ?? 0) >= 0.5
                ? "Yes"
                : "No"
              : a.type === "choice"
                ? a.choice
                : closestLevel || "Score"}
        </strong>
        <span className="answer-confidence">
          {a.type === "score" && typeof a.score === "number" ? (
            <>
              <b className="mono">{a.score.toFixed(2)}</b> /{" "}
              {Math.max(1, levels.length - 1)}
            </>
          ) : certainty !== undefined ? (
            <>
              <b className="mono">{pct(certainty)}</b> confidence
            </>
          ) : (
            "Confidence unavailable"
          )}
        </span>
      </div>
      {a.type === "predicate" && typeof a.probability === "number" && (
        <>
          <div className="probability-track">
            <div style={{ width: pct(a.probability) }} />
          </div>
          <div className="track-labels">
            <span>
              Yes <span className="mono">{pct(a.probability)}</span>
            </span>
            <span>
              No <span className="mono">{pct(1 - a.probability)}</span>
            </span>
          </div>
        </>
      )}
      {(a.type === "choice" || a.type === "score") && a.probabilities && (
        <details className="answer-breakdown">
          <summary>
            Option probabilities
            <Icon name="chevron" size={12} />
          </summary>
          <div className="distribution">
            {a.probabilities.map((p) => (
              <div className="distribution-row" key={String(p.value)}>
                <span>
                  {p.label ||
                    (a.type === "score"
                      ? levels[Number(p.value)]
                      : String(p.value)) ||
                    String(p.value)}
                </span>
                <div className="distribution-track">
                  <div style={{ width: pct(p.probability) }} />
                </div>
                <span className="mono">{pct(p.probability)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="answer-footer">
        <span className={`dot ${passes ? "green" : "amber"}`} />
        {a.type === "refusal"
          ? "Refused · requires human review"
          : certainty === undefined
            ? "Confidence unavailable · requires human review"
            : passes
              ? "Meets automation threshold"
              : `Below ${Math.round(threshold * 100)}% threshold · review`}
        {a.type === "score" && certainty !== undefined && (
          <span className="mono score-confidence">
            {pct(certainty)} confidence
          </span>
        )}
      </div>
    </article>
  );
}

export function Playground() {
  const [presetId, setPresetId] = useState<PresetId>(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const isCustom = presetId === "custom";
  const [mode, setMode] = useState<Mode>(preset.mode);
  const [input, setInput] = useState(preset.input);
  const [questions, setQuestions] = useState(() =>
    cloneQuestions(preset.questions),
  );
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState("");
  const [customImage, setCustomImage] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [models, setModels] = useState<Model[]>([]);
  const [connection, setConnection] = useState<
    "checking" | "connected" | "error"
  >("checking");
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(0);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  }>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [threshold, setThreshold] = useState(85);
  const [resultTab, setResultTab] = useState<
    "answers" | "request" | "response"
  >("answers");
  const [copied, setCopied] = useState(false);
  const [dark, setDark] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const customDraft = useRef<
    | {
        mode: Mode;
        input: string;
        questions: Question[];
        image?: string;
        imageName: string;
        customImage: boolean;
      }
    | undefined
  >(undefined);
  const imageLoadVersion = useRef(0);
  const selected = runs.find((r) => r.id === selectedRunId);
  const activeCount = questions.filter((q) => q.enabled).length;
  const config: DecisionConfig = {
    model,
    mode,
    input,
    image: mode === "image" ? image : undefined,
    questions,
  };
  const configKey = JSON.stringify(config);
  const isStale = selected && JSON.stringify(selected.config) !== configKey;
  const measured = runs.filter((r) => r.config.model === model);
  const p50 = percentile(
    measured.map((r) => r.clientMs),
    0.5,
  );
  const p95 = percentile(
    measured.map((r) => r.clientMs),
    0.95,
  );
  const selectedEligible = models.some((m) => m.id === model && m.eligible);
  const requestPreview = JSON.stringify(buildRequest(config, true), null, 2);
  const syntheticInput =
    !isCustom &&
    (input === preset.input ||
      (presetId === "support" && SUPPORT_ALTERNATES.includes(input))) &&
    (mode !== "image" || !customImage);

  const checkConnection = useCallback(async () => {
    setConnection("checking");
    try {
      const response = await fetch("/api/models");
      const body = await response.json();
      setModels(body.models || []);
      setConnection(body.connected && body.complete ? "connected" : "error");
      setConnectionError(
        body.error ||
          (body.complete
            ? ""
            : "The model availability check is incomplete. Retry before running."),
      );
    } catch {
      setConnection("error");
      setConnectionError(
        "Unable to reach the server. Check the connection and retry.",
      );
    }
  }, []);

  useEffect(() => {
    void checkConnection();
    return () => {
      controller.current?.abort();
      clearTimeout(copyTimer.current);
    };
  }, [checkConnection]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (guideOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [guideOpen]);

  async function loadSampleImage(src: string) {
    const response = await fetch(src);
    if (!response.ok) throw new Error("The sample image could not be loaded.");
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not read the sample image."));
      };
      reader.onerror = () =>
        reject(new Error("Could not read the sample image."));
      reader.readAsDataURL(blob);
    });
  }

  async function selectPreset(id: PresetId) {
    if (running) return;
    if (id === presetId) return;
    if (isCustom) {
      customDraft.current = {
        mode,
        input,
        questions: cloneQuestions(questions),
        image,
        imageName,
        customImage,
      };
    }
    const p = PRESETS.find((p) => p.id === id);
    if (!p) return;
    const draft = id === "custom" ? customDraft.current : undefined;
    const imageVersion = ++imageLoadVersion.current;
    setPresetId(id);
    setMode(draft?.mode ?? p.mode);
    setInput(draft?.input ?? p.input);
    setQuestions(cloneQuestions(draft?.questions ?? p.questions));
    setError("");
    setSelectedRunId(undefined);
    setResultTab("answers");
    setImage(draft?.image);
    setImageName(draft?.imageName ?? p.image?.src.split("/").pop() ?? "");
    setCustomImage(draft?.customImage ?? false);
    setSampleIndex(0);
    if (p.image) {
      try {
        const sampleImage = await loadSampleImage(p.image.src);
        if (imageVersion === imageLoadVersion.current) setImage(sampleImage);
      } catch (e) {
        if (imageVersion === imageLoadVersion.current)
          setError(
            e instanceof Error
              ? e.message
              : "The sample image could not be loaded.",
          );
      }
    }
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 4 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG, or WebP image smaller than 4 MB.");
      return;
    }
    const reader = new FileReader();
    const imageVersion = ++imageLoadVersion.current;
    reader.onload = () => {
      if (imageVersion !== imageLoadVersion.current) return;
      if (typeof reader.result !== "string") {
        setError("The image could not be read. Try another file.");
        return;
      }
      setImage(reader.result);
      setImageName(file.name);
      setCustomImage(true);
      setError("");
    };
    reader.onerror = () => {
      if (imageVersion === imageLoadVersion.current)
        setError("The image could not be read. Try another file.");
    };
    reader.readAsDataURL(file);
  }

  const runDecision = useCallback(
    async (count = 1) => {
      if (running || !selectedEligible || connection !== "connected") return;
      let snapshot: DecisionConfig;
      try {
        snapshot = validateConfig({
          model,
          mode,
          input,
          image: mode === "image" ? image : undefined,
          questions: cloneQuestions(questions),
        });
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Check the decision configuration.",
        );
        return;
      }
      setQuestions(snapshot.questions);
      const abort = new AbortController();
      controller.current = abort;
      setRunning(true);
      setError("");
      setResultTab("answers");
      setProgress({ current: 1, total: count });
      try {
        for (let i = 0; i < count; i++) {
          if (abort.signal.aborted) break;
          const start = performance.now();
          setStarted(start);
          setProgress({ current: i + 1, total: count });
          const response = await fetch("/api/decide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(snapshot),
            signal: abort.signal,
          });
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error || "The decision request failed.");
          const result = body as DecisionResult;
          const next: Run = {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            mode: snapshot.mode,
            preset: preset.label,
            config: snapshot,
            result,
            clientMs: performance.now() - start,
          };
          setRuns((previous) => [next, ...previous].slice(0, 50));
          setSelectedRunId(next.id);
        }
      } catch (e) {
        if (!(e instanceof Error && e.name === "AbortError"))
          setError(
            e instanceof Error ? e.message : "Something went wrong. Try again.",
          );
      } finally {
        setRunning(false);
        setProgress(undefined);
        controller.current = null;
      }
    },
    [
      running,
      selectedEligible,
      connection,
      model,
      mode,
      preset.label,
      input,
      image,
      questions,
    ],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void runDecision();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runDecision]);

  const exportRuns = () => {
    const data = runs.map((r) => ({
      ...r,
      config: {
        ...r.config,
        image: r.config.image ? "<image omitted from export>" : undefined,
      },
    }));
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "decision-lab-runs.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(
        resultTab === "request"
          ? requestPreview
          : JSON.stringify(selected?.result || {}, null, 2),
      );
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the code directly.",
      );
    }
  }

  return (
    <div className={focused ? "app focus-mode" : "app"}>
      <a href="#workspace" className="skip-link">
        Skip to playground
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Decision Lab home">
            <span className="brand-mark">
              <Icon name="layers" size={20} />
            </span>
            <span>
              decision<span className="brand-light">lab</span>
            </span>
          </a>
          <span className="header-slash">/</span>
          <span className="header-label">AI Gateway</span>
          <span className="header-badge">Playground</span>
          <div className="header-actions">
            <button
              className="text-button present-button"
              aria-pressed={focused}
              onClick={() => {
                setFocused(!focused);
                window.scrollTo(0, 0);
              }}
            >
              <Icon name="focus" />
              {focused ? "Exit focus" : "Present"}
            </button>
            <button
              className="text-button guide-button"
              onClick={() => setGuideOpen(true)}
            >
              <Icon name="book" />
              Demo guide
            </button>
            <a
              className="text-button docs-link"
              href="https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions"
              target="_blank"
              rel="noreferrer"
            >
              Documentation
              <Icon name="upRight" size={14} />
            </a>
            <span className="header-divider" />
            <button
              className="icon-button theme-button"
              onClick={() => setDark(!dark)}
              aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
            >
              <Icon name={dark ? "sun" : "moon"} size={18} />
            </button>
          </div>
        </div>
      </header>

      <main>
        <div className={`page-heading ${focused ? "sr-only" : ""}`}>
          <h1>Decision models</h1>
        </div>
        <div className="playground-layout">
          <UseCasePicker
            selected={presetId}
            disabled={running}
            onSelect={(id) => void selectPreset(id)}
          />
          <div className="playground-content">
            <section
              id="workspace"
              className="workspace"
              aria-labelledby="scenario-title"
            >
              <div className="workspace-top">
                <h2 id="scenario-title">{preset.label}</h2>
                <label className="model-select">
                  <select
                    aria-label="Decision model"
                    value={model}
                    disabled={running || connection !== "connected"}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {models.length ? (
                      models.map((m) => (
                        <option key={m.id} value={m.id} disabled={!m.eligible}>
                          {m.name}
                          {!m.eligible ? " (unavailable)" : ""}
                        </option>
                      ))
                    ) : (
                      <option value={DEFAULT_MODEL}>
                        GPT-6 Luna Decisions
                      </option>
                    )}
                  </select>
                  <Icon name="chevron" size={12} />
                </label>
              </div>
              {connection === "error" && (
                <div className="connection-banner" role="status">
                  <Icon name="info" />
                  <span>{connectionError}</span>
                  <button
                    className="text-button"
                    onClick={() => void checkConnection()}
                  >
                    Retry
                  </button>
                </div>
              )}

              <div className="workspace-grid">
                <div className="configure-pane">
                  <div className="section-heading">
                    <h3>Context</h3>
                    <div className="heading-actions">
                      {isCustom ? (
                        <label className="context-format">
                          <span className="sr-only">Context format</span>
                          <select
                            value={mode}
                            disabled={running}
                            onChange={(e) => {
                              if (!isMode(e.target.value)) return;
                              ++imageLoadVersion.current;
                              setMode(e.target.value);
                              setError("");
                            }}
                          >
                            <option value="text">Text</option>
                            <option value="json">JSON</option>
                            <option value="image">Image</option>
                          </select>
                          <Icon name="chevron" size={12} />
                        </label>
                      ) : (
                        <span className="type-badge mono">
                          {modeLabels[mode]}
                        </span>
                      )}
                      {presetId === "support" && (
                        <button
                          className="icon-button"
                          title="Try another synthetic message"
                          aria-label="Try another sample"
                          disabled={running}
                          onClick={() => {
                            const next =
                              (sampleIndex + 1) % SUPPORT_ALTERNATES.length;
                            setSampleIndex(next);
                            setInput(SUPPORT_ALTERNATES[next]);
                          }}
                        >
                          <Icon name="refresh" size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className={`input-shell ${mode === "image" ? "image-shell" : ""}`}
                  >
                    {mode === "image" && (
                      <>
                        <div className="image-preview">
                          {image ? (
                            <Image
                              unoptimized
                              src={image}
                              width={960}
                              height={600}
                              alt={
                                !customImage
                                  ? (preset.image?.alt ?? "Scenario image")
                                  : "User-provided scenario image"
                              }
                              className="product-image"
                            />
                          ) : (
                            <div className="image-placeholder">
                              <Icon name="image" size={28} />
                              <span>
                                {isCustom
                                  ? "Add an image for your scenario"
                                  : "Loading image..."}
                              </span>
                            </div>
                          )}
                          <button
                            className="upload-button"
                            disabled={running}
                            onClick={() => fileInput.current?.click()}
                          >
                            <Icon name="upload" size={13} />
                            {image ? "Replace image" : "Choose image"}
                          </button>
                        </div>
                        {image && (
                          <div className="image-file">
                            <Icon name="image" size={12} />
                            <span>{imageName}</span>
                            <span className="mono">
                              {image
                                ? `${Math.round((image.length * 0.75) / 1024)} KB`
                                : "N/A"}
                            </span>
                          </div>
                        )}
                        <input
                          className="sr-only"
                          type="file"
                          ref={fileInput}
                          accept="image/png,image/jpeg,image/webp"
                          aria-label="Upload image"
                          disabled={running}
                          onChange={(e) => {
                            void uploadImage(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}
                    <textarea
                      key={`${presetId}-${mode}`}
                      aria-label={
                        mode === "json"
                          ? "Structured JSON input"
                          : mode === "image"
                            ? "Image instructions"
                            : "Input context"
                      }
                      className={`context-input ${mode === "json" ? "mono json-input" : ""} ${mode === "image" ? "image-prompt" : ""}`}
                      placeholder={
                        isCustom
                          ? mode === "json"
                            ? "Paste a JSON record to evaluate"
                            : mode === "image"
                              ? "Describe the context or criteria for evaluating this image"
                              : "Write or paste the context for your scenario"
                          : undefined
                      }
                      maxLength={24_000}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={running}
                      spellCheck={false}
                    />
                    <div className="input-footer">
                      <span>
                        <span className="dot" />
                        {syntheticInput ? "Synthetic example" : "Custom input"}
                      </span>
                      <span className="mono">
                        {input.length.toLocaleString()} chars
                      </span>
                    </div>
                  </div>

                  <div className="section-heading questions-heading">
                    <h3>Decisions</h3>
                    <span className="muted small">{activeCount} enabled</span>
                  </div>
                  <div className="question-list">
                    {questions.map((q, index) => (
                      <QuestionEditor
                        key={`${presetId}-${q.id}`}
                        question={q}
                        index={index}
                        disabled={running}
                        onChange={(next) =>
                          setQuestions((previous) =>
                            previous.map((x) => (x.id === q.id ? next : x)),
                          )
                        }
                        onRemove={() =>
                          setQuestions((previous) =>
                            previous.filter((x) => x.id !== q.id),
                          )
                        }
                      />
                    ))}
                  </div>
                  <button
                    className="add-question text-button"
                    disabled={running || questions.length >= 8}
                    onClick={() => {
                      const id = crypto.randomUUID();
                      setQuestions((previous) => [
                        ...previous,
                        createQuestion(id),
                      ]);
                    }}
                  >
                    <Icon name="plus" size={14} />
                    Add decision
                    <span className="mono">{questions.length}/8</span>
                  </button>

                  {error && (
                    <div className="error-message" role="alert">
                      <Icon name="info" size={16} />
                      <span>{error}</span>
                      <button
                        className="icon-button"
                        aria-label="Dismiss error"
                        onClick={() => setError("")}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  )}
                  <div className="run-actions">
                    <button
                      className="primary-button"
                      disabled={
                        running ||
                        !selectedEligible ||
                        connection !== "connected" ||
                        activeCount === 0
                      }
                      onClick={() => void runDecision()}
                    >
                      <Icon
                        name={running ? "refresh" : "play"}
                        size={15}
                        className={running ? "spin" : ""}
                      />
                      {running
                        ? `Deciding${progress && progress.total > 1 ? ` ${progress.current}/${progress.total}` : ""}...`
                        : "Run decision"}
                      {running ? <Elapsed started={started} /> : <kbd>⌘ ↵</kbd>}
                    </button>
                    {running ? (
                      <button
                        className="secondary-button stop-button"
                        onClick={() => controller.current?.abort()}
                      >
                        <Icon name="stop" size={14} />
                        Stop
                      </button>
                    ) : (
                      <button
                        className="secondary-button benchmark-button"
                        disabled={
                          !selectedEligible ||
                          connection !== "connected" ||
                          activeCount === 0
                        }
                        title="Send three real, sequential requests and measure their latency"
                        onClick={() => void runDecision(3)}
                      >
                        <Icon name="bolt" size={15} />
                        Benchmark<span className="mono">×3</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="results-pane">
                  <div className="section-heading">
                    <h3>Results</h3>
                    {selected && (
                      <span className="result-status">
                        <span className="dot green" />
                        Completed
                      </span>
                    )}
                  </div>
                  <div className="result-tabs">
                    <div role="tablist" aria-label="Result view">
                      {(["answers", "request", "response"] as const).map(
                        (t) => (
                          <button
                            key={t}
                            role="tab"
                            aria-selected={resultTab === t}
                            tabIndex={resultTab === t ? 0 : -1}
                            onKeyDown={navigateTabs}
                            className={resultTab === t ? "active" : ""}
                            onClick={() => setResultTab(t)}
                          >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ),
                      )}
                    </div>
                    {resultTab !== "answers" && (
                      <button
                        className="icon-button"
                        title="Copy JSON"
                        aria-label="Copy JSON"
                        onClick={() => void copyCode()}
                      >
                        <Icon name={copied ? "check" : "copy"} size={14} />
                      </button>
                    )}
                  </div>

                  {resultTab === "request" ? (
                    <div className="code-view">
                      <div className="code-label">
                        <span className="dot green" />
                        <span className="mono">POST /v1/decisions</span>
                        <span>Current configuration</span>
                      </div>
                      <pre tabIndex={0}>{requestPreview}</pre>
                    </div>
                  ) : resultTab === "response" ? (
                    <div className="code-view">
                      <div className="code-label">
                        <span className="dot" />
                        <span className="mono">application/json</span>
                        <span>
                          {selected ? "Selected run" : "Run a decision first"}
                        </span>
                      </div>
                      <pre tabIndex={0}>
                        {selected
                          ? JSON.stringify(selected.result, null, 2)
                          : "// No response yet."}
                      </pre>
                    </div>
                  ) : running ? (
                    <div className="result-empty running-state" role="status">
                      <div className="running-orbit">
                        <Icon name="bolt" size={25} />
                      </div>
                      <h4>Running</h4>
                      <Elapsed started={started} />
                    </div>
                  ) : selected ? (
                    <>
                      {isStale && (
                        <div className="stale-notice">
                          <Icon name="info" size={14} />
                          Configuration changed. Run again to update these
                          answers.
                        </div>
                      )}
                      <div className="result-metrics">
                        <div>
                          <span>
                            Round trip
                            <Icon name="clock" size={12} />
                          </span>
                          <strong className="mono">
                            {time(selected.clientMs)}
                          </strong>
                        </div>
                        <div>
                          <span>
                            Gateway
                            <Icon name="bolt" size={12} />
                          </span>
                          <strong className="mono">
                            {time(selected.result.timing.gatewayMs)}
                          </strong>
                        </div>
                        <div>
                          <span>Request cost</span>
                          <strong className="mono">
                            {selected.result.provider_metadata?.gateway
                              ?.cost !== undefined
                              ? `$${Number(selected.result.provider_metadata.gateway.cost).toFixed(6)}`
                              : "N/A"}
                          </strong>
                        </div>
                      </div>
                      <div className="answers-stack">
                        {selected.result.answers.map((answer, i) => (
                          <AnswerCard
                            key={`${answer.name}-${i}`}
                            answer={answer}
                            question={selected.config.questions.find(
                              (q) => q.name === answer.name,
                            )}
                            threshold={threshold / 100}
                          />
                        ))}
                      </div>
                      <div className="action-outcome">
                        <span
                          className={`outcome-icon ${disposition(selected.result.answers, threshold / 100) === "Ready to automate" ? "ready" : ""}`}
                        >
                          <Icon
                            name={
                              disposition(
                                selected.result.answers,
                                threshold / 100,
                              ) === "Ready to automate"
                                ? "check"
                                : "choice"
                            }
                            size={18}
                          />
                        </span>
                        <div>
                          <strong>
                            {disposition(
                              selected.result.answers,
                              threshold / 100,
                            )}
                          </strong>
                        </div>
                      </div>
                      <div className="response-meta mono">
                        <span>
                          {selected.result.usage?.input_tokens?.toLocaleString() ??
                            "N/A"}{" "}
                          input tokens
                        </span>
                        <span>
                          {selected.result.usage?.output_tokens?.toLocaleString() ??
                            "N/A"}{" "}
                          output tokens
                        </span>
                        <span>
                          {selected.result.provider_metadata?.gateway?.routing
                            ?.finalProvider || "AI Gateway"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="result-empty">
                      <div className="empty-symbol">
                        <Icon name="choice" size={28} />
                      </div>
                      <h4>No results yet</h4>
                      <p>Run this scenario to see the decisions.</p>
                    </div>
                  )}

                  <div className="threshold-setting">
                    <div>
                      <label htmlFor="threshold">Automation threshold</label>
                      <span className="mono threshold-number">
                        {threshold}%
                      </span>
                    </div>
                    <input
                      id="threshold"
                      type="range"
                      min="50"
                      max="99"
                      step="1"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="run-history" aria-label="Measured run history">
              <div className="history-heading">
                <div>
                  <h2>
                    <Icon name="clock" size={16} />
                    Run history
                    <span className="count-badge mono">{runs.length}</span>
                  </h2>
                </div>
                <div className="history-actions">
                  {runs.length > 0 && (
                    <>
                      <button className="text-button" onClick={exportRuns}>
                        <Icon name="download" size={14} />
                        Export
                      </button>
                      <button
                        className="text-button"
                        disabled={running}
                        onClick={() => {
                          setRuns([]);
                          setSelectedRunId(undefined);
                        }}
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="history-body">
                <div className="history-chart">
                  <div className="chart-top">
                    <span className="small muted">Round-trip latency</span>
                    <span className="mono small">
                      {measured.length
                        ? `n = ${measured.length}`
                        : "No measurements yet"}
                    </span>
                  </div>
                  {measured.length ? (
                    <div
                      className="bar-chart"
                      role="group"
                      aria-label="Measured round-trip latencies"
                    >
                      {[...measured].reverse().map((r, i) => (
                        <button
                          key={r.id}
                          className={selectedRunId === r.id ? "selected" : ""}
                          style={{
                            height: `${Math.max(8, (r.clientMs / Math.max(...measured.map((x) => x.clientMs))) * 100)}%`,
                          }}
                          onClick={() => {
                            setSelectedRunId(r.id);
                            setResultTab("answers");
                          }}
                          title={`Run ${i + 1}: ${time(r.clientMs)} · ${r.preset}`}
                          aria-label={`View run ${i + 1}: ${time(r.clientMs)}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty-chart">
                      <span />
                      <span />
                      <span />
                      <p>No runs yet</p>
                    </div>
                  )}
                  <div className="chart-bottom mono">
                    <span>FIRST RUN</span>
                    <span>MOST RECENT</span>
                  </div>
                </div>
                <div className="history-stats">
                  <div>
                    <span>
                      Median <small>p50</small>
                    </span>
                    <strong className="mono">
                      {p50 !== undefined ? time(p50) : "N/A"}
                    </strong>
                  </div>
                  <div>
                    <span>
                      Tail latency <small>p95</small>
                    </span>
                    <strong className="mono">
                      {p95 !== undefined ? time(p95) : "N/A"}
                    </strong>
                  </div>
                </div>
              </div>
              {runs.length > 0 && (
                <div className="history-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Run</th>
                        <th>Scenario</th>
                        <th>Decisions</th>
                        <th>Round trip</th>
                        <th>Gateway</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.slice(0, 8).map((r, index) => (
                        <tr
                          key={r.id}
                          className={r.id === selectedRunId ? "selected" : ""}
                        >
                          <td>
                            <button
                              className="text-button mono"
                              onClick={() => {
                                setSelectedRunId(r.id);
                                setResultTab("answers");
                              }}
                            >
                              #{String(runs.length - index).padStart(2, "0")}
                              <Icon name="upRight" size={12} />
                            </button>
                          </td>
                          <td>{r.preset}</td>
                          <td className="mono">{r.result.answers.length}</td>
                          <td className="mono">{time(r.clientMs)}</td>
                          <td className="mono">
                            {time(r.result.timing.gatewayMs)}
                          </td>
                          <td>
                            <span
                              className={`dot ${disposition(r.result.answers, threshold / 100) === "Ready to automate" ? "green" : "amber"}`}
                            />
                            {disposition(r.result.answers, threshold / 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
        <footer>
          <span className="footer-brand">
            <Icon name="layers" size={15} />
            Decision Lab
          </span>
          <span>
            <svg width="11" height="10" viewBox="0 0 11 10" aria-hidden="true">
              <path d="m5.5 0 5.5 10H0Z" fill="currentColor" />
            </svg>{" "}
            Vercel AI Gateway
          </span>
        </footer>
      </main>

      <dialog
        ref={dialog}
        className="guide-dialog"
        onClose={() => setGuideOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setGuideOpen(false);
        }}
      >
        <div className="guide-content">
          <div className="guide-top">
            <span className="eyebrow">PRESENTER NOTES</span>
            <button
              className="icon-button"
              aria-label="Close demo guide"
              onClick={() => setGuideOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <h2>Demo guide</h2>
          <ol>
            <li>
              <span className="mono">01</span>
              <div>
                <h3>Run a scenario</h3>
                <p>
                  Run Support triage. Point out the boolean, routing choice, and
                  urgency score returned together. Open Response to show the
                  JSON.
                </p>
              </div>
            </li>
            <li>
              <span className="mono">02</span>
              <div>
                <h3>Change the input</h3>
                <p>
                  Use the shuffle icon to swap the message. Run again and watch
                  the classification change without changing application code.
                </p>
              </div>
            </li>
            <li>
              <span className="mono">03</span>
              <div>
                <h3>Edit decisions</h3>
                <p>
                  Expand a question to edit instructions, choices, or its scale.
                  Toggle questions off. Open Request to show exactly what goes
                  to the model.
                </p>
              </div>
            </li>
            <li>
              <span className="mono">04</span>
              <div>
                <h3>Switch use cases</h3>
                <p>
                  Try Model router for capability-based routing, Catalog
                  classification for image input, or Contract screening for a
                  configurable playbook. Custom scenario accepts your own
                  context and decisions.
                </p>
              </div>
            </li>
            <li>
              <span className="mono">05</span>
              <div>
                <h3>Compare latency and confidence</h3>
                <p>
                  Run Benchmark for three measured calls. Explain that round
                  trip includes the network and Gateway. Raise the confidence
                  threshold to show human review without another model call.
                </p>
              </div>
            </li>
          </ol>
          <div className="guide-note">
            <Icon name="info" size={17} />
            <p>
              Only models permitted by your team are selectable. Confidence
              reflects the model’s estimate and should be validated for the
              task. Stopping a request stops the browser wait; a request already
              sent may still incur cost.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => setGuideOpen(false)}
          >
            Back to the playground
            <Icon name="arrow" size={15} />
          </button>
        </div>
      </dialog>
    </div>
  );
}
