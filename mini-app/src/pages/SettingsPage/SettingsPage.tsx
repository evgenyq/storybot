import { useState } from 'react';
import styles from './SettingsPage.module.css';
import { Button, Card } from '../../components/ui';
import { useStore, useTelegram } from '../../shared/hooks';
import { updateUserSettings } from '../../shared/api';

const CHAPTER_SIZES = [
  { value: 300, label: 'Короткая', description: '~300 слов' },
  { value: 500, label: 'Средняя', description: '~500 слов' },
  { value: 800, label: 'Длинная', description: '~800 слов' },
];

const IMAGE_COUNTS = [1, 2, 3];

export function SettingsPage() {
  const { user, setUser } = useStore();
  const { hapticFeedback } = useTelegram();
  
  const [chapterSize, setChapterSize] = useState(user?.settings?.chapter_size || 500);
  const [imagesPerChapter, setImagesPerChapter] = useState(user?.settings?.images_per_chapter || 2);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    hapticFeedback.light();

    try {
      const updatedUser = await updateUserSettings(user.id, {
        chapter_size: chapterSize,
        images_per_chapter: imagesPerChapter,
      });
      setUser(updatedUser);
      hapticFeedback.success();
    } catch (error) {
      console.error('Failed to save settings:', error);
      hapticFeedback.error();
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = 
    chapterSize !== user?.settings?.chapter_size ||
    imagesPerChapter !== user?.settings?.images_per_chapter;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Настройки</h1>
      </header>

      <main className={styles.content}>
        <Card padding="lg" className={styles.section}>
          <h2 className={styles.sectionTitle}>📏 Длина главы</h2>
          <p className={styles.sectionDescription}>
            Насколько длинными будут новые главы
          </p>
          
          <div className={styles.options}>
            {CHAPTER_SIZES.map((size) => (
              <button
                key={size.value}
                className={`${styles.option} ${chapterSize === size.value ? styles.selected : ''}`}
                onClick={() => {
                  setChapterSize(size.value);
                  hapticFeedback.selection();
                }}
              >
                <span className={styles.optionLabel}>{size.label}</span>
                <span className={styles.optionDescription}>{size.description}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card padding="lg" className={styles.section}>
          <h2 className={styles.sectionTitle}>🎨 Картинок на главу</h2>
          <p className={styles.sectionDescription}>
            Сколько иллюстраций создавать для каждой главы
          </p>
          
          <div className={styles.imageOptions}>
            {IMAGE_COUNTS.map((count) => (
              <button
                key={count}
                className={`${styles.imageOption} ${imagesPerChapter === count ? styles.selected : ''}`}
                onClick={() => {
                  setImagesPerChapter(count);
                  hapticFeedback.selection();
                }}
              >
                {count}
              </button>
            ))}
          </div>
        </Card>

        {hasChanges && (
          <div className={styles.saveSection}>
            <Button
              size="lg"
              fullWidth
              onClick={handleSave}
              loading={saving}
            >
              Сохранить настройки
            </Button>
          </div>
        )}

        <Card padding="lg" className={styles.section}>
          <h2 className={styles.sectionTitle}>ℹ️ О приложении</h2>
          <p className={styles.aboutText}>
            StoryBot — создавай волшебные истории вместе с ИИ!
          </p>
          <p className={styles.version}>Версия 1.0.0</p>
        </Card>
      </main>
    </div>
  );
}

