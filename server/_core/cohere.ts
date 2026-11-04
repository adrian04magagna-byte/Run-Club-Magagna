import { TRPCError } from "@trpc/server";

import { ENV } from "./env";

const COHERE_CHAT_URL = "https://api.cohere.com/v2/chat";
const REQUEST_TIMEOUT_MS = 60_000;

export function isCohereConfigured() {
  return Boolean(ENV.cohereApiKey);
}

/**
 * Asks Cohere's chat model for a JSON object that follows `schema` and returns it parsed.
 * Callers still validate the result: the schema guides the model, it does not bound numbers.
 */
export async function cohereJson(system: string, prompt: string, schema: Record<string, unknown>): Promise<unknown> {
  if (!isCohereConfigured()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A IA ainda não foi configurada no servidor." });
  }
  let response: Response;
  try {
    response = await fetch(COHERE_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.cohereApiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: ENV.cohereModel,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        response_format: { type: "json_object", schema },
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TRPCError({ code: "TIMEOUT", message: "A IA demorou para responder. Tente de novo em instantes." });
  }
  if (response.status === 429) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "A IA atingiu o limite gratuito por agora. Tente de novo mais tarde." });
  }
  if (response.status === 401 || response.status === 403) {
    console.error("[cohere] rejected the API key", response.status);
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A chave da IA foi recusada. Confira a configuração do servidor." });
  }
  if (!response.ok) {
    console.error("[cohere] chat failed", response.status, (await response.text()).slice(0, 300));
    throw new TRPCError({ code: "BAD_GATEWAY", message: "A IA não respondeu agora. Tente de novo em instantes." });
  }
  const body = await response.json() as { message?: { content?: { type?: string; text?: string }[] } };
  const text = body.message?.content?.find((part) => part.type === "text" || part.text)?.text;
  try {
    return JSON.parse(text ?? "");
  } catch {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "A IA devolveu uma resposta incompleta. Tente de novo." });
  }
}
