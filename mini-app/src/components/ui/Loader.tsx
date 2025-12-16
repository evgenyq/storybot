import styles from './Loader.module.css';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export function Loader({ size = 'md', text }: LoaderProps) {
  return (
    <div className={styles.container}>
      <div className={`${styles.spinner} ${styles[size]}`}>
        <div className={styles.dot} />
        <div className={styles.dot} />
        <div className={styles.dot} />
      </div>
      {text && <p className={styles.text}>{text}</p>}
    </div>
  );
}

export function FullPageLoader({ text }: { text?: string }) {
  return (
    <div className={styles.fullPage}>
      <Loader size="lg" text={text} />
    </div>
  );
}

