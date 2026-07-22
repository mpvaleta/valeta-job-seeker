export class HttpJsonError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpJsonError";
    this.status = status;
    this.code = code;
  }
}

export async function readJsonResponse(response, fallback) {
  const text = await response.text();
  if (!text.trim()) {
    throw new HttpJsonError(response.status, "empty_response", `${fallback} The server returned an empty response (HTTP ${response.status}).`);
  }

  try {
    return JSON.parse(text);
  } catch {
    const looksLikeHtml = /^\s*<!doctype html|^\s*<html|<title[\s>]/i.test(text);
    const message = looksLikeHtml
      ? `${fallback} The server returned a sign-in or hosting page instead of app data. Reopen V’s Job Seeker from ChatGPT and try again.`
      : `${fallback} The server returned unreadable data (HTTP ${response.status}).`;
    throw new HttpJsonError(response.status, "non_json_response", message);
  }
}
