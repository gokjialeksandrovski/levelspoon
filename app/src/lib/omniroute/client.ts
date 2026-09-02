class GatewayError extends Error {
  constructor(status: number) {
    super(`OmniRoute gateway request failed with status ${status}`);
    this.name = "GatewayError";
  }
}

export const omniRouteUrl = (): string => {
  const url = process.env.OMNIROUTE_URL;
  if (!url) {
    throw new Error("Missing required environment variable: OMNIROUTE_URL");
  }
  return url;
};

// 512 output tokens: comfortably above the 175-296 tokens real gram estimates
// took from fast, well-behaved models (Gemini flash/flash-lite) in manual
// testing, but a hard ceiling on the reasoning-heavy models observed
// occasionally routed to via OMNIROUTE_MODEL=auto's openrouter fallback,
// which ran up to 14,100 tokens on the same task before answering.
export const MAX_RESPONSE_TOKENS = 512;

export interface OmniRouteResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export const parseNumericResponse = (body: OmniRouteResponse): number => {
  const text = body.choices?.[0]?.message?.content ?? "";
  const value = Number.parseFloat(text);
  if (Number.isNaN(value)) {
    throw new Error(`OmniRoute gateway returned a non-numeric response: ${text}`);
  }
  return value;
};

export const postChatCompletion = async (url: string, body: unknown): Promise<OmniRouteResponse> => {
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new GatewayError(response.status);
  }
  return (await response.json()) as OmniRouteResponse;
};
