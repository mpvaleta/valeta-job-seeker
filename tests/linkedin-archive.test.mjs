import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { extractLinkedInArchive, extractLinkedInSavedJobs } from "../lib/linkedin-archive.mjs";

test("official LinkedIn ZIP exports keep evidence, saved jobs, AI context, and voice separate", async () => {
  const zip = new JSZip();
  zip.file("Positions.csv", "Company Name,Title,Description\nExample,Project Manager,Led cross-functional delivery");
  zip.file("Recommendations_Received.csv", "First Name,Text\nAlex,Marcos brings clarity to complex projects");
  zip.file("Saved Jobs.csv", "Saved Date,Job Title,Company Name,Job Posting Url\n2026-07-18,Brand PM,Example,https://linkedin.com/jobs/view/1");
  zip.file("AI-powered conversations.csv", "Prompt,Response\nImprove profile,Add more project leadership detail");
  zip.file("Comments.csv", "Date,Comment\n2026-07-18,Clear plans help teams make better decisions.");
  zip.file("Connections.csv", "First Name,Email\nPrivate,private@example.com");
  const groups = await extractLinkedInArchive(await zip.generateAsync({ type: "arraybuffer" }), { JSZip });
  assert.equal(groups.length, 3);
  assert.match(groups.find((group) => group.scope === "evidence").text, /cross-functional delivery/);
  assert.match(groups.find((group) => group.scope === "research").text, /Brand PM/);
  assert.match(groups.find((group) => group.scope === "voice").text, /Clear plans/);
  assert.ok(groups.every((group) => !group.text.includes("private@example.com")));
});

test("saved jobs are recovered from the official export for the radar", async () => {
  const zip = new JSZip();
  zip.file("Positions.csv", "Company Name,Title,Description\nExample,Project Manager,Led cross-functional delivery");
  zip.file("Saved Jobs.csv", [
    "Saved Date,Job Title,Company Name,Job Posting Url",
    '2026-07-18,"Producer, Brand Studio",Northwind Agency,https://www.linkedin.com/jobs/view/111',
    "2026-07-19,Creative Operations Manager,Meta,https://www.linkedin.com/jobs/view/222",
    "2026-07-19,Creative Operations Manager,Meta,https://www.linkedin.com/jobs/view/222",
    "2026-07-20,Missing Link Role,Acme,",
  ].join("\n"));
  const groups = await extractLinkedInArchive(await zip.generateAsync({ type: "arraybuffer" }), { JSZip });
  const research = groups.find((group) => group.scope === "research");
  const saved = extractLinkedInSavedJobs(research.text);

  assert.equal(saved.length, 2, `expected two unique saved jobs, got ${JSON.stringify(saved)}`);
  // A quoted title containing a comma must survive intact.
  assert.equal(saved[0].title, "Producer, Brand Studio");
  assert.equal(saved[0].company, "Northwind Agency");
  assert.equal(saved[0].url, "https://www.linkedin.com/jobs/view/111");
  assert.equal(saved[0].savedAt, "2026-07-18");
  // The duplicate row collapses and the row with no URL is skipped.
  assert.equal(saved[1].title, "Creative Operations Manager");
  assert.ok(!saved.some((job) => job.title === "Missing Link Role"));
});

test("an export with no saved jobs yields nothing rather than guessing", () => {
  assert.deepEqual(extractLinkedInSavedJobs(""), []);
  assert.deepEqual(extractLinkedInSavedJobs("--- Comments.csv ---\nDate,Comment\n2026-07-18,Nice work"), []);
});
