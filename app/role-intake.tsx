"use client";

import { useMemo, useState } from "react";

type Mode = "analysis" | "resume" | "cover";
type Tone = "direct" | "balanced" | "story";

const approvedFacts = [
  "verified role history",
  "approved project evidence",
  "documented leadership examples",
  "role-relevant operations experience",
  "cross-functional delivery evidence",
];

const toneLabels: Record<Tone, string> = {
  direct: "Direct",
  balanced: "Balanced",
  story: "Story-led",
};

const roleLenses = {
  sports: {
    label: "Sports / brand-production lens",
    fit: 84,
    priorities: [
      "live brand energy",
      "production discipline",
      "partner and stakeholder coordination",
    ],
    keywords: ["sports marketing", "producer", "campaign delivery", "events"],
  },
  agency: {
    label: "Agency delivery lens",
    fit: 82,
    priorities: [
      "client clarity",
      "scope and timeline management",
      "integrated production across teams",
    ],
    keywords: ["integrated production", "agency", "client services", "workflow"],
  },
  tech: {
    label: "Tech brand-program lens",
    fit: 88,
    priorities: [
      "program structure",
      "brand systems",
      "cross-functional planning",
    ],
    keywords: ["program management", "brand studio", "operations", "launch"],
  },
  premium: {
    label: "Premium brand-ops lens",
    fit: 86,
    priorities: [
      "creative standards",
      "high-trust coordination",
      "detail-oriented delivery",
    ],
    keywords: ["brand management", "creative operations", "project management"],
  },
  general: {
    label: "General creative-operations lens",
    fit: 78,
    priorities: [
      "role clarity",
      "evidence-backed positioning",
      "resume and cover-letter customization",
    ],
    keywords: ["creative operations", "stakeholder management", "delivery"],
  },
};

function inferLens(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("sports") || normalized.includes("red bull")) {
    return roleLenses.sports;
  }
  if (normalized.includes("agency") || normalized.includes("producer")) {
    return roleLenses.agency;
  }
  if (normalized.includes("google") || normalized.includes("program")) {
    return roleLenses.tech;
  }
  if (normalized.includes("apple") || normalized.includes("brand")) {
    return roleLenses.premium;
  }
  return roleLenses.general;
}

function inferCompany(value: string) {
  const companyMatches = ["Apple", "Google", "Red Bull", "Goodby Silverstein", "Meta", "Adobe"];
  const found = companyMatches.find((company) =>
    value.toLowerCase().includes(company.toLowerCase()),
  );
  return found ?? "the company";
}

function buildModeContent(value: string, mode: Mode, tone: Tone) {
  const lens = inferLens(value);
  const company = inferCompany(value);
  const hasInput = value.trim().length > 12;
  const factLine = `Reusable evidence: ${approvedFacts.join(", ")}.`;

  if (mode === "analysis") {
    return {
      eyebrow: "Role analysis",
      title: `${lens.fit}% fit · ${lens.label}`,
      body: [
        `Likely hiring priorities: ${lens.priorities.join(", ")}.`,
        `Recommended positioning: use the candidate’s approved headline and the strongest verified evidence for this posting.`,
        hasInput
          ? `Before applying, confirm anything the posting requires that is not yet verified: tools, team size, budget ownership, exact seniority, and submission rules.`
          : "Paste a full posting to extract sharper responsibilities, ATS terms, and risk flags.",
        factLine,
      ],
    };
  }

  if (mode === "resume") {
    return {
      eyebrow: "Resume direction",
      title: "Prioritize proof before keywords",
      body: [
        `Lead the summary with creative operations, global programs, and stakeholder leadership for ${company}.`,
        `Move the strongest approved proof near the top when the role mentions ${lens.keywords.slice(0, 3).join(", ")}.`,
        `Use ATS language only when it matches verified facts: ${lens.keywords.join(", ")}.`,
        "Do not invent metrics, tools, budgets, titles, or outcomes. Unknown claims stay in the review queue.",
      ],
    };
  }

  const opener =
    tone === "direct"
      ? `I’m interested in this role because it matches the work I do best: bringing structure, clarity, and creative momentum to brand work that has many teams moving at once.`
      : tone === "story"
        ? `The through-line in my work has been helping ambitious creative ideas become organized, cross-functional delivery — from global brand environments to agency-side production rhythms.`
        : `I’m drawn to this role because it sits exactly where I’ve done my best work: turning creative ambition into organized, cross-functional delivery.`;

  return {
    eyebrow: "Cover letter voice",
      title: `${toneLabels[tone]} evidence-backed draft`,
    body: [
      `${opener} Replace this sentence with approved career evidence from the private fact bank before using the draft.`,
      `For ${company}, I’d connect the company’s creative standard to your ability to make teams, timelines, and partners move together.`,
      "Voice guardrails: human, confident, specific, no corporate filler, no exaggerated claims, and no facts that are not approved in the fact bank.",
    ],
  };
}

export function RoleIntake() {
  const [roleSource, setRoleSource] = useState("");
  const [mode, setMode] = useState<Mode>("analysis");
  const [tone, setTone] = useState<Tone>("balanced");
  const active = useMemo(
    () => buildModeContent(roleSource, mode, tone),
    [mode, roleSource, tone],
  );
  const lens = useMemo(() => inferLens(roleSource), [roleSource]);

  return (
    <section className="role-intake" aria-label="Role intake and draft preview">
      <label className="intake-field">
        <span>Role link or pasted posting</span>
        <input
          name="role-source"
          onChange={(event) => setRoleSource(event.target.value)}
          placeholder="Paste a job link, company target, or full posting"
          value={roleSource}
        />
      </label>

      <div className="action-strip" aria-label="Role actions">
        <button
          type="button"
          className={mode === "analysis" ? "secondary-action selected" : "secondary-action"}
          onClick={() => setMode("analysis")}
        >
          Analyze role
        </button>
        <button
          type="button"
          className={mode === "resume" ? "primary-action selected" : "primary-action"}
          onClick={() => setMode("resume")}
        >
          Tailor resume
        </button>
        <button
          type="button"
          className={mode === "cover" ? "secondary-action selected" : "secondary-action"}
          onClick={() => setMode("cover")}
        >
          Draft cover letter
        </button>
      </div>

      <div className="tone-strip" aria-label="Cover letter tone controls">
        {(Object.keys(toneLabels) as Tone[]).map((item) => (
          <button
            className={tone === item ? "tone-chip selected" : "tone-chip"}
            key={item}
            onClick={() => setTone(item)}
            type="button"
          >
            {toneLabels[item]}
          </button>
        ))}
      </div>

      <article className="draft-preview" aria-live="polite">
        <div>
          <p>{active.eyebrow}</p>
          <h4>{active.title}</h4>
          <span>{lens.label}</span>
        </div>
        <ul>
          {active.body.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>

      <div className="guardrail-strip" aria-label="Draft guardrails">
        <span>Review-first</span>
        <span>Verified facts only</span>
        <span>No LinkedIn scraping</span>
      </div>
    </section>
  );
}
