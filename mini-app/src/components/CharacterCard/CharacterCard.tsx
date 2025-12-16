import styles from './CharacterCard.module.css';
import type { Character } from '../../shared/types';

interface CharacterCardProps {
  character: Character;
  onClick?: () => void;
  selected?: boolean;
  selectable?: boolean;
}

export function CharacterCard({ 
  character, 
  onClick, 
  selected = false,
  selectable = false 
}: CharacterCardProps) {
  return (
    <button 
      className={`
        ${styles.card} 
        ${selectable ? styles.selectable : ''}
        ${selected ? styles.selected : ''}
      `}
      onClick={onClick}
      type="button"
    >
      <div className={styles.avatar}>
        {character.image_url ? (
          <img src={character.image_url} alt={character.name} className={styles.image} />
        ) : (
          <div className={styles.placeholder}>
            <span>{getInitials(character.name)}</span>
          </div>
        )}
        {selectable && (
          <div className={styles.checkbox}>
            {selected && <span>✓</span>}
          </div>
        )}
      </div>
      <div className={styles.info}>
        <h4 className={styles.name}>{character.name}</h4>
        {character.description && (
          <p className={styles.description}>{character.description}</p>
        )}
      </div>
    </button>
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

interface NewCharacterCardProps {
  onClick: () => void;
}

export function NewCharacterCard({ onClick }: NewCharacterCardProps) {
  return (
    <button className={`${styles.card} ${styles.newCharacter}`} onClick={onClick}>
      <div className={styles.avatar}>
        <div className={styles.placeholder}>
          <span className={styles.plus}>+</span>
        </div>
      </div>
      <div className={styles.info}>
        <h4 className={styles.name}>Новый персонаж</h4>
        <p className={styles.description}>Создать героя</p>
      </div>
    </button>
  );
}

