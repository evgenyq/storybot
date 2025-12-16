import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './NewCharacterPage.module.css';
import { Button, Input, Textarea } from '../../components/ui';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import { useStore, useTelegram } from '../../shared/hooks';
import { createCharacter, generateCharacterImage, transcribeVoice } from '../../shared/api';

export function NewCharacterPage() {
  const navigate = useNavigate();
  const { backButton, hapticFeedback } = useTelegram();
  const { user, addCharacter } = useStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    backButton.show(() => {
      navigate(-1);
    });

    return () => {
      backButton.hide();
    };
  }, [backButton, navigate]);

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    hapticFeedback.light();

    try {
      const text = await transcribeVoice(audioBlob);
      setDescription(prev => prev ? `${prev} ${text}` : text);
      hapticFeedback.success();
    } catch (error) {
      console.error('Transcription failed:', error);
      hapticFeedback.error();
      alert('Не удалось распознать речь');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleCreate = async () => {
    if (!user || !name.trim() || !description.trim()) return;

    setCreating(true);
    hapticFeedback.medium();

    try {
      // Create character
      const character = await createCharacter(
        user.id,
        name.trim(),
        description.trim()
      );

      // Start generating image in background
      generateCharacterImage(character.id, name.trim(), description.trim())
        .catch(err => console.error('Failed to generate character image:', err));

      addCharacter(character);
      hapticFeedback.success();
      navigate('/characters');
    } catch (error) {
      console.error('Failed to create character:', error);
      hapticFeedback.error();
    } finally {
      setCreating(false);
    }
  };

  const isValid = name.trim() && description.trim();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Новый персонаж</h1>
        <p className={styles.subtitle}>
          Создай героя для своих историй
        </p>
      </header>

      <main className={styles.content}>
        <div className={styles.form}>
          <Input
            label="Имя персонажа"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Кот Мурзик"
          />

          <div className={styles.descriptionSection}>
            <Textarea
              label="Опиши персонажа"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Рыжий пушистый кот с зелёными глазами. Очень смелый и любопытный, всегда готов к приключениям..."
              rows={5}
            />

            <div className={styles.voiceSection}>
              <span className={styles.voiceLabel}>или расскажи голосом:</span>
              <VoiceRecorder 
                onRecordingComplete={handleRecordingComplete}
                disabled={isTranscribing || creating}
              />
              {isTranscribing && (
                <p className={styles.transcribingText}>Распознаю...</p>
              )}
            </div>
          </div>
        </div>

        <div className={styles.tips}>
          <p className={styles.tipsTitle}>💡 Подсказки для описания:</p>
          <ul className={styles.tipsList}>
            <li>Как выглядит? (цвет, размер, особенности)</li>
            <li>Какой характер? (смелый, добрый, весёлый)</li>
            <li>Что любит делать?</li>
          </ul>
        </div>
      </main>

      <footer className={styles.footer}>
        <Button
          size="lg"
          fullWidth
          onClick={handleCreate}
          loading={creating}
          disabled={!isValid}
        >
          ✨ Создать персонажа
        </Button>
      </footer>
    </div>
  );
}

