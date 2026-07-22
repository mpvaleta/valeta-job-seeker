import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { extractLinkedInArchive } from "../lib/linkedin-archive.mjs";

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
