import { create } from 'zustand';
import type { User, Character, BookWithDetails, GenerationProgress } from '../types';

interface AppState {
  // User
  user: User | null;
  setUser: (user: User | null) => void;

  // Books
  books: BookWithDetails[];
  setBooks: (books: BookWithDetails[]) => void;
  addBook: (book: BookWithDetails) => void;
  updateBook: (bookId: string, updates: Partial<BookWithDetails>) => void;
  removeBook: (bookId: string) => void;

  // Current book (for reader)
  currentBook: BookWithDetails | null;
  setCurrentBook: (book: BookWithDetails | null) => void;

  // Characters
  characters: Character[];
  setCharacters: (characters: Character[]) => void;
  addCharacter: (character: Character) => void;
  updateCharacter: (characterId: string, updates: Partial<Character>) => void;
  removeCharacter: (characterId: string) => void;

  // Generation progress
  generationProgress: GenerationProgress;
  setGenerationProgress: (progress: GenerationProgress) => void;
  resetGenerationProgress: () => void;

  // UI State
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

const initialGenerationProgress: GenerationProgress = {
  stage: 'idle',
  progress: 0,
  message: '',
};

export const useStore = create<AppState>((set) => ({
  // User
  user: null,
  setUser: (user) => set({ user }),

  // Books
  books: [],
  setBooks: (books) => set({ books }),
  addBook: (book) => set((state) => ({ books: [book, ...state.books] })),
  updateBook: (bookId, updates) =>
    set((state) => ({
      books: state.books.map((b) => (b.id === bookId ? { ...b, ...updates } : b)),
      currentBook: state.currentBook?.id === bookId 
        ? { ...state.currentBook, ...updates } 
        : state.currentBook,
    })),
  removeBook: (bookId) =>
    set((state) => ({
      books: state.books.filter((b) => b.id !== bookId),
      currentBook: state.currentBook?.id === bookId ? null : state.currentBook,
    })),

  // Current book
  currentBook: null,
  setCurrentBook: (book) => set({ currentBook: book }),

  // Characters
  characters: [],
  setCharacters: (characters) => set({ characters }),
  addCharacter: (character) => set((state) => ({ characters: [character, ...state.characters] })),
  updateCharacter: (characterId, updates) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === characterId ? { ...c, ...updates } : c
      ),
    })),
  removeCharacter: (characterId) =>
    set((state) => ({
      characters: state.characters.filter((c) => c.id !== characterId),
    })),

  // Generation progress
  generationProgress: initialGenerationProgress,
  setGenerationProgress: (progress) => set({ generationProgress: progress }),
  resetGenerationProgress: () => set({ generationProgress: initialGenerationProgress }),

  // UI State
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  error: null,
  setError: (error) => set({ error }),
}));

