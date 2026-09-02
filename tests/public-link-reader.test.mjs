import assert from "node:assert/strict";
import test from "node:test";
import {
  extractJobPostings,
  extractPublicPage,
  extractYouTubeCaptionTracks,
  extractYouTubeDescription,
  extractYouTubeVideoId,
  isLinkedInUrl,
  parseYouTubeTranscript,
  readPublicLink,
  validatePublicUrl,
} from "../lib/public-link-reader.mjs";

test("public link validation blocks local networks, credentials, and unsafe ports", () => {
  assert.throws(() => validatePublicUrl("http://localhost/private"), /private or local/i);
  assert.throws(() => validatePublicUrl("https://user:pass@example.com"), /usernames or passwords/i);
  assert.throws(() => validatePublicUrl("https://example.com:8080/jobs"), /standard public web ports/i);
  assert.equal(validatePublicUrl("https://example.com/jobs#apply").href, "https://example.com/jobs");
  assert.equal(isLinkedInUrl("https://www.linkedin.com/jobs/view/123"), true);
});

test("YouTube URLs and exposed captions are parsed without private access", () => {
  assert.equal(extractYouTubeVideoId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  const tracks = extractYouTubeCaptionTracks('<script>var x={"captionTracks":[{"baseUrl":"https://video.example/captions","languageCode":"en"}]};</script>');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].languageCode, "en");
  assert.equal(parseYouTubeTranscript(JSON.stringify({ events: [{ segs: [{ utf8: "Write clearly." }, { utf8: " Use evidence." }] }] })), "Write clearly. Use evidence.");
});

test("article extraction keeps readable text, provenance links, and JobPosting data", () => {
  const html = `<!doctype html><html><head><title>Senior Brand Producer</title><meta name="description" content="A public role"></head><body><main><h1>Senior Brand Producer</h1><p>Lead integrated production and creative operations across partner teams.</p><a href="/jobs/brand-producer">Apply to Senior Brand Producer</a></main><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Senior Brand Producer",
    description: "<p>Lead integrated production and creative operations.</p>",
    hiringOrganization: { name: "Example Studio" },
    jobLocation: { address: { addressLocality: "San Francisco", addressRegion: "CA" } },
    url: "https://example.com/jobs/brand-producer",
  })}</script></body></html>`;
  const jobs = extractJobPostings(html, "https://example.com/careers");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "Example Studio");
  assert.match(jobs[0].location, /San Francisco/);
  const page = extractPublicPage(html, "https://example.com/careers");
  assert.equal(page.title, "Senior Brand Producer");
  assert.match(page.text, /integrated production/i);
  assert.equal(page.links[0].href, "https://example.com/jobs/brand-producer");
});

test("public article and YouTube transcript reads are bounded and deterministic", async () => {
  const articleHtml = "<!doctype html><title>Resume Rules</title><main><h1>Resume Rules</h1><p>Use concise accomplishment bullets backed by evidence and tailored to the role.</p><p>Never invent metrics or experience that the candidate cannot verify.</p></main>";
  const article = await readPublicLink("https://career.example/resume-rules", {
    fetchImpl: async () => new Response(articleHtml, { headers: { "content-type": "text/html" } }),
  });
  assert.equal(article.sourceType, "article");
  assert.match(article.text, /Never invent metrics/i);

  const watchHtml = '<!doctype html><title>Better Resume Bullets - YouTube</title><meta name="description" content="Resume lesson"><main>Public video page with captions.</main><script>window.player={"captionTracks":[{"baseUrl":"https://captions.example/transcript","languageCode":"en","name":{"simpleText":"English"}}]};</script>';
  const calls = [];
  const video = await readPublicLink("https://youtu.be/abcdefghijk", {
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("youtube.com/watch")) return new Response(watchHtml, { headers: { "content-type": "text/html" } });
      return Response.json({ events: [{ segs: [{ utf8: "Start each bullet with a strong verb." }] }, { segs: [{ utf8: " Show the outcome with verified evidence." }] }] });
    },
  });
  assert.equal(video.sourceType, "youtube-transcript");
  assert.match(video.text, /verified evidence/i);
  assert.equal(calls.length, 2);
});

/*
 * YouTube stopped handing transcripts to servers.
 *
 * Measured September 2026 on five videos, creator captions and automatic
 * alike: the timedtext endpoint answers HTTP 200 with an empty body, with a
 * browser User-Agent, with a Referer, and through the innertube player API,
 * which answers UNPLAYABLE. The watch page still advertises the caption
 * tracks, so the old reader found tracks, fetched nothing, and failed with
 * "no readable transcript could be extracted" — which blamed the parser for
 * a door YouTube had closed.
 */
test("a video whose captions come back empty is imported as its description", async () => {
  const watchHtml = '<!doctype html><title>Creative Operations, explained - YouTube</title><meta name="description" content="short"><script>window.player={"captionTracks":[{"baseUrl":"https://captions.example/transcript","languageCode":"en"}],"shortDescription":"A walk through how creative operations teams run intake, resourcing and delivery, with the rituals that keep a studio predictable week to week. Covers the intake form, the weekly resourcing pass, the delivery review, and what to do when a client changes the brief late. Chapters and links below."};</script>';
  const source = await readPublicLink("https://youtu.be/abcdefghijk", {
    fetchImpl: async (url) => String(url).includes("youtube.com/watch")
      ? new Response(watchHtml, { headers: { "content-type": "text/html" } })
      // What YouTube actually returns: 200, and nothing in it.
      : new Response("", { headers: { "content-type": "application/json" } }),
  });
  assert.equal(source.sourceType, "youtube-description", "an empty transcript must not fail the whole import");
  assert.match(source.text, /intake, resourcing and delivery/);
  assert.equal(source.metadata.captions, "unavailable");
  assert.equal(source.title, "Creative Operations, explained");
});

test("a video with no transcript and no description says what actually happened", async () => {
  const watchHtml = '<!doctype html><title>Clip - YouTube</title><script>window.player={"captionTracks":[{"baseUrl":"https://captions.example/transcript","languageCode":"en"}],"shortDescription":"Too short."};</script>';
  await assert.rejects(
    () => readPublicLink("https://youtu.be/abcdefghijk", {
      fetchImpl: async (url) => String(url).includes("youtube.com/watch")
        ? new Response(watchHtml, { headers: { "content-type": "text/html" } })
        : new Response("", { headers: { "content-type": "application/json" } }),
    }),
    /no longer hands video transcripts to apps.*Show transcript/is,
  );
});

// A watch page is 1.2-1.7 MB of player JSON. The ordinary article ceiling of
// 1.5 MB rejected the longer ones for size, before any of the above could run.
test("a watch page larger than the article ceiling is still read", async () => {
  const filler = "x".repeat(1_600_000);
  const watchHtml = `<!doctype html><title>Long - YouTube</title><script>window.filler="${filler}";window.player={"shortDescription":"${"A detailed description of the talk. ".repeat(10)}"};</script>`;
  const source = await readPublicLink("https://youtu.be/abcdefghijk", {
    fetchImpl: async () => new Response(watchHtml, { headers: { "content-type": "text/html" } }),
  });
  assert.equal(source.sourceType, "youtube-description");
  assert.match(source.text, /A detailed description of the talk/);
});

test("the full description is read from the player payload, not the truncated meta tag", () => {
  assert.equal(extractYouTubeDescription('{"shortDescription":"Line one.\\nLine two \\u2014 with an em dash."}'), "Line one.\nLine two — with an em dash.");
  assert.equal(extractYouTubeDescription("<html>no player payload</html>"), "");
});

test("LinkedIn pages are rejected instead of being scraped", async () => {
  await assert.rejects(() => readPublicLink("https://www.linkedin.com/jobs/view/123", { fetchImpl: async () => new Response("should not run") }), /does not permit/i);
});

// A bot-verification interstitial (Cloudflare, PerimeterX, DataDome,
// reCAPTCHA/hCaptcha) returns a normal HTTP 200 with a full HTML page -- it
// would otherwise sail past the login/access-required (401/403) check and
// often past the not-enough-text check too, silently becoming the imported
// "job description" or "article" with no error at all.
test("a Cloudflare-style browser-check page is rejected by title rather than imported as real content", async () => {
  const challengeHtml = `<!doctype html><html><head><title>Just a moment...</title></head><body><div class="cf-browser-verification cf-im-under-attack">Checking your browser before accessing example.com. This process is automatic. Your browser will redirect to your requested content shortly.</div><script>window._cf_chl_opt = {};</script></body></html>`;
  await assert.rejects(
    () => readPublicLink("https://careers.example.com/senior-producer", { fetchImpl: async () => new Response(challengeHtml, { headers: { "content-type": "text/html" } }) }),
    /bot-verification challenge/i,
  );
});

test("a PerimeterX-style challenge page is rejected by its captcha markup", async () => {
  const html = `<!doctype html><html><head><title>Access to this page has been denied</title></head><body><div id="px-captcha"></div><p>Please verify you are a human to continue to careers.example.com.</p></body></html>`;
  await assert.rejects(
    () => readPublicLink("https://careers.example.com/senior-producer", { fetchImpl: async () => new Response(html, { headers: { "content-type": "text/html" } }) }),
    /bot-verification challenge/i,
  );
});

test("a bare reCAPTCHA embed is detected even with an unrelated page title", async () => {
  const html = `<!doctype html><html><head><title>example.com</title></head><body><div class="g-recaptcha" data-sitekey="abc"></div><script src="https://www.google.com/recaptcha/api.js"></script><p>Verifying you are not a robot before we show this page.</p></body></html>`;
  await assert.rejects(
    () => readPublicLink("https://careers.example.com/senior-producer", { fetchImpl: async () => new Response(html, { headers: { "content-type": "text/html" } }) }),
    /bot-verification challenge/i,
  );
});

// A real job posting that happens to use verification-adjacent language in
// its own copy (asking applicants to verify eligibility, mentioning captcha
// only as a topic) must never be misclassified as a challenge page --
// detection keys on vendor titles/markup, not on words like "verify".
test("a real job posting mentioning verification language in its own text is not misclassified as a bot challenge", async () => {
  const html = `<!doctype html><title>Senior Producer</title><main><h1>Senior Producer</h1><p>Lead integrated production across partner teams. Please verify you are legally authorized to work in the country of employment before applying.</p><p>Our security team will verify your identity as part of the standard background check human resources runs for every hire.</p></main>`;
  const result = await readPublicLink("https://careers.example.com/senior-producer", { fetchImpl: async () => new Response(html, { headers: { "content-type": "text/html" } }) });
  assert.equal(result.sourceType, "article");
  assert.match(result.text, /Senior Producer/);
});
