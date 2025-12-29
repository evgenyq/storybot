// Database types for StoryBot

export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  settings: UserSettings;
  created_at: string;
  updated_at: string;
}

export type StylePreset = 'fairy_tale' | 'adventure' | 'detective' | 'educational';

export interface UserSettings {
  chapter_size: number;  // 300, 500, 800
  images_per_chapter: number;  // 1, 2, 3
  style_preset: StylePreset;  // Базовый жанр
  style_custom: string;  // Дополнительные пожелания (max 200 символов)
}

export interface Character {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Book {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface BookCharacter {
  book_id: string;
  character_id: string;
  added_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  chapter_number: number;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Illustration {
  id: string;
  chapter_id: string;
  image_url: string | null;
  prompt: string | null;
  position: number;
  text_position: number;  // Position in text where [IMG:N] placeholder is
  status: 'pending' | 'generating' | 'ready' | 'error';
  created_at: string;
}

// Extended types with relations
export interface BookWithDetails extends Book {
  chapters: ChapterWithIllustrations[];
  characters: Character[];
  chapter_count?: number;
}

export interface ChapterWithIllustrations extends Chapter {
  illustrations: Illustration[];
}

// API Request/Response types
export interface GenerateChapterRequest {
  book_id: string;
  hint?: string;  // Optional user hint for the chapter
}

export interface GenerateChapterResponse {
  chapter: ChapterWithIllustrations;
  pending_illustrations: PendingIllustration[];
  needs_cover: boolean;
}

export interface PendingIllustration {
  id: string;
  position: number;
  text_position: number;
  prompt: string;
  status: string;
}

export interface GenerateCharacterImageRequest {
  character_id: string;
  name: string;
  description: string;
}

export interface TranscribeVoiceRequest {
  audio: Blob;
}

export interface TranscribeVoiceResponse {
  text: string;
}

// UI State types
export interface GenerationProgress {
  stage: 'idle' | 'generating_text' | 'generating_images' | 'complete' | 'error';
  progress: number;  // 0-100
  message: string;
}

// Telegram types
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

