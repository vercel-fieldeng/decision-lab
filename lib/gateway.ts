import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";

export async function gatewayToken() {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    return await getVercelOidcToken();
  } catch {
    return undefined;
  }
}

export async function gatewayFetch(path: string, init: RequestInit = {}) {
  const token = await gatewayToken();
  if (!token)
    throw new Error(
      "Gateway credentials are missing. Add AI_GATEWAY_API_KEY to .env.local, or refresh the project's Vercel OIDC token.",
    );
  return fetch(`https://ai-gateway.vercel.sh/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
}
