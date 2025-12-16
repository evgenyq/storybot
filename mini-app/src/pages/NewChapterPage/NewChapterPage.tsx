import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './NewChapterPage.module.css';
import { Button, Textarea } from '../../components/ui';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { GenerationProgress } from '../../components/GenerationProgress';
import { useStore, useTelegram } from '../../shared/hooks';
import { generateChapter, transcribeVoice, getBook } from '../../shared/api';

export function NewChapterPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { backButton, hapticFeedback } = useTelegram();
  const { currentBook, setCurrentBook, generationProgress, setGenerationProgress, resetGenerationProgress } = useStore();
  
  const [hint, setHint] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Back button
  useState(() => {
    backButton.show(() => {
      navigate(`/book/${bookId}`);
    });

    return () => {
      backButton.hide();
    };
  });

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    hapticFeedback.light();

    try {
      const text = await transcribeVoice(audioBlob);
      setHint(prev => prev ? `${prev} ${text}` : text);
      hapticFeedback.success();
    } catch (error) {
      console.error('Transcription failed:', error);
      hapticFeedback.error();
      alert('Не удалось распознать речь. Попробуй ещё раз!');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerate = async () => {
    if (!bookId) return;

    hapticFeedback.medium();

    try {
      setGenerationProgress({
        stage: 'generating_text',
        progress: 20,
        message: hint ? 'Пишу по твоей подсказке...' : 'Придумываю продолжение...',
      });

      await generateChapter(bookId, hint || undefined);

      setGenerationProgress({
        stage: 'generating_images',
        progress: 70,
        message: 'Рисую картинки...',
      });

      // Reload book
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
        navigate(`/book/${bookId}`);
      }, 1500);

    } catch (error) {
      console.error('Failed to generate:', error);
      hapticFeedback.error();
      
      setGenerationProgress({
        stage: 'error',
        progress: 0,
        message: 'Что-то пошло не так...',
      });

      setTimeout(() => {
        resetGenerationProgress();
      }, 3000);
    }
  };

  const suggestions = [
    'Герои находят клад',
    'Появляется новый друг',
    'Начинается шторм',
    'Кто-то заблудился',
    'Волшебный предмет',
  ];

  return (
    <div className={styles.page}>
      <GenerationProgress progress={generationProgress} />

      <header className={styles.header}>
        <h1 className={styles.title}>Новая глава</h1>
        <p className={styles.subtitle}>
          {currentBook?.title || 'Загрузка...'}
        </p>
      </header>

      <main className={styles.content}>
        <div className={styles.inputSection}>
          <label className={styles.label}>
            Что произойдёт дальше?
          </label>
          
          <Textarea
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Напиши или расскажи голосом..."
            rows={4}
            disabled={generationProgress.stage !== 'idle'}
          />

          <div className={styles.voiceSection}>
            <VoiceRecorder 
              onRecordingComplete={handleRecordingComplete}
              disabled={isTranscribing || generationProgress.stage !== 'idle'}
            />
            {isTranscribing && (
              <p className={styles.transcribingText}>Распознаю речь...</p>
            )}
          </div>
        </div>

        <div className={styles.suggestions}>
          <p className={styles.suggestionsLabel}>💡 Подсказки:</p>
          <div className={styles.suggestionsList}>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                className={styles.suggestionChip}
                onClick={() => setHint(suggestion)}
                disabled={generationProgress.stage !== 'idle'}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <Button
          size="lg"
          fullWidth
          onClick={handleGenerate}
          disabled={generationProgress.stage !== 'idle'}
        >
          {hint ? '✨ Создать с подсказкой' : '✨ Создать сюрприз'}
        </Button>
      </footer>
    </div>
  );
}

