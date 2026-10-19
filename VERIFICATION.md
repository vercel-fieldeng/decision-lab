# Decision Lab verification

Verified October 16, 2026, locally and on the production deployment in Internal Playground.

## October 18 use case expansion

The playground now has eight examples and a custom scenario. Each new example was tested from the browser through `/api/decide` and AI Gateway to rendered results.

| Scenario | Live result |
| --- | --- |
| Guardrails | Policy violation: Yes; Action: Block; Risk: Critical. |
| Model router | Needs vision: Yes; Selected model: Vision; Complexity: Medium. A simple text classification request instead selected Fast text with no vision requirement. |
| Lead qualification | Qualified: Yes; Route: Sales; Priority: High. |
| Catalog classification | Actual backpack PNG sent inline; Category: Backpacks; Color: Olive; Needs review: No. |
| Contract screening | Default clause: outside playbook, Legal review, Major deviation. Matching notice-period and price-increase limits: within playbook, Standard, None. An ambiguous notice-period phrase discovered during testing was clarified. |

| Before | After |
| --- | --- |
| Four scenario tabs | Grouped desktop sidebar with all nine use cases; native grouped select at widths up to 1160 px. |
| Large introduction, flow illustration, and feature summaries | Compact page title and workspace centered on context, decisions, and results. |
| Promotional result placeholders and repeated outcome prose | Short empty state and direct result labels. |
| Fixed monitor-specific sample loading and image description | Typed image metadata per preset, with a synthetic backpack SVG and PNG for catalog classification. |
| Scenario editors could retain the previous input's scroll position | Context remounts on use case or format changes; decision editors reset per scenario. Custom draft restoration is preserved. |
| Text presets could be mislabeled as custom input | Provenance checks match the selected preset, including the contract sample. |
| Small picker and navigation controls | At least 40 px controls for the new navigation and model selector, keyboard focus rings, and native mobile selection. |
| Older documentation link and verbose labels | Current native Decisions API docs, shorter labels, and no em dashes in seeded UI copy. |

Validation: ten tests passed, strict typecheck passed, and production build passed. Seeded-use-case tests load the actual PNGs and validate every default request. Browser checks found no horizontal overflow at 390, 800, 1160, 1280, and 1440 px. Mobile selection, light/dark layouts, and Present mode worked. The custom image draft, input, format, and edited decision survived switching use cases. Mobile light and desktop dark axe audits reported zero violations; the keyboard shortcut glyph remains an incomplete automated contrast check. Browser console had no application errors.

Synthetic-data gate: five new synthetic scenarios, zero ambiguous data clusters, zero real records embedded. Model routing targets and their relative latency labels are illustrative configuration, not measurements or additional Gateway calls. Contract screening compares supplied text to a supplied playbook; it does not determine enforceability or approve an agreement.

## Production deployment

- URL: https://decision-lab.playground-vercel.tools
- Deployment: READY, Next.js 16.4.0, owned by Internal Playground.
- Vercel SSO protects all deployments. Verification used authenticated CLI access and a temporary browser cookie; protection settings were preserved.
- An initial hosted check found that reading only `process.env.VERCEL_OIDC_TOKEN` missed the Function's request-context token. The Gateway helper now uses `@vercel/oidc` to retrieve the current rotating token. No persistent Gateway key was created or uploaded.
- Hosted `/api/models`: connected, complete catalog, one eligible native decision model (`openai/gpt-6-luna-decisions`); ten models blocked by the team provider allowlist.
- Hosted support text: browser → API → Gateway → rendered answers; 608 ms round trip, 353 ms Gateway.
- Hosted image: synthetic PNG → API → Gateway → rendered visible damage, Replace, Unusable; 517 ms round trip, 309 ms Gateway.
- Hosted structured JSON: HTTP 200, eligible, Refund, low risk; 335 ms Gateway, reported cost $0.0000591.
- Production browser reported no console errors or uncaught exceptions. Hosted axe audit: zero violations, two incomplete checks (chart labeling and symbolic glyph contrast).
- Latest deployment runtime error scan returned no logs at error level. No dedicated monitoring or log drain was configured.
- Eight focused tests, typecheck, and the hosted production build passed after the custom-scenario update. Dependency audit remains clear.
- Latest hosted custom-scenario browser check: blank editor → user-defined context/question → Gateway → typed boolean answer rendered; 587 ms round trip, 246 ms Gateway. No browser errors. All eight requested copy snippets were absent from rendered content.

Observed timings are individual samples, not performance guarantees.

## User story

Choose text, structured JSON, or an image; configure typed questions; send a live request through the server and AI Gateway; inspect the answers, confidence, latency, cost, and local automation policy.

| Boundary | Result | Evidence |
| --- | --- | --- |
| UI → server → Gateway → UI | Passed | Text, JSON and image presets all returned real answers through `/api/decide`. |
| Authenticated availability | Passed | Catalog complete; `openai/gpt-6-luna-decisions` eligible, ten other decision models blocked. |
| Multimodal image input | Passed | Actual synthetic PNG sent as an `input_image` data URL; model detected visible damage and recommended replacement. |
| Benchmark | Passed | Three sequential calls produced three history entries and measured p50/p95. |
| Local confidence policy | Passed | Raising image-run threshold from 85% to 99% changed the outcome to human review; run count stayed at four. |
| Configurable contract | Passed | Disabling a score question changed the request to two questions. Image bytes are redacted in the request preview. |
| Keyboard and presenter controls | Passed | Arrow keys moved Request → Response; Escape closed the guide; Present hid extra page content. |
| Input validation | Passed | Malformed JSON and zero enabled questions returned HTTP 400; cross-origin POST returned 403. |
| Mobile | Passed | At 390 × 844, document width was 390 px and the workspace used a single column. |
| Accessibility | Passed | Automated axe audits reported zero violations on light desktop, mobile, and dark presentation mode. |
| Focused tests | Passed | Eight tests cover mixed question contracts, image encoding, invalid requests, confidence policy, latency percentiles, custom modalities, and malformed runtime types. |
| TypeScript and production build | Passed | `npm run typecheck` and `npm run build`; Next.js 16.4.0. |
| Dependency audit | Passed | Zero known vulnerabilities reported after updating the scaffold's Next.js version. |
| Credential refresh | Passed | `npm run auth:refresh` refreshed only the server-side OIDC token, preserving other environment values. |
| Custom scenario | Passed | Blank fourth tab; text, JSON and uploaded-image requests returned live results. Boolean, choice and score questions produced the expected native API types. |
| Custom draft | Passed | Context, edited questions, format, toggles and uploaded image survived switching away and back to the custom tab. |
| Runtime typing | Passed | Unknown input is checked without a `DecisionConfig` cast; invalid enum values, malformed fields, duplicate keys/options, blank labels/instructions, invalid JSON and missing images are rejected before inference. Eight focused tests and strict TypeScript checks passed. |
| Presentation copy | Passed | Removed the requested footer, credit note, threshold help, history captions, support description, and Gateway success label. |
| Custom mobile accessibility | Passed | No horizontal overflow at 390 px and 800 px; four scenario tabs form a two-column grid on mobile. Axe reported zero violations after preserving readable labels for toggled-off questions. |

Initial live round trips were 276 ms for support text, 339 ms for structured JSON, and 530 ms for image inspection. A later image call took 871 ms. These are observed samples, not a performance guarantee. Round-trip measurements include network, routing, and inference; the interface never labels them as isolated model compute time.

## Interface choices

| Before | After |
| --- | --- |
| Empty project | Geist Sans/Mono, a monochrome light/dark palette, 4 px spacing, restrained weights and letter spacing, and surface outlines composed with shadows. |
| No presentation flow | Three synthetic presets, editable questions, payload inspection, measured history, and a five-minute presenter guide. |
| Dense result distributions | Primary answers stay visible; detailed option probabilities expand on demand. |
| Full explanatory page during a demo | Present mode puts the workspace first while retaining a screen-reader heading. |
| Default browser focus | Double-ring focus indicators, a skip link, keyboard-operable tabs, accessible labels, and a native modal dialog. |
| Static interaction states | Explicit color/background transitions, a live elapsed timer, small answer transitions, tabular numerals, and reduced-motion support. |
| Low-contrast muted annotations | Darker muted text; light desktop and mobile audits reported zero violations. |
| Seeded data provenance unspecified | All three example scenarios and the product illustration are synthetic. Runtime inputs are labeled custom after edits or uploads. |

## Limits

Confidence is a model estimate. The local policy outcome does not issue refunds or invoke external actions. History is memory-only and clears on refresh. Local OIDC tokens expire; refresh and restart before presenting locally on another day. The hosted app uses rotating request-context tokens and requires authorized Vercel access.
