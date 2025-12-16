# StoryBot Mini App 📚✨

Telegram Mini App для создания детских книг с помощью ИИ.

## Технологии

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: Supabase PostgreSQL
- **Storage**: Supabase Storage
- **AI**: OpenAI GPT-4 (текст) + Google Gemini (изображения)

## Локальная разработка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Создайте файл `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Запуск dev-сервера

```bash
npm run dev
```

Откройте http://localhost:3000

### 4. Тестирование в Telegram

Для тестирования Mini App в Telegram используйте [BotFather](https://t.me/BotFather):

1. Создайте бота или используйте существующего
2. Выполните `/newapp` для создания Mini App
3. Укажите URL: `https://your-username.github.io/storybot/`

## Деплой

### GitHub Pages (Frontend)

1. Форкните репозиторий или создайте новый
2. Добавьте секреты в Settings > Secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Включите GitHub Pages в Settings > Pages
4. Push в `main` запустит автоматический деплой

### Supabase Edge Functions

```bash
# Установите Supabase CLI
npm install -g supabase

# Авторизуйтесь
supabase login

# Деплой функций
supabase functions deploy generate-chapter
supabase functions deploy transcribe-voice
supabase functions deploy generate-character-reference
```

Не забудьте добавить секреты в Supabase Dashboard:
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`

## База данных

Примените миграции:

```bash
# Через Supabase Dashboard SQL Editor
# Скопируйте содержимое supabase/migrations/001_initial_schema.sql
```

Или через CLI:

```bash
supabase db push
```

## Структура проекта

```
mini-app/
├── src/
│   ├── app/           # App и Router
│   ├── pages/         # Страницы
│   ├── components/    # React компоненты
│   ├── shared/        # API, хуки, типы
│   └── styles/        # Глобальные стили
├── supabase/
│   ├── functions/     # Edge Functions
│   └── migrations/    # SQL миграции
└── public/
```

## Лицензия

MIT
