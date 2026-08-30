import { isLinkedInUrl, readPublicLink, validatePublicUrl } from "./public-link-reader.mjs";

export const DEFAULT_RADAR_PROFILE = {
  titles: ["Creative Operations", "Project Manager", "Producer", "Brand Program Manager"],
  skills: ["creative operations", "integrated production", "project management", "brand", "agency", "cross-functional"],
  // "California" and "United States" used to sit alongside the Bay Area here,
  // which made the location signal meaningless: every role anywhere in the
  // country matched one of the three. The radar targets one market by default.
  locations: ["San Francisco Bay Area"],
  workModes: ["Hybrid", "On-site", "Remote"],
  goals: "Brand, advertising, marketing, sports, agency, and creative-production roles with meaningful ownership and cross-functional delivery.",
  exclusions: [],
  minScore: 45,
  companyStagePreference: "no_preference",
  locationPolicy: "required",
};

// "preferred" is the old behaviour: matching the target market adds points and
// missing it costs nothing. "required" makes the market a hard gate, the same
// severity class as an exclusion term — a role outside it can never pass, no
// matter how well the title and skills line up.
const LOCATION_POLICIES = new Set(["preferred", "required"]);

// "no_preference" leaves scoring exactly as it was before this field existed
// (the default, so every profile saved before this shipped keeps behaving the
// same way). "prefer_startups" is a soft boost; "startups_only" is a hard
// filter, same severity class as an exclusion term.
const COMPANY_STAGE_PREFERENCES = new Set(["no_preference", "prefer_startups", "startups_only"]);

export const RADAR_TRACKS = [
  { id: "brand-project", label: "Brand & Creative PM" },
  { id: "operations", label: "Operations" },
  { id: "production", label: "Production" },
  { id: "creative", label: "Creative" },
  { id: "sports", label: "Sports" },
  { id: "general-project", label: "General PM" },
];

export const RADAR_COMPANY_CATEGORIES = [
  "Startup / Early-stage",
  "Technology",
  "Sports / Entertainment",
  "Marketing Agency",
  "Creative / Advertising Agency",
  "Production Company",
  "Brand / Consumer",
  "Media",
  "Retail / Hospitality",
  "Nonprofit / Education",
  "Other",
];

// Stage language a company uses about itself. Deliberately specific: "growth"
// or "scaling" alone describe plenty of large companies, so they are paired with
// a stage word rather than matched on their own.
const STARTUP_SIGNAL = /\b(?:startup|start-up|early[- ]stage|pre[- ]seed|seed[- ]stage|series [a-d]\b|yc[- ]?(?:backed|w\d{2}|s\d{2})|y combinator|techstars|founding (?:team|engineer|marketer|designer)|first (?:marketing|design|ops) hire|venture[- ]backed|vc[- ]backed|angel[- ]backed|stealth mode|fewer than \d{1,2} employees|\d{1,2}[- ]person team)\b/i;

const COMMON_CAREER_PATHS = ["/careers", "/jobs", "/opportunities", "/join-us", "/work-with-us"];
// "imported" and "linkedin-saved" are trusted because the user chose the exact
// role themselves — by handing V's a job-details link, or by exporting their own
// saved jobs from LinkedIn. Neither came from crawling a page of links.
const TRUSTED_JOB_SOURCES = new Set(["apple", "ashby", "google-careers", "greenhouse", "icims", "imported", "lever", "linkedin-saved", "meta-job", "public-job-page", "smartrecruiters", "structured-job-page", "teamwork-online", "v-watch", "workday"]);
const NAVIGATION_TITLE = /^(?:apply|benefits|blog|browse|careers?|culture|departments?|details?|discover|diversity(?: (?:&|and) inclusion)?|early careers?|events?|explore|faq|find|hiring process|internships?|job search|jobs?|join us|learn|life at|locations?|meet the team|mission|news|open roles?|openings?|opportunities|our (?:culture|mission|story|teams?|values)|people|perks|read more|search|search jobs?|search roles?|stories|students?(?: (?:&|and) grads)?|talent community|teams?|university(?: recruiting)?|values|view|view all|why [\w &-]+|work(?:ing)? (?:at|with).*)$/i;
const NAVIGATION_PHRASE = /\b(?:benefits (?:&|and) perks|browse (?:all )?(?:jobs|roles)|career opportunities|employee stories|explore (?:jobs|opportunities|roles)|find (?:a |your )?(?:job|role)|hiring process|how we hire|job search|learn about working|learn more|life at|meet (?:our|the) team|our (?:culture|mission|story|values)|search (?:all )?(?:jobs|openings|positions|roles)|talent community|view (?:all )?(?:jobs|openings|positions|roles)|why (?:join|work)|working at)\b/i;
const ROLE_TITLE_SIGNAL = /\b(?:account(?:ant)?|administrator|analyst|architect|art director|assistant|associate|attorney|buyer|consultant|controller|coordinator|copywriter|counsel|designer|developer|director|editor|engineer|executive|head of [\w ]+|intern|lead|manager|marketer|nurse|officer|photographer|planner|principal [\w]+|producer|professor|recruiter|researcher|scientist|scrum master|specialist|strategist|supervisor|teacher|technician|therapist|videographer|vice president|vp|writer)\b|\b(?:sr|jr|senior|junior|staff)\.? [a-z]|,? (?:i{1,3}|iv|v)$/i;
const JOB_DETAIL_PATH = /(?:\/(?:careers?|jobs?|opportunities)\/(?:[^/?#]+\/)?(?:[a-z]*\d[\w-]*|[\w-]{8,})|\/jobs\/view\/[\w-]{6,}|\/viewjob(?:\/|[?#])|\/positions?\/[\w-]{6,}|\/openings?\/[\w-]{6,}|\/postings?\/[\w-]{6,}|\/details\/\d|\/profile\/job_details\/\d|[?&](?:gh_jid|jk|jobid|job_id|positionid|requisitionid|rid)=)/i;

const STOP_WORDS = new Set([
  "and", "are", "for", "from", "into", "job", "manager", "role", "the", "this", "that", "with", "you", "your",
  "our", "who", "will", "work", "team", "position", "opportunity", "candidate", "responsibilities", "required",
]);

// Bay Area detection is deliberately explicit. The previous version accepted
// "california" and a bare "ca", so San Diego, Los Angeles, and Sacramento were
// all reported as Bay Area matches. Place names that exist only here are
// matched on their own; names that also belong to a city somewhere else
// (Newark NJ, Richmond VA, Fremont NE, Concord NH, Dublin IE) additionally
// require a California marker in the same string.
const BAY_AREA_DISTINCT = /\b(?:san francisco|bay area|silicon valley|east bay|oakland|san jose|palo alto|mountain view|menlo park|cupertino|sunnyvale|santa clara|berkeley|emeryville|san mateo|redwood city|foster city|burlingame|millbrae|san bruno|south san francisco|daly city|walnut creek|san ramon|livermore|milpitas|los gatos|saratoga|san rafael|novato|sausalito|mill valley|half moon bay|petaluma|santa rosa|napa|alameda|hayward|san leandro|castro valley|san carlos|los altos|morgan hill|gilroy|marin county|sonoma county|contra costa|alameda county|santa clara county|san mateo county|sfo)\b/;
const BAY_AREA_AMBIGUOUS = /\b(?:newark|richmond|fremont|concord|vallejo|antioch|fairfield|danville|brentwood|pleasant hill|martinez|pittsburg|benicia|dublin|campbell|union city|belmont|pleasanton|lafayette|orinda|moraga|hercules|pinole|albany)\b/;
const CALIFORNIA_MARKER = /\b(?:ca|calif|california)\b/;

// A posting is only treated as United States when it says so, or names a state.
// The old test was `\b[a-z .]+, [a-z]{2}\b`, which reads "Toronto, ON" and
// "London, UK" as American just as happily as "Austin, TX".
const US_STATE_CODE = /,\s*(?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc|pr)\b/;
const US_STATE_NAME = /\b(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia|puerto rico)\b/;
const US_COUNTRY_NAME = /\b(?:united states|u\.s\.a?\.?|usa)\b/;

// Two-letter state codes collide with country codes ("Bengaluru, IN" is not
// Indiana; "Munich, DE" is not Delaware), so an explicit foreign marker wins
// over any state-code guess and also disqualifies an otherwise-open remote role.
const NON_US_MARKER = /\b(?:emea|apac|latam|europe|european union|united kingdom|england|scotland|wales|ireland|canada|ontario|quebec|british columbia|toronto|vancouver|montreal|mexico|brazil|brasil|s(?:ã|a)o paulo|argentina|colombia|chile|peru|india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|china|shanghai|beijing|hong kong|taiwan|japan|tokyo|korea|seoul|singapore|australia|sydney|melbourne|new zealand|philippines|manila|vietnam|thailand|indonesia|malaysia|germany|deutschland|berlin|munich|france|paris|spain|madrid|barcelona|portugal|lisbon|italy|rome|milan|netherlands|amsterdam|belgium|brussels|poland|warsaw|krakow|romania|bucharest|czech|prague|hungary|budapest|sweden|stockholm|norway|oslo|denmark|copenhagen|finland|helsinki|switzerland|zurich|geneva|austria|vienna|israel|tel aviv|dubai|uae|saudi|egypt|nigeria|kenya|south africa|turkey|istanbul|ukraine|russia|moscow)\b/;

export function isBayAreaLocation(value) {
  const location = clean(value, 400).toLowerCase();
  if (!location) return false;
  if (NON_US_MARKER.test(location)) return false;
  if (BAY_AREA_DISTINCT.test(location)) return true;
  return BAY_AREA_AMBIGUOUS.test(location) && CALIFORNIA_MARKER.test(location);
}

export function isUnitedStatesLocation(value) {
  const location = clean(value, 400).toLowerCase();
  if (!location) return false;
  if (NON_US_MARKER.test(location)) return false;
  return US_COUNTRY_NAME.test(location) || US_STATE_CODE.test(location) || US_STATE_NAME.test(location);
}

export function normalizeRadarProfile(value = {}) {
  return {
    titles: cleanList(value.titles ?? DEFAULT_RADAR_PROFILE.titles, 30, 120),
    skills: cleanList(value.skills ?? DEFAULT_RADAR_PROFILE.skills, 60, 120),
    locations: cleanList(value.locations ?? DEFAULT_RADAR_PROFILE.locations, 20, 120),
    workModes: cleanList(value.workModes ?? DEFAULT_RADAR_PROFILE.workModes, 8, 40),
    goals: clean(value.goals ?? DEFAULT_RADAR_PROFILE.goals, 2_000),
    exclusions: cleanList(value.exclusions ?? DEFAULT_RADAR_PROFILE.exclusions, 30, 120),
    minScore: boundedNumber(value.minScore, 0, 100, DEFAULT_RADAR_PROFILE.minScore),
    companyStagePreference: COMPANY_STAGE_PREFERENCES.has(value.companyStagePreference) ? value.companyStagePreference : DEFAULT_RADAR_PROFILE.companyStagePreference,
    locationPolicy: LOCATION_POLICIES.has(value.locationPolicy) ? value.locationPolicy : DEFAULT_RADAR_PROFILE.locationPolicy,
  };
}

// Words that carry no targeting signal on their own. Accomplishment bullets are
// built out of them, so without this list every derived skill set would come
// back as "led", "managed", "across", "team".
const SKILL_NOISE = new Set([
  "led", "lead", "manage", "managed", "managing", "built", "build", "created", "create", "delivered", "deliver",
  "launched", "launch", "improved", "improve", "increased", "increase", "reduced", "reduce", "coordinated",
  "coordinate", "developed", "develop", "directed", "direct", "produced", "owned", "own", "ran", "run", "drove",
  "drive", "grew", "grow", "cut", "set", "made", "make", "help", "helped", "support", "supported", "worked",
  "across", "through", "between", "during", "within", "including", "using", "while", "after", "before", "each",
  "every", "other", "more", "most", "than", "then", "also", "their", "them", "they", "its", "was", "were", "has",
  "have", "had", "been", "being", "new", "first", "second", "third", "full", "end", "per", "own", "key", "all",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "year", "years", "month",
  "months", "week", "weeks", "day", "days", "time", "times", "people", "company", "companies", "business",
  "industry", "global", "national", "annual", "quarterly", "multiple", "several", "various", "including",
  "present", "current", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november",
  "december",
]);

/*
 * Build a radar profile out of the user's own career evidence.
 *
 * The radar's targeting and the résumé's approved facts lived in two systems
 * that never spoke: the radar shipped with a generic hardcoded profile, so it
 * searched for a plausible-sounding career rather than this one. Everything
 * here is derived by counting, never generated -- a title is only proposed if
 * it is written in the evidence, and a skill only if it recurs across it.
 *
 * The result is a SUGGESTION. The caller shows it for review; nothing is saved
 * until the user accepts it, because these are claims about their own history.
 */
export function deriveRadarProfileFromCareer(input = {}) {
  const facts = (Array.isArray(input.facts) ? input.facts : []).map((fact) => clean(fact, 900)).filter(Boolean);
  const headline = clean(input.headline, 200);
  const summary = clean(input.summary, 2_000);
  const homeLocation = clean(input.location, 200);

  const titles = [];
  const addTitle = (value) => {
    const title = clean(value, 120).replace(/[.;:]+$/, "").trim();
    if (title.length < 4 || title.length > 70) return;
    if (title.split(/\s+/).length > 6) return;
    if (!ROLE_TITLE_SIGNAL.test(title)) return;
    if (titles.some((existing) => existing.toLowerCase() === title.toLowerCase())) return;
    titles.push(title);
  };
  addTitle(headline);
  // Résumé evidence keeps job headers as their own lines: "Senior Project
  // Manager, Acme Studios — Jan 2019 to Present". Everything before the first
  // separator is the role; accomplishment bullets fail the checks above.
  for (const fact of facts) addTitle(fact.split(/\s*(?:—|–|\||·|@)\s*|,\s+|\s+at\s+/)[0]);

  const phraseCounts = new Map();
  const wordCounts = new Map();
  for (const fact of facts) {
    const words = (fact.toLowerCase().match(/[a-z][a-z+#.'’-]*/g) || [])
      .map((word) => word.replace(/^[.'’-]+|[.'’-]+$/g, ""))
      .filter(Boolean);
    const significant = words.map((word) => (word.length >= 3 && !STOP_WORDS.has(word) && !SKILL_NOISE.has(word) ? word : ""));
    for (let index = 0; index < words.length - 1; index += 1) {
      if (!significant[index] || !significant[index + 1]) continue;
      const phrase = `${significant[index]} ${significant[index + 1]}`;
      phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
    }
    for (const word of new Set(significant.filter(Boolean))) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }
  const rank = (counts, minimum) => [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value]) => value);
  const phrases = rank(phraseCounts, 2).slice(0, 8);
  const covered = new Set(phrases.flatMap((phrase) => phrase.split(" ")));
  const singles = rank(wordCounts, 3).filter((word) => !covered.has(word)).slice(0, 6);
  const skills = [...phrases, ...singles];

  return {
    titles: titles.slice(0, 8),
    skills,
    goals: summary || headline,
    locations: isBayAreaLocation(homeLocation) ? ["San Francisco Bay Area"] : homeLocation ? [homeLocation] : [],
    evidence: {
      factsRead: facts.length,
      titlesFromHeadline: headline && titles.some((title) => title.toLowerCase() === headline.toLowerCase()) ? 1 : 0,
      recurringPhrases: phrases.length,
      recurringWords: singles.length,
    },
  };
}

// Learning from what the user rejects.
//
// A dismissal carries a reason, and only one of them teaches. "Already applied
// or already seen" says nothing about fit — the user liked the role enough to
// act on it — so it is deliberately inert here. "Not relevant to me" is the
// only signal, and it is read conservatively:
//
//   - Nothing is learned until several such dismissals exist. One rejection is
//     a mood; a pattern needs repetition.
//   - A word must recur across separate dismissed roles to count. A single odd
//     posting must not teach the radar anything.
//   - A word the user's own targets or skills contain is never learned, even
//     if it recurs. Dismissing three project roles must not teach the radar to
//     down-rank "project" while "Project Manager" is still a saved target —
//     learning may never contradict what the user explicitly asked for.
//
// The result is bounded and explainable: a capped penalty, plus the words that
// caused it, so the inbox can say why a role sank instead of silently hiding it.
const DISMISSAL_MIN_SAMPLE = 4;
const DISMISSAL_MIN_REPEATS = 2;
const DISMISSAL_MAX_PENALTY = 22;

export function deriveDismissalSignal(dismissals, profileValue) {
  const profile = normalizeRadarProfile(profileValue);
  const rows = Array.isArray(dismissals) ? dismissals : [];
  const teaching = rows.filter((row) => row && row.reason === "not_relevant");

  // Words the user explicitly wants are permanently off-limits as penalties.
  const protectedWords = new Set([
    ...tokens(profile.titles.join(" ")),
    ...tokens(profile.skills.join(" ")),
  ]);

  const wordCounts = new Map();
  const categoryCounts = new Map();
  for (const row of teaching) {
    const title = clean(row.title, 300).toLowerCase();
    // Count each word once per role, so one long title cannot outvote the rest.
    for (const word of new Set(tokens(title))) {
      if (word.length < 4 || protectedWords.has(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    const category = clean(row.companyCategory, 120);
    if (category) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  const byCount = (counts, minimum) => [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value]) => value);

  const stats = {
    dismissalsRead: rows.length,
    teachingDismissals: teaching.length,
    protectedWords: protectedWords.size,
  };

  if (teaching.length < DISMISSAL_MIN_SAMPLE) {
    return {
      ready: false,
      words: [],
      categories: [],
      reason: `V's learns from roles you mark "not relevant" once there are at least ${DISMISSAL_MIN_SAMPLE}. So far: ${teaching.length}.`,
      stats,
    };
  }

  const words = byCount(wordCounts, DISMISSAL_MIN_REPEATS).slice(0, 12);
  // Only a category the user has rejected more often than not is worth
  // penalising; a couple of rejections inside a category they mostly keep is
  // ordinary noise.
  const categories = byCount(categoryCounts, Math.max(DISMISSAL_MIN_REPEATS, Math.ceil(teaching.length / 2))).slice(0, 4);

  return {
    ready: words.length > 0 || categories.length > 0,
    words,
    categories,
    reason: words.length || categories.length
      ? `Learned from ${teaching.length} roles you marked "not relevant".`
      : `Nothing recurred often enough across ${teaching.length} dismissed roles to learn from yet.`,
    stats,
  };
}

// Separated from the derivation so scoring stays a pure function of
// (opportunity, profile, signal) and the penalty is testable on its own.
export function dismissalPenalty(titleLower, companyCategory, signal) {
  if (!signal || !signal.ready) return { penalty: 0, matched: [] };
  const matched = (signal.words || []).filter((word) => titleLower.includes(word));
  const categoryHit = Boolean(companyCategory) && (signal.categories || []).includes(companyCategory);
  if (!matched.length && !categoryHit) return { penalty: 0, matched: [] };
  const penalty = Math.min(DISMISSAL_MAX_PENALTY, matched.length * 7 + (categoryHit ? 8 : 0));
  return { penalty, matched, categoryHit };
}

// What a job title is actually about.
//
// Scoring used to read the title as one signal among several, and the job
// description carried as much weight as the title did. Because a description
// runs to tens of thousands of characters and the skill matcher accepted a
// term whose words merely appeared *somewhere* in it, every posting at a
// company whose careers boilerplate says "creative", "project" and "brand"
// matched every saved skill. A Warehouse Associate and a Nurse Practitioner
// scored the same 64% as a Creative Operations Manager, and both passed.
//
// The fix is to make the title the spine of the match: a role has to be the
// same kind of work before anything in its description can count for it.
//
// Rank words say how senior a job is, not what it is. Two titles sharing only
// "Senior" or "Director" are unrelated, so these never establish a match.
const TITLE_RANK_WORDS = new Set([
  "senior", "sr", "junior", "jr", "staff", "lead", "principal", "head", "chief", "deputy", "vice",
  "president", "vp", "svp", "evp", "associate", "assistant", "executive", "officer", "manager",
  "director", "coordinator", "specialist", "generalist", "partner", "consultant", "intern",
  "global", "regional", "national", "international", "corporate", "enterprise", "group", "team",
  "full", "part", "time", "contract", "temporary", "permanent", "freelance", "remote", "hybrid",
  "onsite", "level", "grade", "and", "the", "for", "with", "of", "to", "in", "at",
  "i", "ii", "iii", "iv", "v", "one", "two", "three",
]);

// Discipline groups collapse spelling variants onto a single id, so "Producer",
// "Production" and "Producing" read as one line of work. They also keep jobs
// apart that a naive prefix rule would merge: "product" and "producer" share
// six letters and are entirely different careers — the single most common false
// match in this domain — so each sits in its own group and the two never meet.
const DISCIPLINE_GROUPS = [
  { id: "production", test: /^produc(?:e|er|ers|ing|tion|tions)$/ },
  { id: "product", test: /^products?$/ },
  { id: "operations", test: /^(?:operations?|operational|ops)$/ },
  { id: "project", test: /^projects?$/ },
  { id: "program", test: /^programs?(?:me|mes)?$/ },
  { id: "marketing", test: /^market(?:ing|s)?$/ },
  { id: "brand", test: /^brand(?:s|ing)?$/ },
  { id: "creative", test: /^creatives?$/ },
  { id: "content", test: /^contents?$/ },
  { id: "campaign", test: /^campaigns?$/ },
  { id: "communications", test: /^commu?n(?:ication|ications|s)$/ },
  { id: "event", test: /^(?:events?|experiential)$/ },
  { id: "studio", test: /^studios?$/ },
  { id: "account", test: /^accounts?$/ },
  { id: "delivery", test: /^deliver(?:y|ies)$/ },
  { id: "engineering", test: /^engineer(?:s|ing)?$/ },
  { id: "software", test: /^software$/ },
  { id: "data", test: /^data$/ },
  { id: "design", test: /^design(?:s|er|ers)?$/ },
  { id: "sales", test: /^sales?$/ },
  { id: "finance", test: /^financ(?:e|ial)$/ },
  { id: "legal", test: /^legal|^counsel$/ },
  { id: "nursing", test: /^nurs(?:e|es|ing)$/ },
];

// A word that survives as "discipline" is anything in the title that is not a
// rank word and not too short to mean something.
function disciplineWords(value) {
  const words = String(value || "").toLowerCase().match(/[a-z][a-z+#'’-]*/g) || [];
  const kept = [];
  for (const raw of words) {
    const word = raw.replace(/^[-'’]+|[-'’]+$/g, "");
    if (word.length < 3 || TITLE_RANK_WORDS.has(word)) continue;
    const group = DISCIPLINE_GROUPS.find((entry) => entry.test.test(word));
    const canonical = group ? group.id : word;
    if (!kept.includes(canonical)) kept.push(canonical);
  }
  return kept;
}

const GROUPED_DISCIPLINES = new Set(DISCIPLINE_GROUPS.map((entry) => entry.id));

// Two discipline words are the same work if they are the same canonical group,
// or — for words no group covers — if they share a five-letter prefix, which
// catches ordinary morphology ("logistics"/"logistical") without a dictionary.
// Grouped words never fall through to the prefix rule; that is what keeps
// "product" and "production" apart.
function sameDiscipline(left, right) {
  if (left === right) return true;
  if (GROUPED_DISCIPLINES.has(left) || GROUPED_DISCIPLINES.has(right)) return false;
  const shortest = Math.min(left.length, right.length);
  if (shortest < 5) return false;
  return left.slice(0, 5) === right.slice(0, 5);
}

// How close a posting's title is to the roles the user actually saved.
//
//   "exact"  — a saved target title is present in the posting title.
//   "family" — the posting shares the line of work but not the exact title
//              ("Integrated Production Lead" against a saved "Producer").
//   "none"   — nothing in common. These are the postings that used to flood
//              the inbox, and they can no longer pass at any score.
export function titleRelevance(titleValue, targetTitles, targetSkills = []) {
  const titleLower = clean(titleValue, 300).toLowerCase();
  const targets = Array.isArray(targetTitles) ? targetTitles : [];
  const skills = Array.isArray(targetSkills) ? targetSkills : [];
  if (!titleLower) return { tier: "none", matched: [] };
  if (!targets.length && !skills.length) return { tier: "family", matched: [] };

  const exact = targets.filter((target) => titleMatches(titleLower, target));
  if (exact.length) return { tier: "exact", matched: exact };

  const wanted = [...new Set(targets.flatMap((target) => disciplineWords(target)))];
  const found = disciplineWords(titleLower);
  const shared = found.filter((word) => wanted.some((target) => sameDiscipline(word, target)));
  if (shared.length) return { tier: "family", matched: shared };

  // A saved skill named in the title is its own evidence of relevance: the gate
  // is only ever as good as the titles the user thought to write down, and
  // "Brand Programs Manager" is plainly on target for someone whose skills say
  // "brand programs" even if no saved title happens to use those words.
  // Only multi-word skills qualify. A one-word skill like "agency" or "brand"
  // appears in titles that have nothing to do with the work — "Agency Nurse",
  // "Brand Ambassador" — and single words are exactly what the discipline check
  // above already covers properly.
  const namedSkills = skills.filter((skill) => clean(skill, 200).trim().split(/[\s-]+/).length > 1 && skillPresent(titleLower, skill));
  if (namedSkills.length) return { tier: "family", matched: namedSkills };

  return { tier: "none", matched: [] };
}

// Skills are matched as phrases, not as loose bags of words.
//
// phraseMatches() falls back to "every token appears somewhere in the
// haystack", which is reasonable for an exclusion term (a false positive there
// only asks the user to look twice) and disastrous for a skill measured against
// a whole job description, where every common word appears eventually.
function skillPresent(haystack, skill) {
  const normalized = clean(skill, 200).toLowerCase();
  if (!normalized) return false;
  const pattern = escapeRegExp(normalized).replace(/\\?[\s\-–—]+/g, "[\\s\\-–—]+");
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`, "i").test(haystack);
}

export function scoreRadarOpportunity(opportunity, profileValue, dismissalSignal) {
  const profile = normalizeRadarProfile(profileValue);
  const title = clean(opportunity?.title, 300);
  const description = clean(opportunity?.description, 80_000);
  const location = clean(opportunity?.location, 400);
  const haystack = `${title} ${description} ${location}`.toLowerCase();
  const titleLower = title.toLowerCase();
  const reasons = [];
  let score = 8;

  // The title decides whether this is even the right kind of job. Everything
  // below can only add to a role that already looks right.
  const relevance = titleRelevance(title, profile.titles, profile.skills);
  if (relevance.tier === "exact") {
    score += 42;
    reasons.push(`target title: ${relevance.matched.slice(0, 2).join(", ")}`);
  } else if (relevance.tier === "family" && relevance.matched.length) {
    score += Math.min(26, 10 + relevance.matched.length * 8);
    reasons.push(`same line of work: ${relevance.matched.slice(0, 4).join(", ")}`);
  }

  // A skill in the title is evidence about the job. The same skill buried in a
  // description is evidence about the company, so it counts for a fraction and
  // is capped hard: careers-page boilerplate must never add up to a match on
  // its own, which is exactly how it used to work.
  const titleField = `${titleLower} ${location.toLowerCase()}`;
  const descriptionField = description.toLowerCase().slice(0, 12_000);
  const skillsInTitle = profile.skills.filter((skill) => skillPresent(titleField, skill));
  const skillsInDescription = profile.skills.filter((skill) => !skillsInTitle.includes(skill) && skillPresent(descriptionField, skill));
  if (skillsInTitle.length) {
    score += Math.min(18, skillsInTitle.length * 9);
    reasons.push(`skill in title: ${skillsInTitle.slice(0, 3).join(", ")}`);
  }
  if (skillsInDescription.length) {
    score += Math.min(10, skillsInDescription.length * 2);
    reasons.push(`skill in posting: ${skillsInDescription.slice(0, 4).join(", ")}`);
  }

  // Free-text goals are the weakest evidence in the profile: they are prose,
  // not a target list. Capped low, and matched on whole words so "brand" is not
  // earned by the word "branding" turning up in a benefits paragraph.
  const goalMatches = tokens(profile.goals).filter((token) => skillPresent(haystack, token));
  if (goalMatches.length) {
    score += Math.min(6, goalMatches.length * 2);
    reasons.push(`goal overlap: ${goalMatches.slice(0, 4).join(", ")}`);
  }

  const locationLower = location.toLowerCase();
  const remoteRole = /\b(remote|distributed|anywhere)\b/i.test(location) || /\bremote\b/i.test(title);
  const remoteAccepted = profile.workModes.some((mode) => mode.toLowerCase() === "remote");
  // A remote role only substitutes for the target market when it is not scoped
  // to somewhere else — "Remote · EMEA" is not a Bay Area job.
  const remoteEligible = remoteRole && remoteAccepted && !NON_US_MARKER.test(locationLower);
  const locationMatches = profile.locations.filter((target) => locationMatch(locationLower, target));
  if (!profile.locations.length) score += 8;
  else if (locationMatches.length) {
    score += 14;
    reasons.push(`location: ${locationMatches.slice(0, 2).join(", ")}`);
  } else if (remoteEligible) {
    score += 12;
    reasons.push("remote option");
  }

  // The hard market gate. Location used to influence the score and nothing
  // else, so a perfect title-and-skills match in San Diego or Tokyo passed the
  // radar as readily as one in Oakland.
  // A posting that names no location at all is unknown, not wrong, and the two
  // were being treated the same. Company career pages routinely omit the field,
  // so the market gate was quietly rejecting a large share of everything the
  // monitored-company scans read — which is why those targets looked as though
  // they never found anything. An unknown location now earns no points and
  // blocks nothing; only a location that is known and outside the market does.
  const locationMismatch = profile.locationPolicy === "required"
    && profile.locations.length > 0
    && Boolean(location)
    && !locationMatches.length
    && !remoteEligible;
  if (locationMismatch) {
    score = Math.min(score - 30, 24);
    reasons.push(`outside the target market (${location.slice(0, 60)}) — location filter`);
  } else if (!location && profile.locations.length) {
    reasons.push("location not listed — market unconfirmed");
  }

  // The role gate. A posting whose title has nothing in common with any saved
  // target is not a candidate at any score. This is what stops a warehouse,
  // nursing or backend-engineering role from riding a company’s
  // creative-sounding boilerplate into the inbox. Like the location gate it
  // caps rather than zeroes, so the number still reads as "well below
  // threshold" rather than a meaningless 0, and so a learned dismissal penalty
  // applied below can still separate two gated roles.
  const offTarget = relevance.tier === "none";
  if (offTarget) {
    score = Math.min(score, 24);
    reasons.push(`not one of your target roles — role filter`);
  }

  // opportunity.companyCategory is a caller-supplied field (from
  // classifyRadarOpportunity), not derived from opportunity text here — this
  // function only scores, it never re-classifies the company itself.
  const companyCategory = clean(opportunity?.companyCategory, 120);
  const isStartup = companyCategory === "Startup / Early-stage";
  let stageMismatch = false;
  if (profile.companyStagePreference === "prefer_startups") {
    if (isStartup) {
      score += 10;
      reasons.push("startup / early-stage company");
    }
  } else if (profile.companyStagePreference === "startups_only" && !isStartup) {
    stageMismatch = true;
    score = Math.min(score - 40, 20);
    reasons.push(companyCategory ? `not early-stage (${companyCategory}) — startups-only filter` : "company stage not yet known — startups-only filter applied");
  }

  const exclusions = profile.exclusions.filter((term) => phraseMatches(haystack, term));
  if (exclusions.length) {
    score = Math.min(score - 35, 24);
    reasons.push(`review exclusion: ${exclusions.slice(0, 3).join(", ")}`);
  }

  // What the user has repeatedly marked "not relevant". This lowers a score;
  // it never caps it the way the hard gates above do, so a role that is
  // otherwise an excellent match can still surface despite a learned word.
  // Learning nudges the ranking — it does not get a veto.
  const learned = dismissalPenalty(titleLower, companyCategory, dismissalSignal);
  if (learned.penalty) {
    score -= learned.penalty;
    reasons.push(learned.matched.length
      ? `similar to roles you dismissed: ${learned.matched.slice(0, 3).join(", ")}`
      : "company type you usually dismiss");
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    reasons,
    summary: reasons.length ? `${bounded}% target alignment · ${reasons.join(" · ")}` : `${bounded}% target alignment · limited overlap with the saved radar goals`,
    // Every hard gate is reported alongside the verdict so a caller can tell a
    // near miss (worth keeping, the owner may want to lower the bar) from a
    // gated role (worth never storing at all).
    gated: Boolean(exclusions.length) || stageMismatch || offTarget || locationMismatch,
    passes: bounded >= profile.minScore && !exclusions.length && !stageMismatch && !locationMismatch && !offTarget,
  };
}

export function detectCareerSource(value) {
  const url = validatePublicUrl(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const firstPath = url.pathname.split("/").filter(Boolean)[0] || "";
  if (host === "jobs.apple.com") return { type: "apple", token: "", url };
  if ((host === "google.com" || host === "careers.google.com") && /\/about\/careers\/applications\/jobs\/?/i.test(url.pathname)) {
    return { type: "google-careers", token: "", url };
  }
  if (host === "metacareers.com" && /^\/jobsearch\/?$/i.test(url.pathname)) return { type: "meta-search", token: "", url };
  if (host === "metacareers.com" && /^\/profile\/job_details\//i.test(url.pathname)) return { type: "meta-job", token: "", url };
  if ((host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") && firstPath) return { type: "greenhouse", token: firstPath, url };
  if (host === "jobs.lever.co" && firstPath) return { type: "lever", token: firstPath, url };
  if (host === "jobs.ashbyhq.com" && firstPath) return { type: "ashby", token: firstPath, url };
  if ((host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") && firstPath) return { type: "smartrecruiters", token: firstPath, url };
  if (/\.wd\d*\.myworkdayjobs\.com$/.test(host) || /\.myworkdayjobs\.com$/.test(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const locale = /^[a-z]{2}-[A-Z]{2}$/.test(segments[0] || "") ? segments.shift() : "";
    const site = segments[0] || "";
    const tenant = host.split(".")[0] || "";
    if (tenant && site) return { type: "workday", token: [tenant, site, locale].join("|"), url };
  }
  // Neither iCIMS nor TeamWork Online exposes a documented public API or
  // JobPosting JSON-LD (checked directly: iCIMS's real API is OAuth-gated to
  // its own customers; both a real iCIMS customer instance and several
  // TeamWork Online listing and job-detail pages were fetched and carried no
  // structured data). Detected here only so the "paste one link" import path
  // labels these correctly and can recover a company name from the URL, the
  // same treatment already given to Meta and to Wellfound/Work at a Startup.
  if (/\.icims\.com$/.test(host)) return { type: "icims", token: host.split(".")[0] || "", url };
  if (host === "teamworkonline.com") return { type: "teamwork-online", token: url.pathname, url };
  return { type: "public-page", token: "", url };
}

// Best-effort employer name from the URL alone, for sources with no
// structured data to read it from. Approximate by nature -- imperfect
// capitalization is a much smaller problem than reporting the job BOARD
// (Wellfound, TeamWork Online) as the employer, which a bare hostname guess
// would otherwise produce.
function companyFromSourceUrl(source) {
  if (source.type === "icims") {
    // Tenant subdomains look like "careers-petsuppliesplus" or "petsuppliesplus".
    const label = source.token.replace(/^careers[-.]?/i, "").replace(/^jobs[-.]?/i, "");
    return label ? titleCaseSlug(label) : "";
  }
  if (source.type === "teamwork-online") {
    // /football-jobs/chiefs/kansas-city-chiefs-29577/role-slug-123456 -- the
    // third segment is the fuller team name; the second is a short alias
    // ("chiefs") used only as a fallback when the fuller one is missing.
    const segments = String(source.token || "").split("/").filter(Boolean);
    const teamSegment = segments[2] || segments[1] || segments[0] || "";
    return teamSegment ? titleCaseSlug(teamSegment.replace(/-\d+$/, "")) : "";
  }
  return "";
}

function titleCaseSlug(value) {
  return value.replace(/[-_]+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Job-board hosts that exist specifically to list startups. A posting found
// there is strong, direct evidence of company stage — almost always stronger
// than STARTUP_SIGNAL, since most job listings never mention their own
// funding round or headcount in the text. Wellfound is startup job search;
// Work at a Startup is literally Y Combinator's board; Built In leans
// tech/startup but also lists larger employers, so it is deliberately left
// off this list rather than overclaimed.
const STARTUP_BOARD_HOSTS = new Set(["wellfound.com", "angel.co", "workatastartup.com"]);

function sourceIsStartupBoard(sourceUrl) {
  try {
    return STARTUP_BOARD_HOSTS.has(new URL(clean(sourceUrl, 4_000)).hostname.toLowerCase().replace(/^www\./, ""));
  } catch {
    return false;
  }
}

export function classifyRadarOpportunity(opportunity = {}, target = {}) {
  const title = clean(opportunity?.title, 300);
  const company = clean(opportunity?.company || target?.company || target?.name, 240);
  const description = clean(opportunity?.description || opportunity?.fitSummary, 6_000);
  const focus = clean(target?.focus, 1_000);
  const combined = `${title} ${company} ${description} ${focus}`.toLowerCase();
  let trackId = "general-project";
  if (/\b(sports?|athletic|athlete|league|football|basketball|baseball|soccer|nfl|nba|mlb|nhl|fan engagement|sponsorship)\b/.test(combined)) trackId = "sports";
  else if (/\b(producer|production|experiential|live event|event production|studio production|photo shoot|video production)\b/.test(combined)) trackId = "production";
  else if (/\b(creative operations?|creative ops|marketing operations?|program operations?|business operations?|resource management|capacity planning|workflow|process improvement)\b/.test(combined)) trackId = "operations";
  else if (/\b(creative director|art director|designer|copywriter|content creator|creative strategist|creative studio)\b/.test(combined)) trackId = "creative";
  else if (/\b(brand|marketing|advertising|campaign|go-to-market|gtm|creative program|creative project)\b/.test(combined)) trackId = "brand-project";
  const trackLabel = RADAR_TRACKS.find((track) => track.id === trackId)?.label || "General PM";
  return {
    trackId,
    trackLabel,
    // The source itself outranks the text-based classifier: a role listed on
    // a startup-only board is startup evidence even when its own description
    // never mentions funding stage, which is the common case.
    companyCategory: sourceIsStartupBoard(opportunity?.sourceUrl) ? "Startup / Early-stage" : classifyCompanyCategory(target?.kind || target?.companyType, combined),
  };
}

export function classifyCompanyCategory(value, context = "") {
  const explicit = clean(value, 120);
  if (RADAR_COMPANY_CATEGORIES.includes(explicit)) return explicit;
  const combined = `${explicit} ${clean(context, 6_000)}`.toLowerCase();
  if (STARTUP_SIGNAL.test(combined)) return "Startup / Early-stage";
  if (/\b(sports?|athletic|athlete|league|football|basketball|baseball|soccer|entertainment)\b/.test(combined)) return "Sports / Entertainment";
  if (/\b(anthropic|google|openai|attentive|hinge health|perplexity|snap|whatnot)\b/.test(combined)) return "Technology";
  if (/\b(the athletic|tubi)\b/.test(combined)) return "Media";
  if (/\b(highwire|george p\.? johnson|inizio evoke|jack morton)\b/.test(combined)) return "Creative / Advertising Agency";
  if (/\b(e\.?l\.?f\.? cosmetics|aventon|gantri)\b/.test(combined)) return "Brand / Consumer";
  if (/\b(marketing agency|communications agency|public relations agency|pr agency)\b/.test(combined)) return "Marketing Agency";
  if (/\b(creative agency|advertising agency|ad agency|experiential agency|agency production)\b/.test(combined)) return "Creative / Advertising Agency";
  if (/\b(production company|production studio|live production|film production)\b/.test(combined)) return "Production Company";
  if (/\b(software|technology|tech company|artificial intelligence| ai |saas|platform|healthtech|fintech)\b/.test(` ${combined} `)) return "Technology";
  if (/\b(media|publisher|news|streaming|television)\b/.test(combined)) return "Media";
  if (/\b(retail|hospitality|hotel|restaurant)\b/.test(combined)) return "Retail / Hospitality";
  if (/\b(nonprofit|education|university|school)\b/.test(combined)) return "Nonprofit / Education";
  if (/\b(consumer|brand|beauty|cosmetics|apparel|ecommerce|e-commerce)\b/.test(combined)) return "Brand / Consumer";
  if (/\bagency\b/.test(combined)) return "Creative / Advertising Agency";
  return "Other";
}

export async function discoverTargetJobs(target, options = {}) {
  return (await discoverTargetJobsDetailed(target, options)).jobs;
}

export async function discoverTargetJobsDetailed(target, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const candidates = uniqueCandidates([
    { url: target?.careersUrl || target?.careers, purpose: "saved-careers" },
    { url: target?.websiteUrl || target?.website, purpose: "company-website" },
    { url: target?.referenceUrl, purpose: "reference" },
    ...(Array.isArray(target?.searchUrls) ? target.searchUrls.map((url) => ({ url, purpose: "public-web-search" })) : []),
  ].map((candidate) => ({ ...candidate, url: clean(candidate.url, 4_000) }))
    .filter((candidate) => candidate.url && !isLinkedInUrl(candidate.url) && !/\b(?:indeed|glassdoor)\.com\b/i.test(candidate.url)));
  if (!candidates.length) throw new Error("Add a company website or public careers page before scanning this target.");
  const attempts = [];
  const allJobs = [];
  let recommendedCareersUrl = "";
  for (const candidate of candidates.slice(0, 4)) {
    const result = await tryCareerSource(candidate.url, candidate.purpose, target, fetchImpl);
    attempts.push(result.attempt);
    if (result.jobs.length) {
      allJobs.push(...result.jobs.map((job) => ({ ...job, sourceType: job.sourceType || result.attempt.sourceType, scanUrl: candidate.url })));
      recommendedCareersUrl ||= result.resolvedCareersUrl || candidate.url;
    }
  }

  if (!allJobs.length) {
    for (const candidate of commonCareerCandidates(target, candidates).slice(0, COMMON_CAREER_PATHS.length)) {
      const result = await tryCareerSource(candidate.url, candidate.purpose, target, fetchImpl);
      attempts.push(result.attempt);
      if (result.jobs.length) {
        allJobs.push(...result.jobs.map((job) => ({ ...job, sourceType: job.sourceType || result.attempt.sourceType, scanUrl: candidate.url })));
        recommendedCareersUrl ||= result.resolvedCareersUrl || candidate.url;
        break;
      }
    }
  }
  if (!allJobs.length && attempts.every((attempt) => attempt.status === "failed")) {
    throw new Error(`Every public source failed: ${attempts.map((attempt) => `${attempt.sourceType}: ${attempt.message}`).join(" · ")}`.slice(0, 500));
  }

  const company = clean(target?.company || target?.name, 240);
  const jobs = uniqueBy(allJobs.map((job) => ({
    title: clean(job.title, 300),
    company: clean(job.company || company, 240),
    location: clean(job.location, 400),
    description: clean(job.description, 100_000),
    sourceUrl: safeJobUrl(job.sourceUrl, job.scanUrl || candidates[0].url),
    sourceType: clean(job.sourceType || "public-page", 80),
    datePosted: clean(job.datePosted, 80),
  })).filter(isPlausibleRadarJob), (job) => `${job.sourceUrl}|${job.title}`).slice(0, 300);
  return { jobs, attempts, recommendedCareersUrl };
}

async function tryCareerSource(scanUrl, purpose, target, fetchImpl) {
  try {
    const source = detectCareerSource(scanUrl);
    let jobs;
    let resolvedCareersUrl = source.url.href;
    if (source.type === "greenhouse") jobs = await readGreenhouse(source.token, fetchImpl);
    else if (source.type === "lever") jobs = await readLever(source.token, fetchImpl);
    else if (source.type === "ashby") jobs = await readAshby(source.token, fetchImpl);
    else if (source.type === "smartrecruiters") jobs = await readSmartRecruiters(source.token, fetchImpl);
    else if (source.type === "workday") jobs = await readWorkday(source.token, source.url, fetchImpl);
    else if (source.type === "apple") jobs = await readApple(source.url, target, fetchImpl);
    else if (source.type === "google-careers") jobs = await readGoogleCareers(source.url, target, fetchImpl);
    else if (source.type === "meta-search") throw new Error("Meta's published robots policy does not permit automated job collection. V’s can keep this as a reference and import individual public Meta job pages, but it will not crawl Meta search results.");
    else {
      const result = await readGenericCareerPageDetailed(source.url.href, fetchImpl, true);
      jobs = result.jobs;
      resolvedCareersUrl = result.resolvedCareersUrl || source.url.href;
    }
    const candidateJobs = Array.isArray(jobs) ? jobs : [];
    const validatedJobs = candidateJobs.filter(isPlausibleRadarJob);
    const rejected = candidateJobs.length - validatedJobs.length;
    return {
      jobs: validatedJobs,
      resolvedCareersUrl,
      attempt: {
        url: scanUrl,
        resolvedUrl: resolvedCareersUrl,
        purpose,
        sourceType: source.type,
        status: "completed",
        found: validatedJobs.length,
        rejected,
        message: rejected ? `${rejected} navigation or non-job ${rejected === 1 ? "link was" : "links were"} excluded.` : undefined,
      },
    };
  } catch (cause) {
    return {
      jobs: [],
      resolvedCareersUrl: "",
      attempt: { url: scanUrl, purpose, sourceType: safeSourceType(scanUrl), status: "failed", found: 0, message: safeAttemptMessage(cause) },
    };
  }
}

function commonCareerCandidates(target, existing) {
  const website = clean(target?.websiteUrl || target?.website, 4_000);
  if (!website) return [];
  try {
    const url = validatePublicUrl(website);
    if (detectCareerSource(url.href).type !== "public-page") return [];
    const seen = new Set(existing.map((candidate) => canonicalUrl(candidate.url)));
    return COMMON_CAREER_PATHS
      .map((path) => ({ url: new URL(path, url.origin).href, purpose: "automatic-recovery" }))
      .filter((candidate) => !seen.has(canonicalUrl(candidate.url)));
  } catch {
    return [];
  }
}

function uniqueCandidates(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = canonicalUrl(item.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalUrl(value) {
  try {
    const url = validatePublicUrl(value);
    url.hash = "";
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
}

async function readWorkday(token, url, fetchImpl) {
  const [tenant, site, locale] = token.split("|");
  const endpoint = new URL(`/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`, url.origin);
  const payload = await fetchJson(endpoint.href, fetchImpl, {
    method: "POST",
    body: JSON.stringify({ appliedFacets: {}, limit: 100, offset: 0, searchText: "" }),
    headers: { "Content-Type": "application/json" },
  });
  const prefix = `/${locale || "en-US"}/${site}`;
  return (Array.isArray(payload?.jobPostings) ? payload.jobPostings : []).map((job) => ({
    title: job.title,
    location: job.locationsText || (Array.isArray(job.bulletFields) ? job.bulletFields.join(" · ") : ""),
    description: "",
    sourceUrl: new URL(`${prefix}${String(job.externalPath || "")}`, url.origin).href,
    sourceType: "workday",
    datePosted: job.postedOn || "",
  }));
}

/* Apple and Google expose public search data, but their visual pages are
 * JavaScript applications. These bounded adapters read only the same public
 * search responses a visitor receives; no account session or cookies are used. */
async function readApple(url, target, fetchImpl) {
  const searches = [
    { filters: { locations: ["postLocation-USA"] }, pages: 3 },
    ...radarSearchTerms(target).slice(0, 3).map((keyword) => ({ filters: { locations: ["postLocation-USA"], keywords: [keyword] }, pages: 1 })),
  ];
  const jobs = [];
  for (const search of searches) {
    for (let page = 1; page <= search.pages; page += 1) {
      const payload = await fetchJson(`${url.origin}/api/v1/search`, fetchImpl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "",
          filters: search.filters,
          page,
          locale: "en-us",
          sort: "newest",
          format: { longDate: "MMMM D, YYYY", mediumDate: "MMM D, YYYY" },
        }),
      });
      for (const role of Array.isArray(payload?.res?.searchResults) ? payload.res.searchResults : []) {
        const positionId = clean(role.positionId || role.jobPositionId || role.id, 120);
        const title = clean(role.postingTitle, 300);
        if (!positionId || !title) continue;
        jobs.push({
          title,
          location: appleLocation(role.locations),
          description: clean(role.jobSummary, 100_000),
          sourceUrl: `${url.origin}/en-us/details/${encodeURIComponent(positionId)}/${appleSlug(role.transformedPostingTitle || title)}`,
          sourceType: "apple",
          datePosted: clean(role.postDateInGMT || role.postingDate, 80),
        });
      }
    }
  }
  return uniqueBy(jobs, (job) => job.sourceUrl).slice(0, 180);
}

async function readGoogleCareers(url, target, fetchImpl) {
  const jobs = [];
  for (const term of radarSearchTerms(target).slice(0, 4)) {
    const searchUrl = new URL("/about/careers/applications/jobs/results/", url.origin);
    searchUrl.searchParams.set("q", term);
    jobs.push(...parseGoogleSearchResults(await fetchHtml(searchUrl.href, fetchImpl)));
  }
  return uniqueBy(jobs, (job) => job.sourceUrl).slice(0, 140);
}

function radarSearchTerms(target) {
  const requested = clean(target?.focus, 1_000).split(/[\n,;|]/).map((item) => clean(item, 100)).filter((item) => item.length >= 3);
  return [...new Set([...requested, "creative operations", "creative project manager", "marketing producer", "program manager"])].slice(0, 5);
}

function parseGoogleSearchResults(html) {
  const jobs = [];
  for (const card of String(html || "").split(/<li\s+class=["']lLd3Je["'][^>]*>/i).slice(1)) {
    const title = clean(stripMarkup(firstRegex(card, /<h3\b[^>]*class=["']QJPWVe["'][^>]*>([\s\S]*?)<\/h3>/i)), 300);
    const href = firstRegex(card, /<a\b[^>]*href=["']([^"']*jobs\/results\/[^"']+)["']/i);
    if (!title || !href) continue;
    const location = clean(stripMarkup(firstRegex(card, /<span\b[^>]*class=["']r0wTof[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)), 400);
    jobs.push({
      title,
      location,
      description: clean(stripMarkup(card), 12_000),
      sourceUrl: new URL(href, "https://www.google.com/about/careers/applications/").href,
      sourceType: "google-careers",
      datePosted: "",
    });
  }
  return uniqueBy(jobs, (job) => job.sourceUrl);
}

async function fetchHtml(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "User-Agent": "VJobsSeeker/1.0 radar" },
    });
    if (!response.ok) throw new Error(`The public careers page returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 4_000_000) throw new Error("The public careers page is too large to scan safely.");
    return text;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("The public careers page took too long to respond.");
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

function appleLocation(locations) {
  return (Array.isArray(locations) ? locations : []).map((location) => clean(location?.name || [location?.city, location?.stateProvince, location?.countryName].filter(Boolean).join(", "), 160)).filter(Boolean).join(" / ");
}

function appleSlug(value) {
  return clean(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "role";
}

function firstRegex(value, expression) {
  return String(value || "").match(expression)?.[1] || "";
}

/*
 * Read a public company page and follow only the best official careers/ATS
 * links. The resolved hub is returned so a monitor can self-repair a stale URL.
 */
async function readGenericCareerPageDetailed(url, fetchImpl, followCareerHub = true) {
  const page = await readPublicLink(url, { fetchImpl });
  const jobs = [...page.jobs.map((job) => ({ ...job, sourceType: "structured-job-page" }))];
  let resolvedCareersUrl = page.finalUrl || page.requestedUrl || url;
  for (const link of page.links) {
    if (!looksLikeJobLink(link)) continue;
    jobs.push({
      title: link.label,
      location: "",
      description: "",
      sourceUrl: link.href,
      sourceType: "public-careers-page",
      datePosted: "",
    });
  }
  if (followCareerHub) {
    for (const hub of rankCareerLinks(page.links).filter((link) => link.href !== page.finalUrl && link.href !== page.requestedUrl).slice(0, 5)) {
      try {
        const source = detectCareerSource(hub.href);
        let discovered = [];
        let discoveredHub = hub.href;
        if (source.type === "greenhouse") discovered = await readGreenhouse(source.token, fetchImpl);
        else if (source.type === "lever") discovered = await readLever(source.token, fetchImpl);
        else if (source.type === "ashby") discovered = await readAshby(source.token, fetchImpl);
        else if (source.type === "smartrecruiters") discovered = await readSmartRecruiters(source.token, fetchImpl);
        else if (source.type === "workday") discovered = await readWorkday(source.token, source.url, fetchImpl);
        else {
          const nested = await readGenericCareerPageDetailed(source.url.href, fetchImpl, false);
          discovered = nested.jobs;
          discoveredHub = nested.resolvedCareersUrl || hub.href;
        }
        if (discovered.length) {
          jobs.push(...discovered);
          resolvedCareersUrl = discoveredHub;
        }
      } catch {
        // Keep trying the remaining official Careers/Jobs/Opportunities links.
      }
    }
  }
  return { jobs: uniqueBy(jobs, (job) => `${job.sourceUrl}|${job.title}`), resolvedCareersUrl };
}

async function readGreenhouse(token, fetchImpl) {
  const payload = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`, fetchImpl);
  return (Array.isArray(payload?.jobs) ? payload.jobs : []).map((job) => ({
    title: job.title,
    location: job.location?.name,
    description: stripMarkup(job.content || ""),
    sourceUrl: job.absolute_url,
    sourceType: "greenhouse",
    datePosted: job.updated_at,
  }));
}

async function readLever(token, fetchImpl) {
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`, fetchImpl);
  return (Array.isArray(payload) ? payload : []).map((job) => ({
    title: job.text,
    location: job.categories?.location || job.categories?.allLocations?.join(" / "),
    description: [job.descriptionPlain, job.additionalPlain].filter(Boolean).join("\n"),
    sourceUrl: job.hostedUrl || job.applyUrl,
    sourceType: "lever",
    datePosted: job.createdAt ? new Date(job.createdAt).toISOString() : "",
  }));
}

async function readAshby(token, fetchImpl) {
  const payload = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=false`, fetchImpl);
  return (Array.isArray(payload?.jobs) ? payload.jobs : []).map((job) => ({
    title: job.title,
    location: [job.location, job.isRemote ? "Remote" : ""].filter(Boolean).join(" · "),
    description: job.descriptionPlain || stripMarkup(job.descriptionHtml || ""),
    sourceUrl: job.jobUrl || job.applyUrl,
    sourceType: "ashby",
    datePosted: job.publishedAt,
  }));
}

async function readSmartRecruiters(token, fetchImpl) {
  const payload = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100`, fetchImpl);
  return (Array.isArray(payload?.content) ? payload.content : []).map((job) => ({
    title: job.name,
    location: [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", "),
    description: clean(job.jobAd?.sections?.jobDescription?.text || job.jobAd?.sections?.qualifications?.text || "", 100_000),
    sourceUrl: job.ref || `https://jobs.smartrecruiters.com/${encodeURIComponent(token)}/${job.id}`,
    sourceType: "smartrecruiters",
    datePosted: job.releasedDate || "",
  }));
}

export function rankCareerLinks(links) {
  return (Array.isArray(links) ? links : [])
    .filter((link) => /^https?:\/\//i.test(clean(link?.href, 4_000)) && !isLinkedInUrl(link.href))
    .map((link) => {
      const label = clean(link?.label, 240);
      const href = clean(link?.href, 4_000);
      const haystack = `${label} ${href}`.toLowerCase();
      const semantic = /career/.test(haystack) ? 50
        : /\bjobs?\b/.test(haystack) ? 45
          : /opportunit/.test(haystack) ? 40
            : /openings?|open roles?/.test(haystack) ? 35
              : /join(?:-|\s)?us|work(?:-|\s)?with(?:-|\s)?us/.test(haystack) ? 30
                : 0;
      const ats = /greenhouse|lever|ashby|workday|smartrecruiters|jobvite/.test(haystack) ? 20 : 0;
      return { href, label, score: semantic + ats };
    })
    .filter((link) => link.score > 0)
    .sort((left, right) => right.score - left.score || left.href.length - right.href.length);
}

function looksLikeJobLink(link) {
  const label = clean(link?.label, 240);
  const href = clean(link?.href, 4_000);
  if (/linkedin\.com/i.test(href)) return false;
  return isPlausibleRadarJob({ title: label, sourceUrl: href, sourceType: "public-careers-page" });
}

/*
 * Read one public job-detail page the user pointed V's at directly.
 *
 * Employers whose robots policy forbids automated collection — Meta's job
 * search is the standing example — still publish individual job pages that a
 * person may open and share. This is the user-directed path for those: it
 * reads exactly the one URL supplied, follows no links, and crawls nothing.
 */
export async function readSingleJobPosting(value, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const source = detectCareerSource(value);
  if (source.type === "meta-search") {
    throw new Error("That is a Meta job-search URL, which cannot be collected automatically. Open the specific role and paste its job-details link instead.");
  }
  if (isLinkedInUrl(source.url.href)) {
    throw new Error("LinkedIn job pages cannot be read automatically. Open the role, copy the description, and paste it in Role workspace instead.");
  }
  const page = await readPublicLink(source.url.href, { fetchImpl });
  const finalUrl = page.finalUrl || page.requestedUrl || source.url.href;
  const posting = page.jobs[0];
  if (posting) {
    return {
      title: clean(posting.title, 300),
      company: clean(posting.company, 180),
      location: clean(posting.location, 180),
      description: clean(posting.description, 20_000),
      sourceUrl: clean(posting.sourceUrl, 4_000) || finalUrl,
      sourceType: "structured-job-page",
      datePosted: clean(posting.datePosted, 40),
    };
  }
  // No JSON-LD posting: fall back to the page's own title and text, and keep
  // the detected source type so a trusted ATS page is still trusted.
  const title = pageTitleAsRole(page.title);
  if (!title) throw new Error("That page did not contain a readable job title. Open it and confirm it is a public job-details page.");
  return {
    title,
    company: companyFromSourceUrl(source),
    location: "",
    description: clean(page.description || page.text, 20_000),
    sourceUrl: finalUrl,
    sourceType: source.type === "public-page" ? "public-job-page" : source.type,
    datePosted: "",
  };
}

// Job pages title themselves "Senior Producer - Acme Careers" or
// "Acme | Senior Producer"; keep the segment that reads like a role.
function pageTitleAsRole(value) {
  const raw = clean(value, 300);
  if (!raw) return "";
  const segments = raw.split(/\s+[|·—–]\s+|\s+-\s+/).map((segment) => clean(segment, 200)).filter(Boolean);
  const roleSegment = segments.find((segment) => ROLE_TITLE_SIGNAL.test(segment) && !NAVIGATION_TITLE.test(segment));
  return roleSegment || (segments[0] && !NAVIGATION_TITLE.test(segments[0]) ? segments[0] : "");
}

// Parameters that identify where a click came from, never which job it is.
// gh_jid, jk, and requisition ids are deliberately absent: those ARE the job.
const TRACKING_PARAMS = /^(?:utm_[a-z_]*|gh_src|trk|trkinfo|refid|ref|referrer|src|source|campaign|mc_cid|mc_eid|fbclid|gclid|msclkid|igshid|s_kwcid|recruiter|rx_[a-z]+)$/i;

/*
 * A stable identity for one job posting, used to decide whether a discovery is
 * new or one V's already has.
 *
 * Deduplication used to compare the raw source_url as an exact string, so the
 * same posting reached by a slightly different link became a second inbox row:
 * a trailing slash, http vs https, a www. prefix, a tracking parameter, a
 * reordered query, or a #fragment were each enough. A role found by a monitored
 * scan, then by V's Job Watch, then imported by hand produced three rows.
 *
 * Host and scheme are normalized because they never distinguish two jobs. The
 * path keeps its original case: some ATS platforms use case-sensitive job ids,
 * and wrongly merging two real postings loses a role, which is worse than
 * showing a duplicate.
 */
/*
 * Reduce an applicant-tracking-system URL to the board and posting it names.
 *
 * The same posting reaches the radar by several routes — the board API, the
 * company's own careers page, a web-search lead — and each spells the URL
 * differently. Greenhouse alone serves one posting as
 * boards.greenhouse.io/figma/jobs/123, job-boards.greenhouse.io/figma/jobs/123,
 * the same with ?gh_jid=123 appended, and boards.greenhouse.io/embed/job_app
 * ?for=figma&token=123. Treating those as four postings is exactly why the
 * same jobs kept reappearing in the inbox. Where the ATS is recognized, the
 * identity is the board plus the posting id and nothing else.
 */
function atsIdentity(url) {
  const host = url.hostname;
  const segments = url.pathname.split("/").filter(Boolean);

  if (host.endsWith("greenhouse.io")) {
    const embedBoard = url.searchParams.get("for");
    const embedToken = url.searchParams.get("token") || url.searchParams.get("gh_jid");
    if (embedBoard && embedToken) return `greenhouse:${embedBoard.toLowerCase()}:${embedToken}`;
    const jobsAt = segments.indexOf("jobs");
    const id = url.searchParams.get("gh_jid") || (jobsAt > 0 ? segments[jobsAt + 1] : "");
    const board = jobsAt > 0 ? segments[jobsAt - 1] : segments[0];
    if (board && id) return `greenhouse:${board.toLowerCase()}:${id}`;
  }

  if (host.endsWith("lever.co")) {
    // /<board>/<id>, optionally followed by /apply or /thanks.
    const [board, id] = segments;
    if (board && id) return `lever:${board.toLowerCase()}:${id.toLowerCase()}`;
  }

  if (host.endsWith("ashbyhq.com")) {
    // /<board>/<uuid>, optionally followed by /application.
    const cleaned = segments.filter((segment) => segment !== "posting-api" && segment !== "job-board");
    const [board, id] = cleaned;
    if (board && id) return `ashby:${board.toLowerCase()}:${id.toLowerCase()}`;
  }

  if (host.endsWith("smartrecruiters.com")) {
    const [board, id] = segments;
    if (board && id) return `smartrecruiters:${board.toLowerCase()}:${id.toLowerCase()}`;
  }

  if (host.endsWith("myworkdayjobs.com")) {
    // The final segment carries the requisition id; the locale prefix and the
    // human-readable slug in between vary by entry point.
    const requisition = segments[segments.length - 1] || "";
    if (/_R?-?\d{3,}/i.test(requisition)) return `workday:${host}:${requisition.toLowerCase()}`;
  }

  return "";
}

export function opportunityKey(value) {
  const raw = clean(value, 4_000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.port = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    const ats = atsIdentity(url);
    if (ats) return ats;
    url.searchParams.sort();
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${path}${url.search}`;
  } catch {
    return raw.toLowerCase();
  }
}

/*
 * A second identity for the same posting, used only when the URLs disagree.
 *
 * Some employers publish a role on their own careers page and on a board under
 * unrelated URLs, and a web-search lead can land on a third. One company
 * advertising one title in one place is one job, so this collapses them. It is
 * deliberately strict: the location is part of the key, so the same title open
 * in two cities stays two postings.
 */
export function opportunityContentKey(job = {}) {
  const normalize = (value) => clean(value, 300)
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const company = normalize(job.company);
  const title = normalize(job.title)
    // Requisition numbers and city suffixes that some boards append to an
    // otherwise identical title.
    .replace(/\b(?:job )?(?:req|requisition|id)\s*\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!company || title.length < 4) return "";
  const location = normalize(job.location).replace(/\b(?:united states|usa|us|remote first)\b/g, "").replace(/\s+/g, " ").trim();
  return `content:${company}:${title}:${location}`;
}

export function isPlausibleRadarJob(job = {}) {
  const title = clean(job?.title, 300);
  const sourceUrl = clean(job?.sourceUrl, 4_000);
  const sourceType = clean(job?.sourceType, 80);
  if (title.length < 4 || !sourceUrl) return false;
  if (NAVIGATION_TITLE.test(title) || NAVIGATION_PHRASE.test(title)) return false;
  if (/^(?:about|benefits|careers?|culture|departments?|locations?|our company|people|search|teams?|why join)\b/i.test(title)) return false;
  if (TRUSTED_JOB_SOURCES.has(sourceType)) return true;
  // Untrusted pages need a job-detail URL plus a role-shaped title or a real
  // description — a bare /careers/<slug> link with a marketing title is a
  // navigation card, not a posting.
  if (!JOB_DETAIL_PATH.test(sourceUrl)) return false;
  return ROLE_TITLE_SIGNAL.test(title) || clean(job?.description, 2_000).length >= 80;
}

async function fetchJson(url, fetchImpl, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "VJobsSeeker/1.0 radar", ...(init.headers || {}) },
    });
    if (!response.ok) throw new Error(`The careers service returned HTTP ${response.status}.`);
    const length = Number(response.headers.get("content-length") || "0");
    if (length > 4_000_000) throw new Error("The careers response is too large to scan safely.");
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("The careers service returned an unreadable response. Open the source in your browser and verify that it is public.");
    }
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("The careers service took too long to respond.");
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

function tokens(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{1,}/g) || [])]
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function phraseMatches(haystack, phrase) {
  const normalized = clean(phrase, 200).toLowerCase();
  if (!normalized) return false;
  if (normalized.length <= 3) return new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i").test(haystack);
  return haystack.includes(normalized) || tokens(normalized).every((token) => haystack.includes(token));
}

// Titles are matched strictly, unlike free text. phraseMatches() falls back to
// a stop-word-stripped token check, and "manager" is a stop word — so "Project
// Manager" degraded to "project" and handed the full exact-title bonus to
// "Project Engineer", "Project Coordinator", and "Project Architect" alike.
function titleMatches(titleLower, target) {
  const normalized = clean(target, 200).toLowerCase();
  if (!normalized) return false;
  if (titleLower.includes(normalized)) return true;
  const words = (normalized.match(/[a-z0-9][a-z0-9+#.-]*/g) || []).filter((word) => word.length >= 3);
  if (words.length < 2) return false;
  return words.every((word) => new RegExp(`\\b${escapeRegExp(word)}`).test(titleLower));
}

function locationMatch(location, target) {
  const normalized = clean(target, 120).toLowerCase();
  if (!normalized) return false;
  if (/san francisco bay area|bay area/.test(normalized)) return isBayAreaLocation(location);
  if (/united states|\bu\.s\.?\b|\busa\b/.test(normalized)) return isUnitedStatesLocation(location);
  if (location.includes(normalized)) return true;
  const parts = tokens(normalized);
  return parts.length > 0 && parts.every((token) => new RegExp(`\\b${escapeRegExp(token)}`).test(location));
}

function cleanList(value, limit, itemLimit) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  return [...new Set(source.map((item) => clean(item, itemLimit)).filter(Boolean))].slice(0, limit);
}

function clean(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function boundedNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function safeJobUrl(value, fallback) {
  try {
    return validatePublicUrl(new URL(String(value || ""), fallback).href).href;
  } catch {
    return validatePublicUrl(fallback).href;
  }
}

function stripMarkup(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item).toLowerCase();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function safeSourceType(value) {
  try { return detectCareerSource(value).type; } catch { return "public-page"; }
}

function safeAttemptMessage(value) {
  return (value instanceof Error ? value.message : "The source could not be scanned.")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
