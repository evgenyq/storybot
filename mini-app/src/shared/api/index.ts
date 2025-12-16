import { supabase } from './supabase';
import type { 
  User, 
  Book, 
  Chapter, 
  Character, 
  Illustration,
  BookWithDetails,
  ChapterWithIllustrations,
  UserSettings
} from '../types';

// ============ Users ============

export async function getOrCreateUser(telegramId: number, userData?: Partial<User>): Promise<User> {
  // Try to find existing user
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (existingUser) {
    return existingUser;
  }

  // Create new user
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      username: userData?.username,
      first_name: userData?.first_name,
      last_name: userData?.last_name,
    })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

export async function updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update({ settings })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Books ============

export async function getUserBooks(userId: string): Promise<BookWithDetails[]> {
  const { data: books, error } = await supabase
    .from('books')
    .select(`
      *,
      chapters(count),
      book_characters(
        character:characters(*)
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return books.map(book => ({
    ...book,
    chapter_count: book.chapters?.[0]?.count || 0,
    characters: book.book_characters?.map((bc: { character: Character }) => bc.character) || [],
  }));
}

export async function getBook(bookId: string): Promise<BookWithDetails | null> {
  const { data: book, error } = await supabase
    .from('books')
    .select(`
      *,
      chapters(*, illustrations(*)),
      book_characters(
        character:characters(*)
      )
    `)
    .eq('id', bookId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    ...book,
    chapters: book.chapters?.sort((a: Chapter, b: Chapter) => a.chapter_number - b.chapter_number) || [],
    characters: book.book_characters?.map((bc: { character: Character }) => bc.character) || [],
  };
}

export async function createBook(
  userId: string, 
  title: string, 
  description: string,
  characterIds: string[]
): Promise<Book> {
  // Create book
  const { data: book, error: bookError } = await supabase
    .from('books')
    .insert({
      user_id: userId,
      title,
      description,
    })
    .select()
    .single();

  if (bookError) throw bookError;

  // Link characters to book
  if (characterIds.length > 0) {
    const { error: linkError } = await supabase
      .from('book_characters')
      .insert(
        characterIds.map(characterId => ({
          book_id: book.id,
          character_id: characterId,
        }))
      );

    if (linkError) throw linkError;
  }

  return book;
}

export async function updateBookCover(bookId: string, coverUrl: string): Promise<void> {
  const { error } = await supabase
    .from('books')
    .update({ cover_url: coverUrl })
    .eq('id', bookId);

  if (error) throw error;
}

export async function deleteBook(bookId: string): Promise<void> {
  const { error } = await supabase
    .from('books')
    .delete()
    .eq('id', bookId);

  if (error) throw error;
}

// ============ Chapters ============

export async function getBookChapters(bookId: string): Promise<ChapterWithIllustrations[]> {
  const { data, error } = await supabase
    .from('chapters')
    .select('*, illustrations(*)')
    .eq('book_id', bookId)
    .order('chapter_number');

  if (error) throw error;

  return data.map(chapter => ({
    ...chapter,
    illustrations: chapter.illustrations?.sort((a: Illustration, b: Illustration) => a.position - b.position) || [],
  }));
}

export async function getChapter(chapterId: string): Promise<ChapterWithIllustrations | null> {
  const { data, error } = await supabase
    .from('chapters')
    .select('*, illustrations(*)')
    .eq('id', chapterId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    ...data,
    illustrations: data.illustrations?.sort((a: Illustration, b: Illustration) => a.position - b.position) || [],
  };
}

// ============ Characters ============

export async function getUserCharacters(userId: string): Promise<Character[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createCharacter(
  userId: string,
  name: string,
  description: string
): Promise<Character> {
  const { data, error } = await supabase
    .from('characters')
    .insert({
      user_id: userId,
      name,
      description,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCharacterImage(characterId: string, imageUrl: string): Promise<void> {
  const { error } = await supabase
    .from('characters')
    .update({ image_url: imageUrl })
    .eq('id', characterId);

  if (error) throw error;
}

export async function deleteCharacter(characterId: string): Promise<void> {
  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', characterId);

  if (error) throw error;
}

// ============ Edge Functions ============

export async function generateChapter(bookId: string, hint?: string) {
  const { data, error } = await supabase.functions.invoke('generate-chapter', {
    body: { book_id: bookId, hint },
  });

  if (error) throw error;
  return data;
}

export async function generateCharacterImage(characterId: string, name: string, description: string) {
  const { data, error } = await supabase.functions.invoke('generate-character-reference', {
    body: { character_id: characterId, name, description },
  });

  if (error) throw error;
  return data;
}

export async function transcribeVoice(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const { data, error } = await supabase.functions.invoke('transcribe-voice', {
    body: formData,
  });

  if (error) throw error;
  return data.text;
}

