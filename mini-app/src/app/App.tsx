import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './router';
import { TabBar } from '../components/ui';
import { FullPageLoader } from '../components/ui/Loader';
import { useTelegram, useStore } from '../shared/hooks';
import { getOrCreateUser } from '../shared/api';
import '../styles/global.css';

export function App() {
  const { isReady, user: telegramUser } = useTelegram();
  const { setUser } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initUser() {
      if (!isReady || !telegramUser) return;

      try {
        const dbUser = await getOrCreateUser(telegramUser.id, {
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
        });
        setUser(dbUser);
      } catch (err) {
        console.error('Failed to initialize user:', err);
        setError('Не удалось загрузить данные. Попробуй перезапустить приложение.');
      } finally {
        setLoading(false);
      }
    }

    initUser();
  }, [isReady, telegramUser, setUser]);

  if (!isReady || loading) {
    return <FullPageLoader text="Загружаю StoryBot..." />;
  }

  if (error) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '16px'
      }}>
        <span style={{ fontSize: '48px' }}>😔</span>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppRouter />
      <TabBar />
    </BrowserRouter>
  );
}

