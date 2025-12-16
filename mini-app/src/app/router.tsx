import { Routes, Route } from 'react-router-dom';
import { BooksPage } from '../pages/BooksPage';
import { BookReaderPage } from '../pages/BookReaderPage';
import { NewBookPage } from '../pages/NewBookPage';
import { NewChapterPage } from '../pages/NewChapterPage';
import { CharactersPage } from '../pages/CharactersPage';
import { CharacterDetailPage } from '../pages/CharacterDetailPage';
import { NewCharacterPage } from '../pages/NewCharacterPage';
import { SettingsPage } from '../pages/SettingsPage';

export function AppRouter() {
  return (
    <Routes>
      {/* Books */}
      <Route path="/" element={<BooksPage />} />
      <Route path="/new-book" element={<NewBookPage />} />
      <Route path="/book/:bookId" element={<BookReaderPage />} />
      <Route path="/book/:bookId/new-chapter" element={<NewChapterPage />} />

      {/* Characters */}
      <Route path="/characters" element={<CharactersPage />} />
      <Route path="/character/:characterId" element={<CharacterDetailPage />} />
      <Route path="/new-character" element={<NewCharacterPage />} />

      {/* Settings */}
      <Route path="/settings" element={<SettingsPage />} />

      {/* Fallback */}
      <Route path="*" element={<BooksPage />} />
    </Routes>
  );
}

