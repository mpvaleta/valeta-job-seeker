export type ClosedReason = "no_answer" | "answered" | "not_sent";
type ApplicationLike = { id?: string; company?: string; role?: string; status?: string; date?: string; note?: string; feedbackDate?: string; closedReason?: ClosedReason; silenceResetAt?: string; trackName?: string };
export const SILENCE_DAYS: number;
export const REPLY_MIN_SAMPLE: number;
export const PRE_APPLICATION: Set<string>;
export const ANSWERED_STATUSES: Set<string>;
export function daysSince(value?: string, today?: string): number | null;
export type SilentClosure = { id?: string; company?: string; role?: string; waited: number; reopened: boolean };
export function expireSilentApplications<T extends ApplicationLike>(applications: T[], options?: { today?: string; days?: number }): { applications: T[]; closed: SilentClosure[] };
export function describeSilentClosures(closed: SilentClosure[], days?: number): string;
export function clearAutoCloseNote(note?: string): string;
export function applyStatusChange<T extends ApplicationLike>(application: T, nextStatus: string, today: string): { application: T; applied: boolean; answered: boolean; reopened: boolean };
export function summarizeReplies(applications: ApplicationLike[], options?: { minimum?: number }): {
  ready: boolean; answered: number; silent: number; sent: number; replyRate: number | null;
  words: Array<{ word: string; count: number }>; tracks: Array<{ name: string; count: number }>;
  medianReplyDays: number | null; reason: string;
};
