# Decision Lab

A minimal, Geist-styled playground for demonstrating decision models through Vercel AI Gateway. Built with Next.js and React, using the native OpenAI-compatible `POST /v1/decisions` API. The UI uses the public [Vercel design reference](https://github.com/educlopez/design-bites/blob/main/design-mds/vercel.com/DESIGN.md), Geist Sans and Geist Mono, monochrome surfaces, subtle shadows, and small status indicators.

## Run

```sh
npm install
cp .env.example .env.local
# Set AI_GATEWAY_API_KEY in .env.local, then:
npm run dev
```

Open http://localhost:3001. Credentials stay on the server. Alternatively, set `VERCEL_OIDC_TOKEN` using an existing linked Vercel project. Local OIDC tokens expire after roughly 12 hours and must be refreshed before a demo. Vercel deployments receive their own OIDC token automatically.

The app is deployed at [decision-lab.playground-vercel.tools](https://decision-lab.playground-vercel.tools) in Internal Playground, with Vercel SSO protection on all deployments. Hosted requests use the rotating OIDC token from Vercel's request context through `@vercel/oidc`; no persistent Gateway key is configured. For local demos, run `npm run auth:refresh`, then restart the app. This uses Decision Lab's linked project and preserves other local environment values. You can also pass another already-linked project directory: `npm run auth:refresh -- /path/to/linked/project`.

## Demo flow

The in-app **Demo guide** contains a five-minute presenter walkthrough. **Present** hides the introduction and extra explanation to put the workspace first during screen sharing. Light and dark themes are available.

1. Run **Support triage** to return a boolean, routing choice, and urgency score together.
2. Shuffle the input to a low-priority message and rerun. Expand questions to change their instructions, labels, answer keys, types, or scale. Toggle questions or add up to eight.
3. Open **Request** and **Response** to show the actual contract and live payload. Image bytes are omitted from the request preview.
4. Switch to **Return eligibility** to evaluate a synthetic JSON record against an explicit policy.
5. Try **Visual inspection** with the included synthetic damaged-monitor PNG, or upload your own PNG/JPEG/WebP (4 MB max). It makes an actual multimodal request, with image bytes supplied to the decision model.
6. Use **Benchmark ×3** for three sequential real calls. Run history shows round-trip latency and Gateway latency, with measured p50/p95, a chart, and JSON export.
7. Adjust the automation threshold to change the local policy outcome immediately. No additional inference is needed. Missing confidence, refusals, and uncertain answers go to review.
8. Open **Custom scenario** to start with blank context and an open decision editor. Choose Text, JSON, or Image; supply your context; edit the answer key, label, type, instructions, and choice or scale labels. Add up to eight questions. Your draft, format, and uploaded image survive switching scenario tabs during the session. Refresh clears the draft.

## Measurement and model behavior

- Every answer, confidence value, token count, and cost comes from a live Gateway response. Empty states show no fabricated performance or results.
- Round-trip latency measures the browser request through receipt of its parsed response. Gateway latency measures the server's upstream Gateway fetch through receipt of its parsed response; it includes routing and provider inference. It is not isolated model compute time. Local development can add compilation overhead to the first round trip.
- History is memory-only, capped at 50 runs; the table displays the eight latest. Refresh clears it. Percentiles combine measured runs for the currently selected model across scenarios, using nearest rank. Small samples are directional and should not be treated as a statistical performance claim.
- Benchmark sends three billable calls. Stop cancels the browser request and stops additional benchmark calls; an in-flight upstream call may still complete and be billed.
- The server checks the authenticated team availability catalog. Blocked models are disabled in the selector. `openai/gpt-6-luna-decisions` was the only eligible native decision model when checked on October 16, 2026. The Gateway remains authoritative and enforces its current policy on each call.
- Image input is supported by the enabled OpenAI decision model via its native API. This follows the current [Gateway Decisions API documentation](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions), which explicitly documents images even though the catalog's modalities metadata may say text only.
- Confidence is the model's estimate, not a guarantee. For booleans, confidence is the probability of the selected yes/no answer. For choice and score, the returned confidence is used, or the largest returned option probability when confidence is omitted. The threshold is a local demonstration policy, not an executed refund or external action.
- All seeded text, order data, and product imagery is synthetic. No real customer records, names, or production data are included. The model catalog and runtime performance are live technical metadata.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

The hosted presentation app uses Vercel deployment protection to restrict access to authorized team members. Keep this protection enabled because the decision endpoint makes billable Gateway calls. The origin check is a basic cross-origin safeguard, not authentication.

## Structure

- `components/playground.tsx`: interactive workspace, configuration, results, history, and presenter guide.
- `lib/decision.ts`: request construction, validation, confidence policy, and latency statistics.
- `lib/presets.ts`: three synthetic examples and a blank custom scenario.
- `app/api/decide/route.ts`: server-only authenticated decision call.
- `app/api/models/route.ts`: live team eligibility check.
- `public/monitor-damaged.svg`: source for the synthetic inspection image; PNG is the actual model input.
