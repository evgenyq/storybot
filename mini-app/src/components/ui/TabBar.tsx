import { useLocation, useNavigate } from 'react-router-dom';
import styles from './TabBar.module.css';

interface TabItem {
  path: string;
  label: string;
  icon: string;
}

const tabs: TabItem[] = [
  { path: '/', label: 'Книги', icon: '📚' },
  { path: '/characters', label: 'Персонажи', icon: '👤' },
  { path: '/settings', label: 'Настройки', icon: '⚙️' },
];

export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide tab bar on reader page
  if (location.pathname.startsWith('/book/')) {
    return null;
  }

  return (
    <nav className={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        
        return (
          <button
            key={tab.path}
            className={`${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <span className={styles.icon}>{tab.icon}</span>
            <span className={styles.label}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

