import { NextResponse } from "next/server";
import { isTrustedSameOriginMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
type ProviderModelResult = { key: "reliable" | "balanced" | "fast"; id: string; available: boolean; reason?: string; generationAvailable?: boolean; generationReason?: string; diagnosticCode?: string };
type ProviderCheckResult = { id: string; name: string; state: string; message: string; models: ProviderModelResult[]; diagnosticCode?: string; requestId?: string | null };
const providers = [
  {
    id: "openai",
    name: "OpenAI",
    key: () => process.env.OPENAI_API_KEY?.trim() || "",
    models: [
      { key: "reliable", id: () => process.env.OPENAI_MODEL?.trim() || "gpt-5.6-sol" },
      { key: "balanced", id: () => process.env.OPENAI_BALANCED_MODEL?.trim() || "gpt-5.6-terra" },
      { key: "fast", id: () => process.env.OPENAI_FAST_MODEL?.trim() || "gpt-5.6-luna" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    key: () => process.env.ANTHROPIC_API_KEY?.trim() || "",
    models: [
      { key: "reliable", id: () => process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-4-8" },
      { key: "balanced", id: () => process.env.ANTHROPIC_BALANCED_MODEL?.trim() || "claude-sonnet-5" },
      { key: "fast", id: () => process.env.ANTHROPIC_FAST_MODEL?.trim() || "claude-haiku-4-5" },
    ],
  },
  {
    id: "google",
    name: "Google Gemini",
    key: () => process.env.GEMINI_API_KEY?.trim() || "",
    models: [
      { key: "reliable", id: () => process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash" },
      { key: "balanced", id: () => process.env.GEMINI_BALANCED_MODEL?.trim() || "gemini-3.5-flash" },
      { key: "fast", id: () => process.env.GEMINI_FAST_MODEL?.trim() || "gemini-3.1-flash-lite" },
    ],
  },
] as const;

export async function POST(request: Request) {
  if (!isTrustedSameOriginMutation(request)) return error(403, "cross_site_request_blocked", "This protected check must start inside V’s Job Seeker.");
  const identity = request.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase();
  if (!identity) return error(401, "authentication_required", "Sign in through ChatGPT before testing provider access.");
  if (!isAllowedIdentity(identity)) return error(403, "access_not_allowed", "This account is not on the cloud AI access list.");
  const input = await readRequest(request);
  const results = await Promise.all(providers.map(checkProvider));
  if (input.live === true && typeof input.provider === "string" && typeof input.modelKey === "string") {
    const provider = providers.find((item) => item.id === input.provider);
    const providerResult = results.find((item) => item.id === input.provider);
    const model = provider?.models.find((item) => item.key === input.modelKey);
    const modelResult = providerResult?.models.find((item) => item.key === input.modelKey);
    if (!provider || !providerResult || !model || !modelResult) return error(400, "invalid_model_check", "Choose a configured provider and model to test.");
    if (!modelResult.available) {
      modelResult.generationAvailable = false;
      modelResult.generationReason = "The model is not present in this API key’s catalog.";
    } else {
      const generation = await checkGeneration(provider.id, provider.key(), model.id());
      modelResult.generationAvailable = generation.available;
      modelResult.generationReason = generation.message;
      modelResult.diagnosticCode = generation.diagnosticCode;
      providerResult.message = generation.available
        ? `${model.id()} passed a real minimal generation request.`
        : `${model.id()} is listed, but generation failed: ${generation.message}`;
      providerResult.state = generation.available ? "ready" : "error";
    }
  }
  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    providers: results,
    note: input.live === true
      ? "The selected model also received one minimal generation request, so quota and billable access were tested."
      : "Catalog checks validate the key and exact model access without generating résumé text. Use the selected-model generation test to confirm quota and billable access.",
  }, { headers: { "Cache-Control": "no-store" } });
}

async function readRequest(request: Request) {
  try {
    const value = await request.json() as Record<string, unknown>;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function checkProvider(provider: typeof providers[number]): Promise<ProviderCheckResult> {
  const apiKey = provider.key();
  const configuredModels = provider.models.map((model) => ({ key: model.key, id: model.id() }));
  if (!apiKey) return { id: provider.id, name: provider.name, state: "not_configured", message: "No protected API key is configured.", models: configuredModels.map((model) => ({ ...model, available: false })) };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchCatalog(provider.id, apiKey, controller.signal);
    const requestId = response.headers.get("x-request-id") || response.headers.get("request-id");
    if (!response.ok) {
      const diagnosticCode = await providerErrorCode(response);
      return { id: provider.id, name: provider.name, state: "error", message: diagnosticMessage(provider.name, diagnosticCode), diagnosticCode, requestId, models: configuredModels.map((model) => ({ ...model, available: false })) };
    }
    const payload = await response.json() as Record<string, unknown>;
    const availableIds = catalogIds(provider.id, payload);
    const models = configuredModels.map((model) => ({ ...model, available: availableIds.has(model.id), reason: availableIds.has(model.id) ? "Available to this API key" : "Not returned by this API project’s model catalog" }));
    const availableCount = models.filter((model) => model.available).length;
    return {
      id: provider.id,
      name: provider.name,
      state: availableCount ? "ready" : "no_configured_models",
      message: availableCount ? `${availableCount} of ${models.length} configured résumé models are available to this key.` : "The key is valid, but none of V’s configured résumé models were returned for this API project.",
      requestId,
      models,
    };
  } catch (cause) {
    return { id: provider.id, name: provider.name, state: "error", message: cause instanceof Error && cause.name === "AbortError" ? "The model catalog check timed out." : "The provider model catalog could not be reached.", models: configuredModels.map((model) => ({ ...model, available: false })) };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkGeneration(provider: typeof providers[number]["id"], apiKey: string, model: string) {
  if (!apiKey) return { available: false, message: "No protected API key is configured.", diagnosticCode: "not_configured" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    let response: Response;
    if (provider === "openai") {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, store: false, input: "Reply with OK.", max_output_tokens: 128, reasoning: { effort: "low" } }),
        signal: controller.signal,
      });
    } else if (provider === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: "user", content: "Reply with OK." }] }),
        signal: controller.signal,
      });
    } else {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }], generationConfig: { maxOutputTokens: 32, thinkingConfig: { thinkingLevel: "LOW" } } }),
        signal: controller.signal,
      });
    }
    if (response.ok) return { available: true, message: "Minimal generation succeeded.", diagnosticCode: "" };
    const diagnosticCode = await providerErrorCode(response);
    return { available: false, message: diagnosticMessage(providerName(provider), diagnosticCode), diagnosticCode };
  } catch (cause) {
    return {
      available: false,
      message: cause instanceof Error && cause.name === "AbortError" ? "The generation check timed out." : "The provider could not be reached.",
      diagnosticCode: cause instanceof Error && cause.name === "AbortError" ? "timeout" : "connection_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function providerName(provider: typeof providers[number]["id"]) {
  return providers.find((item) => item.id === provider)?.name || provider;
}

function fetchCatalog(provider: "openai" | "anthropic" | "google", apiKey: string, signal: AbortSignal) {
  if (provider === "openai") return fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal });
  if (provider === "anthropic") return fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, signal });
  return fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { headers: { "x-goog-api-key": apiKey }, signal });
}

function catalogIds(provider: "openai" | "anthropic" | "google", payload: Record<string, unknown>) {
  const source = provider === "google" ? payload.models : payload.data;
  const items = Array.isArray(source) ? source : [];
  return new Set(items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (provider === "google" && Array.isArray(record.supportedGenerationMethods) && !record.supportedGenerationMethods.includes("generateContent")) return [];
    const value = typeof record.id === "string" ? record.id : typeof record.name === "string" ? record.name.replace(/^models\//, "") : "";
    return value ? [value] : [];
  }));
}

async function providerErrorCode(response: Response) {
  try {
    const payload = await response.json() as Record<string, unknown>;
    const problem = payload.error;
    if (typeof problem === "string") return safeCode(problem);
    if (problem && typeof problem === "object") {
      const record = problem as Record<string, unknown>;
      return safeCode(record.code || record.type || record.status || record.message || "");
    }
  } catch {}
  return `http_${response.status}`;
}

function diagnosticMessage(provider: string, code: string) {
  if (/quota|billing|resource_exhausted|rate_limit/i.test(code)) return `${provider} reports no available quota for this API project.`;
  if (/key|auth|permission|forbidden|unauth/i.test(code)) return `${provider} rejected this API key or its permissions.`;
  return `${provider} rejected the model catalog check (${code || "unknown error"}).`;
}

function isAllowedIdentity(identity: string) {
  const allowlist = process.env.AI_ALLOWED_EMAILS?.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) || [];
  return !allowlist.length || allowlist.includes(identity);
}

function safeCode(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 120);
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status, headers: { "Cache-Control": "no-store" } });
}
