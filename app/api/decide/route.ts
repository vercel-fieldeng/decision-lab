import { buildRequest, validateConfig, ValidationError } from "@/lib/decision";
import { gatewayFetch } from "@/lib/gateway";

export const maxDuration = 60;

export async function POST(request: Request) {
  const serverStart = performance.now();
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return Response.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  try {
    const text = await request.text();
    if (text.length > 5_700_000)
      return Response.json(
        { error: "Input is too large. Use an image smaller than 4 MB." },
        { status: 413 },
      );
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ValidationError("The request must contain valid JSON.");
    }
    const config = validateConfig(body);
    const gatewayStart = performance.now();
    const upstream = await gatewayFetch("decisions", {
      method: "POST",
      body: JSON.stringify(buildRequest(config)),
    });
    const result = await upstream.json();
    const gatewayMs = performance.now() - gatewayStart;
    if (!upstream.ok) {
      const message =
        upstream.status === 401
          ? "Gateway authentication expired. Refresh your local OIDC token or set AI_GATEWAY_API_KEY."
          : result.error?.message || "The decision request failed. Try again.";
      return Response.json({ error: message }, { status: upstream.status });
    }
    if (!Array.isArray(result.answers))
      return Response.json(
        { error: "Gateway returned an unexpected answer format." },
        { status: 502 },
      );
    return Response.json({
      ...result,
      timing: { gatewayMs, serverMs: performance.now() - serverStart },
    });
  } catch (error) {
    if (error instanceof ValidationError)
      return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.name === "TimeoutError")
      return Response.json(
        { error: "The Gateway request timed out after 45 seconds. Try again." },
        { status: 504 },
      );
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach AI Gateway.",
      },
      { status: 503 },
    );
  }
}
