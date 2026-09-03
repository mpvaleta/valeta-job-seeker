type ApplicationLike = { id?: string; company?: string; role?: string; status?: string; date?: string; note?: string; feedbackDate?: string; closedReason?: string; trackName?: string };
export const SILENCE_DAYS: number;
export const REPLY_MIN_SAMPLE: number;
export function daysSince(value?: string, today?: string): number | null;
export function expireSilentApplications<T extends ApplicationLike>(applications: T[], options?: { today?: string; days?: number }): { applications: T[]; closed: Array<{ id?: string; company?: string; role?: string; waited: number }> };
export function summarizeReplies(applications: ApplicationLike[], options?: { minimum?: number }): {
  ready: boolean; answered: number; silent: number; sent: number; replyRate: number | null;
  words: Array<{ word: string; count: number }>; tracks: Array<{ name: string; count: number }>;
  medianReplyDays: number | null; reason: string;
};
