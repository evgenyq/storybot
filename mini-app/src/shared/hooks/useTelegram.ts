import { useEffect, useState } from 'react';
import type { TelegramUser } from '../types';

// Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: TelegramUser;
          auth_date?: number;
          hash?: string;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
        showPopup: (params: {
          title?: string;
          message: string;
          buttons?: Array<{ id?: string; type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'; text: string }>;
        }, callback?: (buttonId: string) => void) => void;
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          setText: (text: string) => void;
          enable: () => void;
          disable: () => void;
        };
        BackButton: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        colorScheme: 'light' | 'dark';
        viewportHeight: number;
        viewportStableHeight: number;
        isExpanded: boolean;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
      };
    };
  }
}

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      // Tell Telegram that the app is ready
      tg.ready();
      
      // Expand to full height
      tg.expand();

      // Set light theme colors (for kids)
      tg.setHeaderColor('#ffffff');
      tg.setBackgroundColor('#f8f9fa');

      // Get user data
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
      }

      setIsReady(true);
    } else {
      // Development mode - mock user
      if (import.meta.env.DEV) {
        setUser({
          id: 123456789,
          first_name: 'Test',
          last_name: 'User',
          username: 'testuser',
        });
        setIsReady(true);
      }
    }
  }, []);

  const hapticFeedback = {
    light: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'),
    medium: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'),
    heavy: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy'),
    success: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'),
    error: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error'),
    warning: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning'),
    selection: () => window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(),
  };

  const mainButton = {
    show: (text: string, onClick: () => void) => {
      const btn = window.Telegram?.WebApp?.MainButton;
      if (btn) {
        btn.setText(text);
        btn.onClick(onClick);
        btn.show();
      }
    },
    hide: () => {
      window.Telegram?.WebApp?.MainButton?.hide();
    },
    setLoading: (loading: boolean) => {
      const btn = window.Telegram?.WebApp?.MainButton;
      if (btn) {
        if (loading) {
          btn.disable();
        } else {
          btn.enable();
        }
      }
    },
  };

  const backButton = {
    show: (onClick: () => void) => {
      const btn = window.Telegram?.WebApp?.BackButton;
      if (btn) {
        btn.onClick(onClick);
        btn.show();
      }
    },
    hide: () => {
      window.Telegram?.WebApp?.BackButton?.hide();
    },
  };

  const close = () => {
    window.Telegram?.WebApp?.close();
  };

  const showConfirm = (title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const tg = window.Telegram?.WebApp;
      if (tg?.showPopup) {
        tg.showPopup({
          title,
          message,
          buttons: [
            { id: 'cancel', type: 'cancel', text: 'Отмена' },
            { id: 'confirm', type: 'destructive', text: 'Удалить' },
          ],
        }, (buttonId) => {
          resolve(buttonId === 'confirm');
        });
      } else {
        // Fallback for development
        resolve(window.confirm(`${title}\n\n${message}`));
      }
    });
  };

  return {
    isReady,
    user,
    hapticFeedback,
    mainButton,
    backButton,
    close,
    showConfirm,
    webApp: window.Telegram?.WebApp,
  };
}

