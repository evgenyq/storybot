import styles from './GenerationProgress.module.css';
import type { GenerationProgress as ProgressType } from '../../shared/types';

interface GenerationProgressProps {
  progress: ProgressType;
}

export function GenerationProgress({ progress }: GenerationProgressProps) {
  if (progress.stage === 'idle') {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.animation}>
          {progress.stage === 'generating_text' && (
            <span className={styles.emoji}>✍️</span>
          )}
          {progress.stage === 'generating_images' && (
            <span className={styles.emoji}>🎨</span>
          )}
          {progress.stage === 'complete' && (
            <span className={styles.emoji}>✨</span>
          )}
          {progress.stage === 'error' && (
            <span className={styles.emoji}>😔</span>
          )}
        </div>

        <h2 className={styles.title}>
          {progress.stage === 'generating_text' && 'Пишу историю...'}
          {progress.stage === 'generating_images' && 'Рисую картинки...'}
          {progress.stage === 'complete' && 'Готово!'}
          {progress.stage === 'error' && 'Упс!'}
        </h2>

        {progress.message && (
          <p className={styles.message}>{progress.message}</p>
        )}

        {(progress.stage === 'generating_text' || progress.stage === 'generating_images') && (
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        )}

        <div className={styles.hint}>
          {progress.stage !== 'error' && progress.stage !== 'complete' && (
            <p>Это займёт несколько секунд...</p>
          )}
        </div>
      </div>
    </div>
  );
}

