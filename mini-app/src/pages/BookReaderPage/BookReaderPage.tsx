import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './BookReaderPage.module.css';
import { Button, Loader } from '../../components/ui';
import { GenerationProgress } from '../../components/GenerationProgress';
import { useStore, useTelegram } from '../../shared/hooks';
import { getBook, generateChapter, generateIllustration } from '../../shared/api';
import type { ChapterWithIllustrations, Illustration, PendingIllustration } from '../../shared/types';

export function BookReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { backButton, hapticFeedback } = useTelegram();
  const { currentBook, setCurrentBook, generationProgress, setGenerationProgress, resetGenerationProgress } = useStore();
  
  const [loading, setLoading] = useState(true);
  // Track illustrations being generated
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());

  useEffect(() => {
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
        
        // Check for any pending illustrations and start generating them
        if (book) {
          for (const chapter of book.chapters) {
            for (const ill of chapter.illustrations || []) {
              if (ill.status === 'pending' || ill.status === 'generating') {
                startIllustrationGeneration(ill.id, chapter.id, ill.position === 0);
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load book:', error);
      } finally {
        setLoading(false);
      }
    }

    loadBook();
  }, [bookId, setCurrentBook]);

  // Start generating an illustration in background
  const startIllustrationGeneration = useCallback(async (
    illustrationId: string, 
    _chapterId: string,
    setAsCover: boolean = false
  ) => {
    // Skip if already generating
    if (generatingIllustrations.has(illustrationId)) return;
    
    setGeneratingIllustrations(prev => new Set(prev).add(illustrationId));
    
    try {
      console.log(`Starting generation for illustration ${illustrationId}`);
      const result = await generateIllustration(illustrationId, setAsCover);
      
      if (result?.illustration && bookId) {
        // Reload book to get fresh state (avoids stale closure issues)
        const freshBook = await getBook(bookId);
        setCurrentBook(freshBook);
        hapticFeedback.light();
      }
    } catch (error) {
      console.error(`Failed to generate illustration ${illustrationId}:`, error);
    } finally {
      setGeneratingIllustrations(prev => {
        const next = new Set(prev);
        next.delete(illustrationId);
        return next;
      });
    }
  }, [generatingIllustrations, setCurrentBook, hapticFeedback, bookId]);

  const handleContinueStory = async () => {
    navigate(`/book/${bookId}/new-chapter`);
  };

  const handleGenerateAuto = async () => {
    if (!bookId) return;
    
    hapticFeedback.medium();
    
    try {
      setGenerationProgress({
        stage: 'generating_text',
        progress: 30,
        message: 'Придумываю продолжение...',
      });

      const result = await generateChapter(bookId);
      
      // Text is ready! Show it immediately
      setGenerationProgress({
        stage: 'generating_images',
        progress: 50,
        message: 'Текст готов! Рисую картинки...',
      });

      // Reload book to get new chapter with placeholders
      const updatedBook = await getBook(bookId);
      setCurrentBook(updatedBook);

      // Start generating illustrations in background
      const pendingIlls: PendingIllustration[] = result.pending_illustrations || [];
      const needsCover = result.needs_cover;
      
      for (let i = 0; i < pendingIlls.length; i++) {
        const ill = pendingIlls[i];
        // First illustration might be cover
        startIllustrationGeneration(ill.id, result.chapter.id, needsCover && i === 0);
      }

      setGenerationProgress({
        stage: 'complete',
        progress: 100,
        message: 'Глава готова! Картинки загружаются...',
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
              <ChapterContent 
                key={chapter.id} 
                chapter={chapter}
                generatingIds={generatingIllustrations}
              />
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

// Parse chapter content and render with illustrations in correct positions
function ChapterContent({ 
  chapter, 
  generatingIds 
}: { 
  chapter: ChapterWithIllustrations;
  generatingIds: Set<string>;
}) {
  const content = chapter.content;
  const illustrations = chapter.illustrations || [];
  
  // Create a map of position -> illustration
  const illustrationMap = new Map<number, Illustration>();
  for (const ill of illustrations) {
    illustrationMap.set(ill.position, ill);
  }
  
  // Split content by [IMG:N] placeholders
  const parts: Array<{ type: 'text' | 'image'; content?: string; position?: number }> = [];
  const imgRegex = /\[IMG:(\d+)\]/g;
  let lastIndex = 0;
  let match;
  
  while ((match = imgRegex.exec(content)) !== null) {
    // Add text before the placeholder
    if (match.index > lastIndex) {
      parts.push({ 
        type: 'text', 
        content: content.slice(lastIndex, match.index) 
      });
    }
    
    // Add image placeholder
    parts.push({ 
      type: 'image', 
      position: parseInt(match[1], 10) 
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ 
      type: 'text', 
      content: content.slice(lastIndex) 
    });
  }
  
  // If no placeholders found, just render text with illustrations at end (fallback)
  if (parts.length === 0) {
    parts.push({ type: 'text', content });
    for (let i = 0; i < illustrations.length; i++) {
      parts.push({ type: 'image', position: i });
    }
  }
  
  return (
    <article className={styles.chapter}>
      <h2 className={styles.chapterTitle}>
        {chapter.title || `Глава ${chapter.chapter_number}`}
      </h2>
      
      {parts.map((part, i) => {
        if (part.type === 'text' && part.content) {
          return <TextContent key={i} text={part.content} />;
        }
        
        if (part.type === 'image' && part.position !== undefined) {
          const illustration = illustrationMap.get(part.position);
          return (
            <IllustrationContent 
              key={`img-${part.position}`}
              illustration={illustration}
              isGenerating={illustration ? generatingIds.has(illustration.id) : false}
              chapterNumber={chapter.chapter_number}
            />
          );
        }
        
        return null;
      })}
    </article>
  );
}

// Render text content with markdown cleanup
function TextContent({ text }: { text: string }) {
  // Clean markdown
  let cleaned = text
    .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold
    .replace(/^#{1,3}\s+/gm, '');      // Remove headers
  
  // Split into paragraphs
  const paragraphs = cleaned.split('\n').filter(p => p.trim());
  
  // Remove first paragraph if it looks like chapter title
  if (paragraphs.length > 0) {
    const first = paragraphs[0].toLowerCase();
    if (first.includes('глава') && first.length < 100) {
      paragraphs.shift();
    }
  }
  
  return (
    <div className={styles.chapterText}>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

// Render illustration or placeholder
function IllustrationContent({ 
  illustration, 
  isGenerating,
  chapterNumber,
}: { 
  illustration?: Illustration;
  isGenerating: boolean;
  chapterNumber: number;
}) {
  const status = illustration?.status || 'pending';
  const imageUrl = illustration?.image_url;
  
  // Show image if ready
  if (status === 'ready' && imageUrl) {
    return (
      <div className={styles.illustration}>
        <img 
          src={imageUrl} 
          alt={`Иллюстрация к главе ${chapterNumber}`}
          className={styles.illustrationImage}
        />
      </div>
    );
  }
  
  // Show placeholder with animation
  return (
    <div className={`${styles.illustration} ${styles.illustrationPlaceholder}`}>
      <div className={styles.placeholderContent}>
        <div className={styles.placeholderAnimation}>
          <span className={styles.placeholderEmoji}>🎨</span>
        </div>
        <p className={styles.placeholderText}>
          {isGenerating || status === 'generating' 
            ? 'Рисую картинку...' 
            : status === 'error'
            ? 'Не удалось нарисовать'
            : 'Скоро здесь будет картинка'}
        </p>
      </div>
    </div>
  );
}
