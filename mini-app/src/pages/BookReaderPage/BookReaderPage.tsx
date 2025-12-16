import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './BookReaderPage.module.css';
import { Button, Loader } from '../../components/ui';
import { GenerationProgress } from '../../components/GenerationProgress';
import { useStore, useTelegram } from '../../shared/hooks';
import { getBook, generateChapter } from '../../shared/api';
import type { ChapterWithIllustrations } from '../../shared/types';

export function BookReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { backButton, hapticFeedback } = useTelegram();
  const { currentBook, setCurrentBook, generationProgress, setGenerationProgress, resetGenerationProgress } = useStore();
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Show back button
    backButton.show(() => {
      navigate('/');
    });

    return () => {
      backButton.hide();
    };
  }, [backButton, navigate]);

  useEffect(() => {
    async function loadBook() {
      if (!bookId) return;
      
      try {
        const book = await getBook(bookId);
        setCurrentBook(book);
      } catch (error) {
        console.error('Failed to load book:', error);
      } finally {
        setLoading(false);
      }
    }

    loadBook();
  }, [bookId, setCurrentBook]);

  const handleContinueStory = async () => {
    navigate(`/book/${bookId}/new-chapter`);
  };

  const handleGenerateAuto = async () => {
    if (!bookId) return;
    
    hapticFeedback.medium();
    
    try {
      setGenerationProgress({
        stage: 'generating_text',
        progress: 20,
        message: 'Придумываю продолжение...',
      });

      await generateChapter(bookId);

      setGenerationProgress({
        stage: 'generating_images',
        progress: 70,
        message: 'Рисую картинки...',
      });

      // Reload book to get new chapter
      const updatedBook = await getBook(bookId);
      setCurrentBook(updatedBook);

      setGenerationProgress({
        stage: 'complete',
        progress: 100,
        message: 'Готово!',
      });

      hapticFeedback.success();

      setTimeout(() => {
        resetGenerationProgress();
      }, 1500);

    } catch (error) {
      console.error('Failed to generate chapter:', error);
      hapticFeedback.error();
      setGenerationProgress({
        stage: 'error',
        progress: 0,
        message: 'Что-то пошло не так. Попробуй ещё раз!',
      });

      setTimeout(() => {
        resetGenerationProgress();
      }, 3000);
    }
  };

  if (loading) {
    return (
      <div className={styles.loaderContainer}>
        <Loader text="Открываю книгу..." />
      </div>
    );
  }

  if (!currentBook) {
    return (
      <div className={styles.errorContainer}>
        <p>Книга не найдена</p>
        <Button onClick={() => navigate('/')}>На главную</Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <GenerationProgress progress={generationProgress} />

      <header className={styles.header}>
        <h1 className={styles.title}>{currentBook.title}</h1>
        {currentBook.description && (
          <p className={styles.description}>{currentBook.description}</p>
        )}
      </header>

      <main className={styles.content}>
        {currentBook.chapters.length === 0 ? (
          <div className={styles.emptyChapters}>
            <span className={styles.emptyIcon}>📖</span>
            <p>Книга ещё пустая. Начни свою историю!</p>
          </div>
        ) : (
          <div className={styles.chapters}>
            {currentBook.chapters.map((chapter) => (
              <ChapterContent key={chapter.id} chapter={chapter} />
            ))}
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.actions}>
          <Button 
            size="lg" 
            fullWidth 
            onClick={handleGenerateAuto}
            disabled={generationProgress.stage !== 'idle'}
          >
            ✨ Следующая глава
          </Button>
          <Button 
            variant="secondary" 
            size="lg" 
            fullWidth 
            onClick={handleContinueStory}
            disabled={generationProgress.stage !== 'idle'}
          >
            💬 Дать подсказку
          </Button>
        </div>
      </footer>
    </div>
  );
}

// Clean markdown and extract content without title duplication
function cleanChapterContent(content: string): string[] {
  let text = content;
  
  // Remove markdown bold **text**
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  
  // Remove markdown headers ## or ###
  text = text.replace(/^#{1,3}\s+/gm, '');
  
  // Split into paragraphs
  const paragraphs = text.split('\n').filter(p => p.trim());
  
  // Remove first paragraph if it looks like a chapter title
  if (paragraphs.length > 0) {
    const firstPara = paragraphs[0].toLowerCase();
    if (firstPara.includes('глава') && firstPara.length < 100) {
      paragraphs.shift();
    }
  }
  
  return paragraphs;
}

function ChapterContent({ chapter }: { chapter: ChapterWithIllustrations }) {
  const paragraphs = cleanChapterContent(chapter.content);
  
  return (
    <article className={styles.chapter}>
      <h2 className={styles.chapterTitle}>
        {chapter.title || `Глава ${chapter.chapter_number}`}
      </h2>
      
      {chapter.illustrations?.[0] && (
        <div className={styles.illustration}>
          <img 
            src={chapter.illustrations[0].image_url} 
            alt={`Иллюстрация к главе ${chapter.chapter_number}`}
            className={styles.illustrationImage}
          />
        </div>
      )}

      <div className={styles.chapterText}>
        {paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {chapter.illustrations?.slice(1).map((illustration, i) => (
        <div key={illustration.id} className={styles.illustration}>
          <img 
            src={illustration.image_url} 
            alt={`Иллюстрация ${i + 2}`}
            className={styles.illustrationImage}
          />
        </div>
      ))}
    </article>
  );
}

