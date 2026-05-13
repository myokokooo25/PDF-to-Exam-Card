
export interface Option {
  id: number;
  textJP: string; // Should contain <ruby> tags
  textMY: string;
}

export interface Explanation {
  titleMY: string;
  reasonMY: string;
  memoryTipMY: string;
}

export interface StudyCardData {
  id: string;
  questionJP: string; // Should contain <ruby> tags
  questionMY: string;
  options: Option[];
  correctOptionId: number;
  explanation: Explanation;
}

export interface HistorySession {
  id: string;
  fileName: string;
  timestamp: number;
  data: StudyCardData[];
  mode?: AppMode;
  translationData?: TranslationItem[];
  vocabData?: VocabItem[];
}

export enum AppMode {
  STUDY_CARDS = 'STUDY_CARDS',
  TRANSLATION = 'TRANSLATION'
}

export interface TranslationItem {
  id: string;
  japanese: string;
  burmese: string;
}

export interface VocabItem {
  word: string;
  reading: string;
  meaning: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING_PDF = 'LOADING_PDF',
  PROCESSING_AI = 'PROCESSING_AI',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
