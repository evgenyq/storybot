import styles from './BookCard.module.css';
import type { BookWithDetails } from '../../shared/types';

interface BookCardProps {
  book: BookWithDetails;
  onClick: () => void;
}

export function BookCard({ book, onClick }: BookCardProps) {
  const chapterCount = book.chapter_count || book.chapters?.length || 0;

  return (
    <button className={styles.card} onClick={onClick}>
      <div className={styles.cover}>
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} className={styles.coverImage} />
        ) : (
          <div className={styles.placeholder}>
            <span className={styles.emoji}>📖</span>
          </div>
        )}
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{book.title}</h3>
        <p className={styles.chapters}>
          {chapterCount === 0
            ? 'Пока нет глав'
            : `${chapterCount} ${getChapterWord(chapterCount)}`}
        </p>
      </div>
    </button>
  );
}

function getChapterWord(count: number): string {
  if (count === 1) return 'глава';
  if (count >= 2 && count <= 4) return 'главы';
  return 'глав';
}

interface NewBookCardProps {
  onClick: () => void;
}

export function NewBookCard({ onClick }: NewBookCardProps) {
  return (
    <button className={`${styles.card} ${styles.newBook}`} onClick={onClick}>
      <div className={styles.cover}>
        <div className={styles.placeholder}>
          <span className={styles.plus}>✨</span>
        </div>
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>Новая книга</h3>
        <p className={styles.chapters}>Создать историю</p>
      </div>
    </button>
  );
}

