# 🚀 Инструкция по настройке StoryBot Mini App

## Шаг 1: Настройка Supabase

### 1.1 Создать Storage bucket

1. Откройте Supabase Dashboard → Storage
2. Создайте bucket `images` с публичным доступом

### 1.2 Применить миграции БД

1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте содержимое файла `supabase/migrations/001_initial_schema.sql`
3. Выполните SQL

### 1.3 Настроить Edge Functions Secrets

В Supabase Dashboard → Settings → Edge Functions → Secrets добавьте:

```
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

### 1.4 Задеплоить Edge Functions

```bash
# Установите Supabase CLI если ещё нет
npm install -g supabase

# Авторизуйтесь
supabase login

# Свяжите проект
supabase link --project-ref YOUR_PROJECT_REF

# Задеплойте функции
supabase functions deploy generate-chapter
supabase functions deploy transcribe-voice
supabase functions deploy generate-character-reference
```

---

## Шаг 2: GitHub Pages

### 2.1 Создать репозиторий

```bash
cd mini-app
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/storybot.git
git push -u origin main
```

### 2.2 Настроить Secrets

В GitHub → Settings → Secrets → Actions добавьте:

- `VITE_SUPABASE_URL` - URL вашего Supabase проекта
- `VITE_SUPABASE_ANON_KEY` - Anon key из Supabase

### 2.3 Включить GitHub Pages

1. GitHub → Settings → Pages
2. Source: GitHub Actions

После push в main автоматически запустится деплой.

---

## Шаг 3: Настройка бота

### 3.1 Создать .env файл

```bash
cd mini-app
cp .env.example .env.local
```

Заполните:
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### 3.2 Зарегистрировать Mini App в BotFather

1. Откройте @BotFather
2. Выберите вашего бота
3. `/newapp`
4. Укажите URL: `https://YOUR_USERNAME.github.io/storybot/`

### 3.3 Запустить бота

```bash
# Обновите MINI_APP_URL в bot.py
python bot.py
```

---

## Шаг 4: Тестирование

1. Откройте бота в Telegram
2. Отправьте /start
3. Нажмите "Открыть StoryBot"
4. Создайте персонажа и книгу
5. Сгенерируйте первую главу!

---

## Troubleshooting

### Mini App не открывается
- Проверьте что URL в BotFather указан правильно
- Убедитесь что GitHub Pages активен

### Ошибки в консоли браузера
- Проверьте CORS настройки в Supabase
- Убедитесь что env переменные заданы правильно

### Генерация не работает
- Проверьте секреты в Edge Functions
- Посмотрите логи в Supabase Dashboard → Edge Functions → Logs

