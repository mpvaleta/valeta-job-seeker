type DraftLike = { id?: string; type?: "resume" | "cover"; company?: string; role?: string; url?: string; jobSnapshotId?: string; applicationId?: string; createdAt?: string; updatedAt?: string; versionNumber?: number };
type ApplicationLike = { id?: string; company?: string; role?: string; url?: string; jobSnapshotId?: string; resumeVersionId?: string; coverVersionId?: string };
export function normalizeJobUrl(value?: string): string;
export function normalizeName(value?: string): string;
export function companyFromJobUrl(value?: string): string;
export function draftMatchesApplication(draft: DraftLike, application: ApplicationLike): boolean;
export function resolveApplicationDrafts<D extends DraftLike>(application: ApplicationLike, drafts: D[]): { resume: { draft: D | null; linked: boolean }; cover: { draft: D | null; linked: boolean } };
export function draftLinksFor(application: ApplicationLike, drafts: DraftLike[]): { resumeVersionId?: string; coverVersionId?: string };
export function applicationForDraft<A extends ApplicationLike>(draft: DraftLike, applications: A[]): A | null;
