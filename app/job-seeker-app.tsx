"use client";

import { useEffect, useMemo, useState } from "react";

type View = "workspace" | "profile" | "documents" | "voice" | "companies" | "applications" | "autofill";
type Output = "analysis" | "resume" | "cover" | "answers";
type Application = { id: string; company: string; role: string; status: string; date: string };
type SourceCategory = "Résumé" | "Custom GPT export" | "LinkedIn export" | "Writing sample" | "Other evidence";
type SourceDocument = { id: string; title: string; type: string; category?: SourceCategory; importedAt: string; text: string; candidates: string[]; approved: string[]; status: "reading" | "ready" | "needs-text" };
type CompanyTarget = { id: string; name: string; website: string; careers: string; kind: "Brand" | "Agency" | "Sports" | "Tech"; focus: string; market: string; status: "Researching" | "Monitoring" | "Applied" | "Paused"; lastChecked: string; notes: string };
type WritingStyle = { tone: string; prefer: string; avoid: string; samples: string };
type EvidenceMatch = { requirement: string; evidence: { fact: string; source: string; score: number }[]; strength: "Strong" | "Partial" | "Gap" };

type Profile = {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  headline: string;
  summary: string;
  facts: string;
};

const initialProfile: Profile = {
  name: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  headline: "",
  summary: "",
  facts: "",
};

const initialWritingStyle: WritingStyle = {
  tone: "Clear, direct, conversational, calm, and practical.",
  prefer: "Specific examples, short sentences, natural confidence, and plain language.",
  avoid: "Corporate jargon, exaggerated claims, copied job-description language, and generic enthusiasm.",
  samples: "",
};

const stopWords = new Set("the and with for from that this your you are will our into across has have role team work about who their they them all but not job more using use its can how what when where while an a to of in on at by or as is be we it".split(" "));

function keywords(text: string) {
  const counts = new Map<string, number>();
  text.toLowerCase().match(/[a-z][a-z+-]{2,}/g)?.forEach((word) => {
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([word]) => word);
}

function sentences(text: string) {
  return text.split(/\n|(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => item.length > 35);
}

function factCandidates(text: string) {
  const seen = new Set<string>();
  return [...text.split(/\n|(?<=[.!?])\s+/)]
    .map((item) => item.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((item) => item.length >= 35 && item.length <= 260)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
}

function flattenText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenText);
  return [];
}

function overlapScore(left: string, right: string) {
  const leftWords = new Set(keywords(left));
  const rightWords = new Set(keywords(right));
  return [...leftWords].filter((word) => rightWords.has(word)).length;
}

async function extractPdfText(arrayBuffer: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join("\n");
}

async function extractFileText(file: File) {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return extractPdfText(await file.arrayBuffer());
  if (/\.docx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = (await import("mammoth")).default;
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  const rawText = await file.text();
  if (/\.json$/i.test(file.name)) {
    try { return flattenText(JSON.parse(rawText)).join("\n"); } catch { return rawText; }
  }
  return rawText;
}

function dateToday() {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(new Date());
}

function useSavedState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Restore the browser-only workspace after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const saved = localStorage.getItem(key); if (saved) setValue(JSON.parse(saved)); } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => { if (ready) localStorage.setItem(key, JSON.stringify(value)); }, [key, ready, value]);
  return [value, setValue] as const;
}

function copyText(value: string, setNotice: (value: string) => void) {
  navigator.clipboard.writeText(value).then(() => setNotice("Copied to clipboard"));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
}

export function JobSeekerApp() {
  const [view, setView] = useState<View>("workspace");
  const [output, setOutput] = useState<Output>("analysis");
  const [profile, setProfile] = useSavedState("valeta-profile-v2", initialProfile);
  const [writingStyle, setWritingStyle] = useSavedState("valeta-writing-style-v1", initialWritingStyle);
  const [applications, setApplications] = useSavedState<Application[]>("valeta-applications-v2", []);
  const [documents, setDocuments] = useSavedState<SourceDocument[]>("valeta-documents-v1", []);
  const [companies, setCompanies] = useSavedState<CompanyTarget[]>("valeta-companies-v1", []);
  const [jobText, setJobText] = useSavedState("valeta-job-v2", "");
  const [company, setCompany] = useSavedState("valeta-company-v2", "");
  const [role, setRole] = useSavedState("valeta-role-v2", "");
  const [notice, setNotice] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [sourceCategory, setSourceCategory] = useState<SourceCategory>("Résumé");
  const [isDragging, setIsDragging] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyKind, setCompanyKind] = useState<CompanyTarget["kind"]>("Brand");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyCareers, setCompanyCareers] = useState("");
  const [companyFocus, setCompanyFocus] = useState("Creative operations, project management, production");

  const roleKeywords = useMemo(() => keywords(jobText), [jobText]);
  const requirements = useMemo(() => sentences(jobText).slice(0, 7), [jobText]);
  const facts = useMemo(() => profile.facts.split("\n").map((x) => x.trim()).filter(Boolean), [profile.facts]);
  const matchedFacts = useMemo(() => {
    const scored = facts.map((fact) => ({ fact, score: roleKeywords.filter((key) => fact.toLowerCase().includes(key)).length }));
    return scored.sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.fact);
  }, [facts, roleKeywords]);
  const evidenceMap = useMemo<EvidenceMatch[]>(() => requirements.map((requirement) => {
    const evidence = facts
      .map((fact) => ({
        fact,
        score: overlapScore(requirement, fact),
        source: documents.find((document) => document.approved.some((approved) => approved.toLowerCase() === fact.toLowerCase()))?.title || "Career profile",
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    return { requirement, evidence, strength: evidence[0]?.score >= 2 ? "Strong" : evidence.length ? "Partial" : "Gap" };
  }), [documents, facts, requirements]);
  const fit = jobText.trim().length < 80 ? 0 : Math.min(94, 52 + new Set(matchedFacts.flatMap((fact) => roleKeywords.filter((key) => fact.toLowerCase().includes(key)))).size * 6);

  const resume = `${profile.name}\n${profile.headline}\n${profile.location} | ${profile.email} | ${profile.phone} | ${profile.linkedin}\n\nTARGET\n${role || "Target role"}${company ? ` — ${company}` : ""}\n\nSUMMARY\n${profile.summary} For this opportunity, the strongest verified themes are ${roleKeywords.slice(0, 5).join(", ") || "project leadership, creative operations, and delivery"}.\n\nSELECTED RELEVANT EXPERIENCE\n${matchedFacts.map((fact) => `• ${fact}`).join("\n")}\n\nCORE CAPABILITIES\n${roleKeywords.slice(0, 10).join(" • ") || "Add a job description to prioritize capabilities."}\n\nREVIEW REQUIRED\nThis draft reorganizes approved facts only. Confirm wording and add verified outcomes before applying.`;

  const cover = `Dear ${company ? `${company} Hiring Team` : "Hiring Team"},\n\nI’m interested in the ${role || "position"} because it connects closely with the work reflected in my verified experience.\n\n${profile.summary || "Add an approved professional summary in Career profile."}${matchedFacts.length ? ` For this role, the most relevant evidence includes ${matchedFacts.slice(0, 3).join("; ")}.` : " Add approved career facts before using this draft."}\n\nWhat draws me to ${company || "your team"} is the opportunity to contribute with clarity, care, and reliable execution. I would welcome the chance to discuss how my experience could support the team.\n\nThank you for your consideration.\n\nBest,\n${profile.name || "Your name"}\n\nVOICE NOTES USED\nTone: ${writingStyle.tone}\nPrefer: ${writingStyle.prefer}\nAvoid: ${writingStyle.avoid}`;

  const answers = `APPLICATION ANSWER KIT\n\nProfessional headline\n${profile.headline || "Add an approved headline."}\n\nCurrent location\n${profile.location || "Add your location."}\n\nWhy are you interested in this role?\nI’m interested because the role emphasizes ${roleKeywords.slice(0, 3).join(", ") || "the responsibilities in the posting"}, and I can connect those needs to approved evidence in my career profile.\n\nTell us about yourself\n${profile.summary || "Add an approved professional summary before using this answer."}\n\nWhy ${company || "this company"}?\nThe opportunity stands out because of the work described in the posting. Before submitting, add one specific, researched reason for your interest in the company.\n\nCompensation, work authorization, demographic, and legal questions\nREQUIRES USER REVIEW — never infer or autofill these sensitive answers.`;

  const activeText = output === "resume" ? resume : output === "cover" ? cover : output === "answers" ? answers : "";
  const autofillData = JSON.stringify({
    version: 1,
    profile: { fullName: profile.name, email: profile.email, phone: profile.phone, location: profile.location, linkedin: profile.linkedin },
    target: { company, role },
    answers: { headline: profile.headline, summary: profile.summary, interest: `I’m interested in ${role || "this role"} because it combines ${roleKeywords.slice(0, 3).join(", ") || "project leadership, creative operations, and cross-functional delivery"}.` },
    safety: { neverSubmit: true, sensitiveFieldsRequireUser: true },
  }, null, 2);

  function saveApplication() {
    if (!company.trim() && !role.trim()) { setNotice("Add a company or role first"); return; }
    setApplications([{ id: crypto.randomUUID(), company: company || "Unknown company", role: role || "Untitled role", status: "Preparing", date: dateToday() }, ...applications]);
    setNotice("Application added to tracker");
  }

  function download(name: string, content: string, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  }

  function downloadWordDocument(name: string, title: string, content: string) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;max-width:8.5in;margin:.65in auto;color:#111;font-size:11pt;line-height:1.45}h1{font-size:20pt;margin:0 0 6px}pre{white-space:pre-wrap;font:inherit;margin:0}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(content)}</pre></body></html>`;
    download(name, html, "application/msword");
  }

  function printDocument(title: string, content: string) {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) { setNotice("Allow pop-ups to open the print-ready document"); return; }
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{margin:.6in}body{font-family:Arial,sans-serif;color:#111;font-size:11pt;line-height:1.45}h1{font-size:20pt;margin:0 0 6px}pre{white-space:pre-wrap;font:inherit;margin:0}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(content)}</pre><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }

  function importDocument() {
    if (!documentText.trim()) { setNotice("Paste document text before importing"); return; }
    const title = documentTitle.trim() || `Imported document — ${dateToday()}`;
    setDocuments([{ id: crypto.randomUUID(), title, type: "Pasted text", category: sourceCategory, importedAt: dateToday(), text: documentText, candidates: factCandidates(documentText), approved: [], status: "ready" }, ...documents]);
    setDocumentTitle(""); setDocumentText(""); setNotice("Document imported. Review the candidate facts below.");
  }

  async function uploadDocuments(files: File[]) {
    if (!files.length) return;
    const queued = files.map((file) => ({
      file,
      document: { id: crypto.randomUUID(), title: file.name, type: file.type || "Document", category: sourceCategory, importedAt: dateToday(), text: "", candidates: [], approved: [], status: "reading" as const },
    }));
    setDocuments((current) => [...queued.map((item) => item.document), ...current]);
    setNotice(`Reading ${files.length} ${files.length === 1 ? "file" : "files"} on this Mac…`);

    await Promise.all(queued.map(async ({ file, document }) => {
      const isSupported = /^(text\/|application\/(json|csv|pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))/.test(file.type) || /\.(txt|md|csv|json|pdf|docx)$/i.test(file.name);
      if (!isSupported) {
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, status: "needs-text" } : item));
        return;
      }
      try {
        const extractedText = await extractFileText(file);
        const sourceType = /\.json$/i.test(file.name) ? "JSON / GPT export" : /\.pdf$/i.test(file.name) ? "PDF" : /\.docx$/i.test(file.name) ? "Word document" : file.type || "Text document";
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, type: sourceType, text: extractedText, candidates: factCandidates(extractedText), status: "ready" } : item));
      } catch {
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, status: "needs-text" } : item));
      }
    }));
    setNotice("Import finished. Review each candidate before it becomes reusable evidence.");
  }

  function approveCandidate(documentId: string, candidate: string) {
    const alreadyAdded = facts.some((item) => item.toLowerCase() === candidate.toLowerCase());
    if (!alreadyAdded) setProfile({ ...profile, facts: [...facts, candidate].join("\n") });
    setDocuments(documents.map((doc) => doc.id === documentId ? { ...doc, approved: doc.approved.includes(candidate) ? doc.approved : [...doc.approved, candidate] } : doc));
    setNotice(alreadyAdded ? "That fact is already approved" : "Fact approved and added to your profile");
  }

  function addCompany() {
    if (!companyName.trim()) { setNotice("Add a company or agency name first"); return; }
    setCompanies([{ id: crypto.randomUUID(), name: companyName.trim(), website: companyWebsite.trim(), careers: companyCareers.trim(), kind: companyKind, focus: companyFocus.trim(), market: "Bay Area / U.S.", status: "Researching", lastChecked: "Not checked", notes: "" }, ...companies]);
    setCompanyName(""); setCompanyWebsite(""); setCompanyCareers(""); setNotice("Target added to your directory");
  }

  function loadCompanyForRole(target: CompanyTarget) {
    setCompany(target.name); setView("workspace"); setNotice("Company loaded into the role workspace");
  }

  function exportWorkspace() {
    download("valeta-private-workspace.json", JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), profile, writingStyle, documents, companies, applications }, null, 2), "application/json");
  }

  return (
    <main className="app-shell">
      <aside className="nav-panel">
        <button className="wordmark" onClick={() => setView("workspace")}><span>VALETA</span><small>JOB SEEKER</small></button>
        <nav>
          {([['workspace','Role workspace'],['profile','Career profile'],['documents','Documents & evidence'],['voice','Writing voice'],['companies','Companies & agencies'],['applications','Applications'],['autofill','Autofill assistant']] as [View,string][]).map(([id,label]) =>
            <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => setView(id)}>{label}</button>
          )}
        </nav>
        <div className="nav-note"><strong>Private workspace</strong><span>Data saves in this browser on your Mac.</span></div>
      </aside>

      <section className="main-stage">
        <header className="topbar"><div><span className="kicker">PRIVATE CAREER COMMAND CENTER</span><h1>{view === "workspace" ? "Turn a role into an evidence-backed application." : view === "profile" ? "Your verified career profile." : view === "documents" ? "Bring evidence into the fact bank." : view === "voice" ? "Teach every letter how you write." : view === "companies" ? "Build your target list with intent." : view === "applications" ? "Your application pipeline." : "Fill forms without starting over."}</h1></div><div className="status-pill"><i /> Local autosave on</div></header>
        {notice && <button className="notice" onClick={() => setNotice("")}>{notice} ×</button>}

        {view === "workspace" && <div className="workspace-grid">
          <section className="input-card">
            <div className="step"><b>01</b><span>ROLE INTAKE</span></div>
            <div className="field-row"><label>Company<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Apple" /></label><label>Role title<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Brand Project Manager" /></label></div>
            <label>Job description<textarea value={jobText} onChange={(e) => setJobText(e.target.value)} placeholder="Paste the complete job description here. Job-board URLs alone cannot be reliably read, so paste the text for the best result." /></label>
            <div className="input-actions"><button className="primary" onClick={() => setOutput("analysis")}>Analyze role</button><button onClick={saveApplication}>Save to applications</button><button onClick={() => { setJobText(""); setCompany(""); setRole(""); }}>Clear</button></div>
          </section>

          <section className="output-card">
            <div className="output-tabs">{([['analysis','Fit'],['resume','Résumé'],['cover','Cover letter'],['answers','Answers']] as [Output,string][]).map(([id,label]) => <button key={id} className={output === id ? "selected" : ""} onClick={() => setOutput(id)}>{label}</button>)}</div>
            {output === "analysis" ? <div className="analysis-view">
              <div className="fit-score"><strong>{fit ? `${fit}%` : "—"}</strong><span>{fit ? "Evidence match" : "Paste a role"}</span></div>
              <div><h2>Hiring signals</h2><div className="chips">{roleKeywords.length ? roleKeywords.map((key) => <span key={key}>{key}</span>) : <p>Keywords and requirements will appear here.</p>}</div></div>
              <div><h2>Likely requirements</h2><ul>{requirements.length ? requirements.map((r) => <li key={r}>{r}</li>) : <li>Paste the complete posting to extract requirements.</li>}</ul></div>
              <div className="evidence-map"><div className="evidence-head"><h2>Requirement → evidence map</h2><span>{evidenceMap.filter((item) => item.strength !== "Gap").length}/{evidenceMap.length || 0} supported</span></div>{evidenceMap.length ? evidenceMap.map((item) => <article key={item.requirement}><div><span className={`strength ${item.strength.toLowerCase()}`}>{item.strength}</span><p>{item.requirement}</p></div>{item.evidence.length ? <ul>{item.evidence.map((match) => <li key={match.fact}><strong>{match.fact}</strong><small>Source: {match.source}</small></li>)}</ul> : <p className="gap-copy">No approved evidence found. Ask for clarification or leave this claim out.</p>}</article>) : <p className="gap-copy">Paste a complete posting to map its requirements to approved facts.</p>}</div>
              <div className="truth-check"><strong>Truth check</strong><p>The score measures text overlap, not your chance of being hired. Claims are limited to your saved fact bank; unknown metrics and experience must be reviewed by you.</p><ul><li>{matchedFacts.length} approved facts are currently relevant to this role.</li><li>{roleKeywords.length ? "Review each extracted keyword before adding it to a résumé." : "Paste a complete role description to produce a better check."}</li><li>Final application decisions and all sensitive answers remain yours.</li></ul></div>
            </div> : <div className="document-view"><div className="document-actions"><span>Generated from approved facts</span><button onClick={() => copyText(activeText, setNotice)}>Copy</button><button onClick={() => download(`tailored-${output}.txt`, activeText)}>Text</button><button onClick={() => downloadWordDocument(`tailored-${output}.doc`, `${profile.name || "Candidate"} — ${output === "resume" ? "Tailored Resume" : output === "cover" ? "Cover Letter" : "Application Answers"}`, activeText)}>Word</button><button className="primary" onClick={() => printDocument(`${profile.name || "Candidate"} — ${output === "resume" ? "Tailored Resume" : output === "cover" ? "Cover Letter" : "Application Answers"}`, activeText)}>Save as PDF</button></div><pre>{activeText}</pre></div>}
          </section>
        </div>}

        {view === "profile" && <section className="profile-workspace"><div className="section-head"><div className="step"><b>PROFILE</b><span>VERIFIED SOURCE OF TRUTH</span></div><p>Edit this once. Every résumé, letter, answer, and autofill package uses these fields.</p></div><div className="profile-form"><label>Full name<input value={profile.name} onChange={(e) => setProfile({...profile,name:e.target.value})} /></label><label>Professional headline<input value={profile.headline} onChange={(e) => setProfile({...profile,headline:e.target.value})} /></label><label>Email<input value={profile.email} onChange={(e) => setProfile({...profile,email:e.target.value})} /></label><label>Phone<input value={profile.phone} onChange={(e) => setProfile({...profile,phone:e.target.value})} /></label><label>Location<input value={profile.location} onChange={(e) => setProfile({...profile,location:e.target.value})} /></label><label>LinkedIn<input value={profile.linkedin} onChange={(e) => setProfile({...profile,linkedin:e.target.value})} /></label><label className="wide">Base summary<textarea value={profile.summary} onChange={(e) => setProfile({...profile,summary:e.target.value})} /></label><label className="wide">Verified career facts — one per line<textarea className="facts-area" value={profile.facts} onChange={(e) => setProfile({...profile,facts:e.target.value})} /></label></div><div className="profile-footer"><span>{facts.length} approved facts available</span><div><button onClick={() => download("valeta-career-profile.json", JSON.stringify(profile,null,2), "application/json")}>Export profile</button><button className="primary" onClick={exportWorkspace}>Back up private workspace</button></div></div></section>}

        {view === "voice" && <section className="profile-workspace voice-workspace"><div className="section-head"><div className="step"><b>VOICE</b><span>COVER LETTER STYLE BANK</span></div><p>Paste writing that sounds like you. These notes guide letters and application answers without changing verified facts.</p></div><div className="profile-form"><label className="wide">Tone<textarea value={writingStyle.tone} onChange={(event) => setWritingStyle({...writingStyle,tone:event.target.value})} /></label><label>Prefer<textarea value={writingStyle.prefer} onChange={(event) => setWritingStyle({...writingStyle,prefer:event.target.value})} /></label><label>Avoid<textarea value={writingStyle.avoid} onChange={(event) => setWritingStyle({...writingStyle,avoid:event.target.value})} /></label><label className="wide">Approved writing samples<textarea className="voice-samples" value={writingStyle.samples} onChange={(event) => setWritingStyle({...writingStyle,samples:event.target.value})} placeholder="Paste emails, introductions, cover letters, or messages that genuinely sound like you." /></label></div><div className="profile-footer"><span>Voice changes style only—never career facts.</span><button onClick={() => { setView("workspace"); setOutput("cover"); }}>Preview cover-letter voice</button></div></section>}

        {view === "documents" && <section className="documents-workspace"><div className="document-import"><div className="step"><b>02</b><span>UPLOAD SOURCE MATERIAL</span></div><h2>Add the documents that tell your real story.</h2><p>Choose what the source is, then upload one file or a whole group. The app reads them locally and turns their content into facts for your approval.</p><label className="source-type">Source type<select value={sourceCategory} onChange={(event) => setSourceCategory(event.target.value as SourceCategory)}><option>Résumé</option><option>Custom GPT export</option><option>LinkedIn export</option><option>Writing sample</option><option>Other evidence</option></select></label><label className={isDragging ? "upload-zone dragging" : "upload-zone"} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }} onDrop={(event) => { event.preventDefault(); setIsDragging(false); uploadDocuments(Array.from(event.dataTransfer.files)); }}><input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json" onChange={(event) => { uploadDocuments(Array.from(event.target.files || [])); event.currentTarget.value = ""; }} /><span className="upload-icon">↑</span><strong>Drop files here</strong><span>or click to browse your Mac</span><small>PDF · Word .docx · TXT · Markdown · CSV · JSON / GPT export</small></label><div className="privacy-strip"><strong>Private by default</strong><span>Files are processed and saved in this browser. They are not uploaded to GitHub.</span></div><details className="paste-fallback"><summary>Paste text instead</summary><div><label>Document name<input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="e.g. Resume — January 2026" /></label><label>Document text<textarea value={documentText} onChange={(event) => setDocumentText(event.target.value)} placeholder="Paste résumé, custom GPT content, LinkedIn export, writing sample, or other source text." /></label><button className="primary" onClick={importDocument}>Import pasted text</button></div></details><p className="gpt-note"><strong>Custom GPT:</strong> export or copy its content, then upload JSON/text here. This app cannot automatically read hidden knowledge inside another GPT.</p></div><div className="fact-review"><div className="review-heading"><div><span>UPLOADS & FACT REVIEW</span><h2>{documents.length} imported sources</h2></div><strong>{facts.length} approved facts</strong></div>{documents.length === 0 ? <div className="empty-state compact"><strong>Your source library is empty.</strong><span>Upload your current résumé first, then add GPT or LinkedIn exports and writing samples.</span></div> : <div className="source-list">{documents.map((doc) => <article key={doc.id} className={`source-card ${doc.status}`}><header><div><span className="source-category">{doc.category || "Imported source"}</span><strong>{doc.title}</strong><span>{doc.type} · {doc.importedAt}</span></div><div className="source-controls"><span className={`source-status ${doc.status}`}>{doc.status === "reading" ? "Reading…" : doc.status === "ready" ? "Ready for review" : "Needs text"}</span><button onClick={() => setDocuments(documents.filter((item) => item.id !== doc.id))}>Remove</button></div></header>{doc.status === "reading" ? <p className="needs-text">Reading this file on your Mac…</p> : doc.status === "needs-text" ? <p className="needs-text">This file could not be read. Save it as PDF, Word .docx, text, or JSON, or open it and paste its text on the left.</p> : <div className="candidate-list">{doc.candidates.length ? doc.candidates.map((candidate) => <div key={candidate}><p>{candidate}</p><button className={doc.approved.includes(candidate) ? "approved" : ""} onClick={() => approveCandidate(doc.id,candidate)}>{doc.approved.includes(candidate) ? "Approved" : "Approve"}</button></div>) : <p className="needs-text">No useful fact candidates were found. You can add facts directly in Career profile.</p>}</div>}</article>)}</div>}</div></section>}

        {view === "companies" && <section className="companies-workspace"><div className="target-form"><div className="step"><b>03</b><span>ADD A TARGET</span></div><h2>Companies, brands, and agencies — in one list.</h2><p>Keep only targets you want to follow. Career links and notes are optional, so this works even before you have every detail.</p><label>Company or agency name<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="e.g. Agency, brand, or sports organization" /></label><div className="field-row"><label>Type<select value={companyKind} onChange={(event) => setCompanyKind(event.target.value as CompanyTarget["kind"])}><option>Brand</option><option>Agency</option><option>Sports</option><option>Tech</option></select></label><label>Focus<input value={companyFocus} onChange={(event) => setCompanyFocus(event.target.value)} /></label></div><label>Website<input value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} placeholder="https://" /></label><label>Careers page<input value={companyCareers} onChange={(event) => setCompanyCareers(event.target.value)} placeholder="https://" /></label><button className="primary" onClick={addCompany}>Add to directory</button></div><div className="target-directory"><div className="review-heading"><div><span>TARGET DIRECTORY</span><h2>{companies.length} saved targets</h2></div><strong>Bay Area first</strong></div>{companies.length === 0 ? <div className="empty-state compact"><strong>Your target list starts here.</strong><span>Add brands, agencies, sports organizations, or tech teams. Nothing is marked as an open role until you verify it.</span></div> : <div className="company-list">{companies.map((target) => <article key={target.id}><div className="company-title"><span>{target.kind}</span><strong>{target.name}</strong><small>{target.market} · {target.focus || "No focus set"}</small></div><div className="company-links">{target.website && <a href={target.website} target="_blank" rel="noreferrer">Website</a>}{target.careers && <a href={target.careers} target="_blank" rel="noreferrer">Careers</a>}<button onClick={() => loadCompanyForRole(target)}>Use for role</button></div><div className="company-actions"><label>Status<select value={target.status} onChange={(event) => setCompanies(companies.map((item) => item.id === target.id ? { ...item, status: event.target.value as CompanyTarget["status"] } : item))}><option>Researching</option><option>Monitoring</option><option>Applied</option><option>Paused</option></select></label><label>Notes<input value={target.notes} onChange={(event) => setCompanies(companies.map((item) => item.id === target.id ? { ...item, notes: event.target.value } : item))} placeholder="Contact, role, or next step" /></label><button onClick={() => setCompanies(companies.filter((item) => item.id !== target.id))}>Remove</button></div></article>)}</div>}</div></section>}

        {view === "applications" && <section className="table-card"><div className="table-head"><div><span>PIPELINE</span><h2>{applications.length} saved applications</h2></div><button onClick={() => download("valeta-applications.json", JSON.stringify(applications,null,2), "application/json")}>Export</button></div>{applications.length === 0 ? <div className="empty-state"><strong>No applications saved yet.</strong><span>Prepare a role in the workspace, then choose “Save to applications.”</span><button className="primary" onClick={() => setView("workspace")}>Prepare first role</button></div> : <div className="application-list">{applications.map((app) => <article key={app.id}><div><strong>{app.role}</strong><span>{app.company} · {app.date}</span></div><select value={app.status} onChange={(e) => setApplications(applications.map((item) => item.id === app.id ? {...item,status:e.target.value}:item))}><option>Preparing</option><option>Applied</option><option>Interview</option><option>Closed</option></select><button onClick={() => setApplications(applications.filter((item) => item.id !== app.id))}>Remove</button></article>)}</div>}</section>}

        {view === "autofill" && <section className="autofill-grid"><div className="autofill-intro"><div className="step"><b>04</b><span>ASSISTED AUTOFILL</span></div><h2>Your data, ready for application forms.</h2><p>The browser companion scans visible fields, previews what it can map, and fills only approved profile answers after your click. Sensitive questions, dropdowns, uploads, and unknown fields remain for your review.</p><div className="safety-list"><span>✓ Preview mapped fields before filling</span><span>✓ Never presses Submit</span><span>✓ Never guesses legal or demographic answers</span><span>✓ Works from your approved profile</span></div></div><div className="autofill-package"><span>AUTOFILL PACKAGE</span><pre>{autofillData}</pre><div><button className="primary" onClick={() => copyText(autofillData,setNotice)}>Copy package</button><button onClick={() => download("valeta-autofill-profile.json",autofillData,"application/json")}>Download JSON</button></div><small>Load this package into the Chrome companion in the GitHub project. On an application page, choose Scan page, review the field map, then choose Fill ready fields.</small></div></section>}
      </section>
    </main>
  );
}
