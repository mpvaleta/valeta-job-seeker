import assert from "node:assert/strict";
import test from "node:test";
import {
  extractJobPostings,
  extractPublicPage,
  extractYouTubeCaptionTracks,
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

test("LinkedIn pages are rejected instead of being scraped", async () => {
  await assert.rejects(() => readPublicLink("https://www.linkedin.com/jobs/view/123", { fetchImpl: async () => new Response("should not run") }), /does not permit/i);
});
