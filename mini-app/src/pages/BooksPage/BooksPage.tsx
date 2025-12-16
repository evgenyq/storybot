import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './BooksPage.module.css';
import { BookCard, NewBookCard } from '../../components/BookCard';
import { EmptyState, Loader } from '../../components/ui';
import { useStore } from '../../shared/hooks';
import { getUserBooks } from '../../shared/api';

export function BooksPage() {
  const navigate = useNavigate();
  const { user, books, setBooks } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBooks() {
      if (!user) return;
      
      try {
        const userBooks = await getUserBooks(user.id);
        setBooks(userBooks);
      } catch (error) {
        console.error('Failed to load books:', error);
      } finally {
        setLoading(false);
      }
    }

    loadBooks();
  }, [user, setBooks]);

  const handleBookClick = (bookId: string) => {
    navigate(`/book/${bookId}`);
  };

  const handleNewBook = () => {
    navigate('/new-book');
  };

  if (loading) {
    return (
      <div className={styles.loaderContainer}>
        <Loader text="Загружаю книжки..." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Мои книжки</h1>
      </header>

      <main className={styles.content}>
        {books.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Пока нет книжек"
            description="Создай свою первую волшебную историю!"
            action={{
              label: '✨ Создать книгу',
              onClick: handleNewBook,
            }}
          />
        ) : (
          <div className={styles.grid}>
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onClick={() => handleBookClick(book.id)}
              />
            ))}
            <NewBookCard onClick={handleNewBook} />
          </div>
        )}
      </main>
    </div>
  );
}

