export enum GenerationStatus {
  IDLE = 'idle',
  GENERATING_TEXT = 'generating_text',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface EbookData {
  title: string;
  subtitle: string;
  content: string; // The full raw markdown/text content
}

export interface ImageRequest {
  id: string;
  prompt: string;
  url?: string;
  status: 'pending' | 'loading' | 'success' | 'error';
}

export type SectionType = 'cover' | 'toc' | 'chapter' | 'summary' | 'intro';