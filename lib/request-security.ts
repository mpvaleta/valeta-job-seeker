type MutationTrustOptions = {
  /**
   * Accept a caller that authenticates with an explicit Authorization header
   * even when the browser reports the request as cross-site.
   *
   * This is safe, but it is not free, so it is opt-in per route rather than
   * global. Safe because a browser attaches cookies to a cross-origin form
   * post or image load on its own but never attaches a custom header, and a
   * script that tries triggers a CORS preflight this app does not answer — so
   * a header-authenticated request is one that already holds the secret, and
   * a caller holding the secret can reach the API without a browser anyway.
   * Not free because it gives up a layer of defense in depth, so only routes
   * with a real header-authenticated browser client turn it on. Today that is
   * the radar, which the owner's own extension posts captured roles to from
   * its chrome-extension:// origin.
   */
  allowBearerClients?: boolean;
};

export function isTrustedSameOriginMutation(request: Request, options: MutationTrustOptions = {}) {
  if (options.allowBearerClients && request.headers.get("authorization")?.trim()) return true;
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
