import type { Mode, Question } from "./decision";

const q = (
  name: string,
  title: string,
  type: Question["type"],
  instructions: string,
  options: string[] = [],
): Question => ({
  id: name,
  name,
  title,
  type,
  instructions,
  options,
  enabled: true,
});
export type PresetId = "support" | "returns" | "inspection" | "custom";
export type Preset = {
  id: PresetId;
  label: string;
  short: string;
  description: string;
  mode: Mode;
  input: string;
  questions: Question[];
};

export const PRESETS: Preset[] = [
  {
    id: "support",
    label: "Support triage",
    short: "Text",
    mode: "text",
    description: "",
    input:
      "Hi Acme team — my replacement monitor arrived this morning with a cracked screen. This is the second damaged delivery, and I need it for a client presentation tomorrow. Please refund the order instead of sending another replacement.",
    questions: [
      q(
        "refund_requested",
        "Refund requested?",
        "boolean",
        "Does the customer explicitly request a refund or money back? Return true only for an explicit request, not a general complaint.",
      ),
      q(
        "route",
        "Route to the right team",
        "choice",
        "Which team should own the next action? Prioritize the customer's requested resolution over the original cause.",
        ["Billing", "Shipping", "Technical", "General"],
      ),
      q(
        "urgency",
        "Assess urgency",
        "score",
        "Rate the urgency based on impact, repetition, and time sensitivity. Critical is reserved for immediate safety risk or a widespread outage.",
        ["Low", "Medium", "High", "Critical"],
      ),
    ],
  },
  {
    id: "returns",
    label: "Return eligibility",
    short: "JSON",
    mode: "json",
    description: "Apply a policy directly to a structured record.",
    input: JSON.stringify(
      {
        order: {
          id: "ORDER-DEMO-0001",
          merchant: "Acme Corp",
          total_usd: 249,
          delivered_days_ago: 12,
          item: "Monitor",
          condition: "damaged_on_arrival",
          replacement_attempts: 1,
        },
        customer: { requested_resolution: "refund", prior_returns: 0 },
        policy: {
          return_window_days: 30,
          accepts_damaged_items: true,
          auto_refund_limit_usd: 300,
        },
      },
      null,
      2,
    ),
    questions: [
      q(
        "eligible",
        "Eligible under the policy?",
        "boolean",
        "Does this return meet the supplied return window and accepted condition policy? Evaluate only the record and policy provided.",
      ),
      q(
        "resolution",
        "Choose the next action",
        "choice",
        "Select a refund if eligible, requested, and under the automatic refund limit. Otherwise choose replacement for an eligible order, or review when information is missing or eligibility fails.",
        ["Refund", "Replace", "Review"],
      ),
      q(
        "risk",
        "Assess return risk",
        "score",
        "Assess abuse risk from order amount, prior returns, and repeated replacement attempts. Do not infer facts absent from the record.",
        ["Very low", "Low", "Moderate", "High", "Very high"],
      ),
    ],
  },
  {
    id: "inspection",
    label: "Visual inspection",
    short: "Image",
    mode: "image",
    description: "Ask the same typed questions about visual evidence.",
    input:
      "Inspect this synthetic product illustration of a returned monitor. Use visible evidence to assess its condition and recommend the next action. The customer reports it arrived damaged.",
    questions: [
      q(
        "visible_damage",
        "Visible damage?",
        "boolean",
        "Does the monitor show visible physical damage, such as cracks in its screen? Base the answer on the image, not solely on the customer report.",
      ),
      q(
        "resolution",
        "Recommend a resolution",
        "choice",
        "Choose the next action based on visible product condition. Replace an item with a cracked display; accept an intact item; request more evidence if condition is unclear.",
        ["Replace", "Accept", "More evidence"],
      ),
      q(
        "severity",
        "Rate damage severity",
        "score",
        "Assess the physical damage shown in the image, from intact through complete loss of functionality.",
        ["Intact", "Cosmetic", "Moderate", "Severe", "Unusable"],
      ),
    ],
  },
  {
    id: "custom",
    label: "Custom scenario",
    short: "Build",
    mode: "text",
    description: "Your context. Your questions. The same typed answers.",
    input: "",
    questions: [q("decision", "Your decision", "boolean", "")],
  },
];

export const SUPPORT_ALTERNATES = [
  PRESETS[0].input,
  "Hi Acme team, could you help me find the invoice for my last order? No rush — I am just organizing my receipts. Thank you!",
  "The Acme desktop app crashes every time I try to export a file. I have a deadline in an hour and restarting has not helped. Please help me get back to work.",
];
