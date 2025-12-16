import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './NewBookPage.module.css';
import { Button, Input, Textarea } from '../../components/ui';
import { CharacterCard, NewCharacterCard } from '../../components/CharacterCard';
import { useStore, useTelegram } from '../../shared/hooks';
import { createBook, getUserCharacters } from '../../shared/api';

type Step = 'info' | 'characters';

export function NewBookPage() {
  const navigate = useNavigate();
  const { backButton, hapticFeedback } = useTelegram();
  const { user, characters, setCharacters, addBook } = useStore();

  const [step, setStep] = useState<Step>('info');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadingCharacters, setLoadingCharacters] = useState(true);

  useEffect(() => {
    backButton.show(() => {
      if (step === 'characters') {
        setStep('info');
      } else {
        navigate('/');
      }
    });

    return () => {
      backButton.hide();
    };
  }, [backButton, navigate, step]);

  useEffect(() => {
    async function loadCharacters() {
      if (!user) return;
      
      try {
        const userCharacters = await getUserCharacters(user.id);
        setCharacters(userCharacters);
      } catch (error) {
        console.error('Failed to load characters:', error);
      } finally {
        setLoadingCharacters(false);
      }
    }

    loadCharacters();
  }, [user, setCharacters]);

  const handleNextStep = () => {
    if (!title.trim()) {
      hapticFeedback.warning();
      return;
    }
    hapticFeedback.light();
    setStep('characters');
  };

  const toggleCharacter = (characterId: string) => {
    hapticFeedback.selection();
    setSelectedCharacters(prev => 
      prev.includes(characterId)
        ? prev.filter(id => id !== characterId)
        : [...prev, characterId]
    );
  };

  const handleCreate = async () => {
    if (!user || !title.trim()) return;

    setCreating(true);
    hapticFeedback.medium();

    try {
      const book = await createBook(
        user.id,
        title.trim(),
        description.trim(),
        selectedCharacters
      );

      addBook({
        ...book,
        chapters: [],
        characters: characters.filter(c => selectedCharacters.includes(c.id)),
        chapter_count: 0,
      });

      hapticFeedback.success();
      navigate(`/book/${book.id}`);
    } catch (error) {
      console.error('Failed to create book:', error);
      hapticFeedback.error();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Новая книга</h1>
        <div className={styles.steps}>
          <span className={`${styles.step} ${step === 'info' ? styles.active : ''}`}>1</span>
          <span className={styles.stepLine} />
          <span className={`${styles.step} ${step === 'characters' ? styles.active : ''}`}>2</span>
        </div>
      </header>

      <main className={styles.content}>
        {step === 'info' ? (
          <div className={styles.form}>
            <Input
              label="Название книги"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Приключения кота Мурзика"
            />

            <Textarea
              label="О чём будет книга? (необязательно)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="История о смелом котике, который отправляется в волшебный лес..."
              rows={4}
            />
          </div>
        ) : (
          <div className={styles.charactersStep}>
            <p className={styles.charactersHint}>
              Выбери персонажей для этой книги
            </p>
            
            {loadingCharacters ? (
              <p className={styles.loading}>Загружаю персонажей...</p>
            ) : characters.length === 0 ? (
              <div className={styles.noCharacters}>
                <p>У тебя пока нет персонажей</p>
                <Button 
                  variant="secondary" 
                  onClick={() => navigate('/new-character')}
                >
                  Создать персонажа
                </Button>
              </div>
            ) : (
              <div className={styles.charactersList}>
                {characters.map((character) => (
                  <CharacterCard
                    key={character.id}
                    character={character}
                    selectable
                    selected={selectedCharacters.includes(character.id)}
                    onClick={() => toggleCharacter(character.id)}
                  />
                ))}
                <NewCharacterCard onClick={() => navigate('/new-character')} />
              </div>
            )}

            {selectedCharacters.length > 0 && (
              <p className={styles.selectedCount}>
                Выбрано: {selectedCharacters.length}
              </p>
            )}
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        {step === 'info' ? (
          <Button
            size="lg"
            fullWidth
            onClick={handleNextStep}
            disabled={!title.trim()}
          >
            Далее →
          </Button>
        ) : (
          <Button
            size="lg"
            fullWidth
            onClick={handleCreate}
            loading={creating}
            disabled={selectedCharacters.length === 0}
          >
            ✨ Создать книгу
          </Button>
        )}
      </footer>
    </div>
  );
}

