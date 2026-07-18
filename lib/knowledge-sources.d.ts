export type SourceScope = "evidence" | "voice" | "guidance" | "research";
export type SourceCategory = "Résumé" | "Custom GPT export" | "LinkedIn export" | "Writing sample" | "Résumé playbook" | "Company research" | "Other evidence";

export const SOURCE_CATEGORIES: SourceCategory[];
export function scopeForCategory(category?: SourceCategory | string): SourceScope;
export function sourceScope(source?: { scope?: SourceScope; category?: SourceCategory }): SourceScope;
export function sourceScopeLabel(scope: SourceScope): string;
export function sourceScopeDescription(scope: SourceScope): string;
export function mergeWritingSample(existing: string, title: string, text: string): string;
export function removeWritingSample(existing: string, title: string): string;
