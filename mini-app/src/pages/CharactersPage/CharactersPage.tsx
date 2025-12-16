import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './CharactersPage.module.css';
import { CharacterCard, NewCharacterCard } from '../../components/CharacterCard';
import { EmptyState, Loader } from '../../components/ui';
import { useStore } from '../../shared/hooks';
import { getUserCharacters } from '../../shared/api';

export function CharactersPage() {
  const navigate = useNavigate();
  const { user, characters, setCharacters } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCharacters() {
      if (!user) return;
      
      try {
        const userCharacters = await getUserCharacters(user.id);
        setCharacters(userCharacters);
      } catch (error) {
        console.error('Failed to load characters:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCharacters();
  }, [user, setCharacters]);

  const handleCharacterClick = (characterId: string) => {
    navigate(`/character/${characterId}`);
  };

  const handleNewCharacter = () => {
    navigate('/new-character');
  };

  if (loading) {
    return (
      <div className={styles.loaderContainer}>
        <Loader text="Загружаю персонажей..." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Мои персонажи</h1>
        <p className={styles.subtitle}>
          Создавай героев и используй их в любых книжках
        </p>
      </header>

      <main className={styles.content}>
        {characters.length === 0 ? (
          <EmptyState
            icon="👤"
            title="Пока нет персонажей"
            description="Создай своих героев для волшебных историй!"
            action={{
              label: '✨ Создать персонажа',
              onClick: handleNewCharacter,
            }}
          />
        ) : (
          <div className={styles.list}>
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onClick={() => handleCharacterClick(character.id)}
              />
            ))}
            <NewCharacterCard onClick={handleNewCharacter} />
          </div>
        )}
      </main>
    </div>
  );
}

