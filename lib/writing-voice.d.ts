export type WritingVoiceProfile = {
  ready: boolean;
  tone: string;
  prefer: string;
  avoid: string;
  stats: { words: number; sentences: number; averageSentenceWords: number; firstPerson: number; contractions: number; questions: number; exclamations: number };
  phrases: string[];
};
export function deriveWritingVoice(value: string): WritingVoiceProfile;
