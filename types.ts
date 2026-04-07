export interface WordData {
  word: string;
  partOfSpeech?: string; // e.g. n., adj., adv., v.
  parts: string[];
  partsPronunciation?: string[]; // New: TTS respelling for each part (e.g. "ti" -> "tie")
  root: string;
  phonetic: string;
  translation: string; // The Chinese translation of the word
  sentence: string;
  imageUrl?: string;
  relatedWords: string[];
  phrases: string[]; // New: Common phrases/collocations
}

export interface User {
  id: string;
  username: string;
  password?: string;
  apiKey: string;
  isDefault: boolean;
  hasSeeded?: boolean; // New: Track if initial words have been seeded
}

export interface DailyStats {
  userId: string;
  date: string;
  stars: number;
  badges?: number;
  highestBpm: number;
  totalAttempts?: number;
}

export interface DBWordRecord {
  userId: string;        // New: Link record to a specific user
  word: string;
  data: WordData;
  dateAdded: string;     // format: Mon Jan 01 2024
  datesAdded?: string[]; // New: Array of dates when the word was added/practiced
  lastReviewed: string;  // format: Mon Jan 01 2024
  bestTime?: number;     // fastest completion time in seconds
}

export enum GameStep {
  HOME = 'HOME',
  INPUT_WORD = 'INPUT_WORD',
  STEP_1_OBSERVE = 'STEP_1_OBSERVE',
  STEP_2_LISTEN = 'STEP_2_LISTEN',
  STEP_3_PRACTICE = 'STEP_3_PRACTICE',
  STEP_4_TEST = 'STEP_4_TEST',
  STEP_4_APPLICATION = 'STEP_4_APPLICATION',
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
  STATS = 'STATS',
  RHYTHM_INTRO = 'RHYTHM_INTRO', // New: Rhythm mode entry
  STEP_5_RHYTHM = 'STEP_5_RHYTHM', // New: Rhythm game play
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  ALL_WORDS = 'ALL_WORDS'
}

export interface ChallengeSession {
  wordData: WordData | null;
  startTime: number;
  attempts: number;
  history: Array<{ step: string; result: boolean; time: number }>;
}