/*
 * Matching a saved application to the résumé and cover letter written for it.
 *
 * These were two records that never spoke. saveApplication() stored no draft
 * id, saveDraftVersion() stored no application id, and the only link was a
 * manual button that appeared solely when draft.company === app.company and
 * draft.role === app.role — exact string equality, so a stray capital or a
 * company field filled a minute later broke it silently. Every application
 * read "Résumé: Not linked", including ones the owner was sure he had linked.
 *
 * Matching is done here, in one place, on normalised values, with the job URL
 * as the strongest signal: a posting URL identifies a role better than two
 * hand-typed fields ever will.
 */

// Tracking parameters differ on every render of the same posting, and a
// trailing slash is noise. Two links to one job must normalise to one key.
const TRACKING = /^(?:utm_[a-z_]*|trk|trkinfo|refid|ref|referrer|src|source|campaign|gh_src|mc_cid|mc_eid|fbclid|gclid|igshid|li_fat_id|eBP|recommended|position|pageNum)$/i;

export function normalizeJobUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${path}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// "Unknown company" and "Untitled role" are placeholders the app writes when a
// field was empty; they must never make two unrelated records look alike.
const PLACEHOLDER = new Set(["unknown company", "untitled role", "no company", "untitled company", ""]);

function nameKey(value) {
  const normalized = normalizeName(value);
  return PLACEHOLDER.has(normalized) ? "" : normalized;
}

/*
 * The company a URL is plainly about, when the field was left empty.
 *
 * Only for the hosts where the path names the employer — an ATS board is
 * organised by company, so greenhouse.io/airbnb/jobs/123 is unambiguous. On a
 * job board like LinkedIn the host is the board, never the employer, so those
 * return nothing rather than filing a role under "Linkedin".
 */
const ATS_HOSTS = /(?:^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|breezy\.hr|jobvite\.com|recruitee\.com|teamtailor\.com)$/i;
const BOARD_HOSTS = /(?:^|\.)(linkedin\.com|indeed\.com|glassdoor\.com|ziprecruiter\.com|google\.com|monster\.com|dice\.com|wellfound\.com|builtin\.com|workatastartup\.com)$/i;

export function companyFromJobUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (BOARD_HOSTS.test(host)) return "";
  const segments = url.pathname.split("/").filter(Boolean);
  const candidate = ATS_HOSTS.test(host)
    // job-boards.greenhouse.io/airbnb/jobs/123 → airbnb
    ? segments.find((segment) => !/^(?:jobs?|careers?|embed|boards|postings?|o|v\d)$/i.test(segment) && !/^\d+$/.test(segment)) || ""
    // careers.airbnb.com → airbnb
    : host.replace(/^(?:jobs|boards|job-boards|careers|apply|talent|work|hire|my)\./, "").split(".")[0] || "";
  const cleaned = candidate.replace(/[-_]+/g, " ").trim();
  if (!cleaned || cleaned.length < 2 || /^\d+$/.test(cleaned)) return "";
  return cleaned.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/*
 * Does this draft belong to this application?
 *
 * Any one of three agreements is enough, strongest first: the same job
 * snapshot, the same posting URL, or the same company and role once
 * normalised. A draft already linked to another application is never claimed.
 */
export function draftMatchesApplication(draft, application) {
  if (!draft || !application) return false;
  if (draft.applicationId && draft.applicationId !== application.id) return false;
  if (draft.id && (draft.id === application.resumeVersionId || draft.id === application.coverVersionId)) return true;
  if (draft.jobSnapshotId && application.jobSnapshotId && draft.jobSnapshotId === application.jobSnapshotId) return true;
  const draftUrl = normalizeJobUrl(draft.url);
  const applicationUrl = normalizeJobUrl(application.url);
  if (draftUrl && applicationUrl && draftUrl === applicationUrl) return true;
  const company = nameKey(draft.company);
  const role = nameKey(draft.role);
  if (!company || !role) return false;
  return company === nameKey(application.company) && role === nameKey(application.role);
}

const newestFirst = (left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""))
  || (right.versionNumber || 0) - (left.versionNumber || 0);

/*
 * The résumé and cover letter an application should show.
 *
 * An explicit link always wins — it is a decision the owner made. Otherwise
 * the newest matching draft of each kind is used, which is why an application
 * saved before its résumé existed still shows that résumé the moment it is
 * written.
 */
export function resolveApplicationDrafts(application, drafts) {
  const all = Array.isArray(drafts) ? drafts : [];
  const pick = (kind, explicitId) => {
    const explicit = explicitId ? all.find((draft) => draft.id === explicitId) : null;
    if (explicit) return { draft: explicit, linked: true };
    const matches = all.filter((draft) => draft.type === kind && draftMatchesApplication(draft, application)).sort(newestFirst);
    return { draft: matches[0] || null, linked: false };
  };
  return { resume: pick("resume", application?.resumeVersionId), cover: pick("cover", application?.coverVersionId) };
}

// The ids to store on an application so the match survives a rename later.
export function draftLinksFor(application, drafts) {
  const resolved = resolveApplicationDrafts(application, drafts);
  const links = {};
  if (!application?.resumeVersionId && resolved.resume.draft) links.resumeVersionId = resolved.resume.draft.id;
  if (!application?.coverVersionId && resolved.cover.draft) links.coverVersionId = resolved.cover.draft.id;
  return links;
}

// The application a freshly saved draft belongs to, if one is already open.
export function applicationForDraft(draft, applications) {
  return (Array.isArray(applications) ? applications : []).find((application) => draftMatchesApplication(draft, application)) || null;
}
