import { gatewayFetch, gatewayToken } from "@/lib/gateway";

export async function GET() {
  if (!(await gatewayToken()))
    return Response.json({
      connected: false,
      models: [],
      error: "Add AI_GATEWAY_API_KEY to .env.local to connect.",
    });
  try {
    const response = await gatewayFetch("models?include_availability");
    const body = await response.json();
    if (!response.ok)
      return Response.json({
        connected: false,
        models: [],
        error:
          response.status === 401
            ? "Gateway authentication expired. Refresh your OIDC token or set AI_GATEWAY_API_KEY."
            : "Model availability could not be checked.",
      });
    const complete =
      body.availability_status === "complete" &&
      body.catalog_status === "complete";
    const models = (body.data || [])
      .filter((m: { type: string }) => m.type === "evaluation")
      .map(
        (m: {
          id: string;
          name: string;
          model_eligibility?: { status: string; reason?: string };
        }) => ({
          id: m.id,
          name: m.name,
          eligible: complete && m.model_eligibility?.status === "eligible",
          reason: m.model_eligibility?.reason,
        }),
      );
    return Response.json({
      connected: true,
      complete,
      models,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return Response.json({
      connected: false,
      models: [],
      error: "AI Gateway is unreachable. Check your connection and retry.",
    });
  }
}
