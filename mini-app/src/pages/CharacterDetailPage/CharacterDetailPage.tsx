import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './CharacterDetailPage.module.css';
import { Button, Input, Textarea, Loader } from '../../components/ui';
import { useStore, useTelegram } from '../../shared/hooks';
import { 
  getUserCharacters, 
  deleteCharacter, 
  generateCharacterImage 
} from '../../shared/api';
import { supabase } from '../../shared/api/supabase';
import type { Character } from '../../shared/types';

export function CharacterDetailPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();
  const { backButton, hapticFeedback, showConfirm } = useTelegram();
  const { user, characters, setCharacters } = useStore();

  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    backButton.show(() => {
      navigate('/characters');
    });

    return () => {
      backButton.hide();
    };
  }, [backButton, navigate]);

  useEffect(() => {
    // Find character in store or load it
    const found = characters.find(c => c.id === characterId);
    if (found) {
      setCharacter(found);
      setName(found.name);
      setDescription(found.description || '');
      setLoading(false);
    } else if (user) {
      // Load from API
      getUserCharacters(user.id).then(chars => {
        setCharacters(chars);
        const char = chars.find(c => c.id === characterId);
        if (char) {
          setCharacter(char);
          setName(char.name);
          setDescription(char.description || '');
        }
        setLoading(false);
      });
    }
  }, [characterId, characters, user, setCharacters]);

  const handleSave = async () => {
    if (!characterId || !name.trim()) return;

    setSaving(true);
    hapticFeedback.medium();

    try {
      const { error } = await supabase
        .from('characters')
        .update({
          name: name.trim(),
          description: description.trim(),
        })
        .eq('id', characterId);

      if (error) throw error;

      // Update local state
      const updatedChar = { ...character!, name: name.trim(), description: description.trim() };
      setCharacter(updatedChar);
      setCharacters(characters.map(c => c.id === characterId ? updatedChar : c));

      hapticFeedback.success();
    } catch (error) {
      console.error('Failed to save character:', error);
      hapticFeedback.error();
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateImage = async () => {
    if (!characterId || !character) return;

    setRegenerating(true);
    hapticFeedback.medium();

    try {
      const result = await generateCharacterImage(characterId, name, description);
      
      if (result.image_url) {
        // Add cache-busting timestamp to force reload
        const imageUrlWithCacheBust = `${result.image_url}?t=${Date.now()}`;
        const updatedChar = { ...character, image_url: imageUrlWithCacheBust };
        setCharacter(updatedChar);
        setCharacters(characters.map(c => c.id === characterId ? updatedChar : c));
        hapticFeedback.success();
      }
    } catch (error) {
      console.error('Failed to regenerate image:', error);
      hapticFeedback.error();
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!characterId) return;

    const confirmed = await showConfirm(
      'Удалить персонажа?',
      'Это действие нельзя отменить. Персонаж будет удалён из всех книг.'
    );

    if (!confirmed) return;

    setDeleting(true);
    hapticFeedback.medium();

    try {
      await deleteCharacter(characterId);
      setCharacters(characters.filter(c => c.id !== characterId));
      hapticFeedback.success();
      navigate('/characters');
    } catch (error) {
      console.error('Failed to delete character:', error);
      hapticFeedback.error();
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loaderContainer}>
        <Loader text="Загружаю персонажа..." />
      </div>
    );
  }

  if (!character) {
    return (
      <div className={styles.errorContainer}>
        <p>Персонаж не найден</p>
        <Button onClick={() => navigate('/characters')}>К персонажам</Button>
      </div>
    );
  }

  const hasChanges = name !== character.name || description !== (character.description || '');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.avatarSection}>
          <div className={styles.avatar}>
            {character.image_url ? (
              <img src={character.image_url} alt={character.name} className={styles.image} />
            ) : (
              <div className={styles.placeholder}>
                <span>{getInitials(character.name)}</span>
              </div>
            )}
          </div>
          <button 
            className={styles.regenerateButton}
            onClick={handleRegenerateImage}
            disabled={regenerating}
          >
            {regenerating ? '🔄' : '🎨'} {regenerating ? 'Генерирую...' : 'Новая картинка'}
          </button>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.form}>
          <Input
            label="Имя персонажа"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя"
          />

          <Textarea
            label="Описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опиши внешность, характер, особенности..."
            rows={5}
          />
        </div>
      </main>

      <footer className={styles.footer}>
        <Button
          size="lg"
          fullWidth
          onClick={handleSave}
          loading={saving}
          disabled={!hasChanges || !name.trim()}
        >
          💾 Сохранить
        </Button>
        
        <Button
          variant="danger"
          size="lg"
          fullWidth
          onClick={handleDelete}
          loading={deleting}
        >
          🗑️ Удалить персонажа
        </Button>
      </footer>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

