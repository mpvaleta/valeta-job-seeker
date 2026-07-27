export type WritingVoiceProfile = {
  ready: boolean;
  tone: string;
  prefer: string;
  avoid: string;
  stats: { words: number; sentences: number; averageSentenceWords: number; firstPerson: number; contractions: number; questions: number; exclamations: number; kept: number; dropped: number; sourceWords: number };
  phrases: string[];
};
export function deriveWritingVoice(value: string): WritingVoiceProfile;
export function cleanWritingSamples(value: string): { text: string; kept: number; dropped: number; sourceWords: number };
