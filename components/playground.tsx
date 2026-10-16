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

const modeIcons: Record<Mode, IconName> = {
  text: "text",
  json: "braces",
  image: "image",
};
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
          aria-label={`Edit question ${index + 1}: ${q.title}`}
        >
          <span>{q.title}</span>
          <span className="question-summary">
            {q.type === "boolean"
              ? "Yes or no, with probability"
              : q.options.join(" · ")}
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
              Question type
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
            <label>
              {q.type === "score"
                ? "Scale labels, lowest → highest"
                : "Choices"}
              <textarea
                className="mono"
                rows={3}
                disabled={disabled}
                value={q.options.join("\n")}
                onChange={(e) =>
                  onChange({ ...q, options: e.target.value.split("\n") })
                }
              />
              <span className="field-hint">
                One per line. Between 2 and 10 unique labels.
              </span>
            </label>
          )}
          <button
            className="text-button remove"
            onClick={onRemove}
            disabled={disabled}
          >
            Remove question
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
  const [imageName, setImageName] = useState("monitor-damaged.png");
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
    (mode === "text"
      ? SUPPORT_ALTERNATES.includes(input)
      : input === preset.input) &&
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

  async function loadSampleImage() {
    const response = await fetch("/monitor-damaged.png");
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
    setImageName(
      draft?.imageName ?? (id === "inspection" ? "monitor-damaged.png" : ""),
    );
    setCustomImage(draft?.customImage ?? false);
    setSampleIndex(0);
    if (id === "inspection") {
      try {
        const sampleImage = await loadSampleImage();
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
              href="https://vercel.com/docs/ai-gateway/modalities/decision"
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
        {focused && <h1 className="sr-only">Decision Lab playground</h1>}
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span className="tiny-square" />
              THE DECISION LAYER
            </div>
            <h1>From context to action.</h1>
            <p>
              Give a model context. Ask precise questions.
              <br className="mobile-break" /> Get answers your application can
              act on.
            </p>
          </div>
          <div
            className="hero-flow"
            role="img"
            aria-label="One shared input becomes boolean, choice, and score answers"
          >
            <div className="flow-context">
              <Icon name="layers" size={22} />
              <span>Context</span>
            </div>
            <span className="flow-connector" />
            <div className="flow-engine">
              <Icon name="bolt" size={21} />
            </div>
            <span className="flow-connector" />
            <div className="flow-outputs">
              <span>
                <Icon name="boolean" size={13} />
                Boolean
              </span>
              <span>
                <Icon name="choice" size={13} />
                Choice
              </span>
              <span>
                <Icon name="score" size={13} />
                Score
              </span>
            </div>
            <div className="flow-caption mono">ONE REQUEST. TYPED ANSWERS.</div>
          </div>
        </section>

        <section
          id="workspace"
          className="workspace"
          aria-label="Decision playground"
        >
          <div className="workspace-top">
            <div className="workspace-title">
              <span className="dot green" />
              <h2>Playground</h2>
              <span className="version mono">01</span>
            </div>
          </div>
          <div
            className="scenario-bar"
            role="tablist"
            aria-label="Demo scenario"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={p.id === presetId}
                tabIndex={p.id === presetId ? 0 : -1}
                onKeyDown={navigateTabs}
                className={`scenario-tab ${p.id === presetId ? "active" : ""}`}
                onClick={() => void selectPreset(p.id)}
                disabled={running}
              >
                <Icon
                  name={p.id === "custom" ? "plus" : modeIcons[p.mode]}
                  size={17}
                />
                <span>{p.label}</span>
                <span className="scenario-type mono">{p.short}</span>
              </button>
            ))}
          </div>
          <div className="model-strip">
            {preset.description && <span>{preset.description}</span>}
            <label className="model-select">
              <span className="model-symbol">◎</span>
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
                      {!m.eligible ? " · provider blocked" : ""}
                    </option>
                  ))
                ) : (
                  <option value={DEFAULT_MODEL}>GPT-6 Luna Decisions</option>
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
                <h3>
                  <span className="step mono">01</span>Provide context
                </h3>
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
                    <span className="type-badge mono">{modeLabels[mode]}</span>
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
                              ? "Synthetic returned monitor with a visibly cracked screen"
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
                              : "Loading synthetic sample…"}
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
                            : "—"}
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
                        ? "Paste a JSON record to evaluate…"
                        : mode === "image"
                          ? "Describe the context or criteria for evaluating this image…"
                          : "Write or paste the context for your scenario…"
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
                <h3>
                  <span className="step mono">02</span>Define the decisions
                </h3>
                <span className="muted small">
                  {activeCount} in one request
                </span>
              </div>
              <div className="question-list">
                {questions.map((q, index) => (
                  <QuestionEditor
                    key={q.id}
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
                  setQuestions((previous) => [...previous, createQuestion(id)]);
                }}
              >
                <Icon name="plus" size={14} />
                Add a question<span className="mono">{questions.length}/8</span>
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
                    ? `Deciding${progress && progress.total > 1 ? ` ${progress.current}/${progress.total}` : ""}…`
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
                <h3>
                  <span className="step mono">03</span>Act on the answers
                </h3>
                {selected && (
                  <span className="result-status">
                    <span className="dot green" />
                    Completed
                  </span>
                )}
              </div>
              <div className="result-tabs">
                <div role="tablist" aria-label="Result view">
                  {(["answers", "request", "response"] as const).map((t) => (
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
                  ))}
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
                      : "// Your live Gateway response will appear here."}
                  </pre>
                </div>
              ) : running ? (
                <div className="result-empty running-state" role="status">
                  <div className="running-orbit">
                    <Icon name="bolt" size={25} />
                  </div>
                  <h4>Making the call.</h4>
                  <p>
                    {activeCount} questions, one shared context.
                    <br />
                    Waiting for the model’s complete response.
                  </p>
                  <Elapsed started={started} />
                  <span className="empty-caption mono">
                    LIVE GATEWAY REQUEST
                  </span>
                </div>
              ) : selected ? (
                <>
                  {isStale && (
                    <div className="stale-notice">
                      <Icon name="info" size={14} />
                      Configuration changed. Run again to update these answers.
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
                        {selected.result.provider_metadata?.gateway?.cost !==
                        undefined
                          ? `$${Number(selected.result.provider_metadata.gateway.cost).toFixed(6)}`
                          : "—"}
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
                        {disposition(selected.result.answers, threshold / 100)}
                      </strong>
                      <p>
                        {disposition(
                          selected.result.answers,
                          threshold / 100,
                        ) === "Ready to automate"
                          ? "Every answer meets your confidence policy."
                          : "At least one answer needs a second look."}
                      </p>
                    </div>
                    <span className="type-badge">Policy outcome</span>
                  </div>
                  <div className="response-meta mono">
                    <span>
                      {selected.result.usage?.input_tokens?.toLocaleString() ??
                        "—"}{" "}
                      input tokens
                    </span>
                    <span>
                      {selected.result.usage?.output_tokens?.toLocaleString() ??
                        "—"}{" "}
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
                  <h4>
                    A little context.
                    <br />A clear next step.
                  </h4>
                  <p>
                    Run a decision to see probabilities, choices,
                    <br />
                    and scores arrive in one response.
                  </p>
                  <button
                    className="text-button empty-run"
                    onClick={() => void runDecision()}
                    disabled={!selectedEligible || connection !== "connected"}
                  >
                    Make your first decision
                    <Icon name="arrow" size={14} />
                  </button>
                  <div className="empty-types">
                    <span>
                      <Icon name="boolean" size={14} />
                      Boolean
                    </span>
                    <span>
                      <Icon name="choice" size={14} />
                      Choice
                    </span>
                    <span>
                      <Icon name="score" size={14} />
                      Score
                    </span>
                  </div>
                </div>
              )}

              <div className="threshold-setting">
                <div>
                  <label htmlFor="threshold">Automation threshold</label>
                  <span className="mono threshold-number">{threshold}%</span>
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
                  <p>Your first run sets the baseline.</p>
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
                  {p50 !== undefined ? time(p50) : "—"}
                </strong>
              </div>
              <div>
                <span>
                  Tail latency <small>p95</small>
                </span>
                <strong className="mono">
                  {p95 !== undefined ? time(p95) : "—"}
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
                    <th>Questions</th>
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

        <div className="principles">
          <div>
            <span className="principle-icon">
              <Icon name="bolt" size={18} />
            </span>
            <h3>Decide, then move.</h3>
            <p>
              Typed answers instead of free-form text. Build the next action
              directly into your application.
            </p>
          </div>
          <div>
            <span className="principle-icon">
              <Icon name="layers" size={18} />
            </span>
            <h3>One context. Many questions.</h3>
            <p>
              Combine booleans, choices, and scores in a single request. Share
              the input across every question.
            </p>
          </div>
          <div>
            <span className="principle-icon">
              <Icon name="choice" size={18} />
            </span>
            <h3>Your policy stays in control.</h3>
            <p>
              Confidence is a signal, not a guarantee. Set a threshold and keep
              uncertain decisions with a human.
            </p>
          </div>
        </div>
        <footer>
          <span className="footer-brand">
            <Icon name="layers" size={15} />
            Decision Lab
          </span>
          <span>
            Built with{" "}
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
          <h2>A five-minute walkthrough.</h2>
          <p className="guide-intro">
            Show how a small, typed decision becomes a useful action.
          </p>
          <ol>
            <li>
              <span className="mono">01</span>
              <div>
                <h3>Start with the shape of an answer.</h3>
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
                <h3>Change the evidence.</h3>
                <p>
                  Use the shuffle icon to swap the message. Run again and watch
                  the classification change without changing application code.
                </p>
              </div>
            </li>
            <li>
              <span className="mono">03</span>
              <div>
                <h3>Make the configuration visible.</h3>
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
                <h3>Go beyond text.</h3>
                <p>
                  Try Return eligibility for JSON and Visual inspection for a
                  real image request. The output contract stays boolean, choice,
                  and score. Open Custom scenario to supply your own context and
                  define a decision from scratch.
                </p>
              </div>
            </li>
            <li>
              <span className="mono">05</span>
              <div>
                <h3>Measure, then set a policy.</h3>
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
