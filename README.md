# StoryBot 📚✨

AI-powered children's book generator for Telegram

## Overview

StoryBot помогает создавать персонализированные детские книжки с помощью ИИ. Пользователи могут:
- 📖 Создавать книги с собственными персонажами
- ✨ Генерировать главы с красочными иллюстрациями
- 🎙️ Использовать голосовой ввод для подсказок
- ⚙️ Настраивать длину и стиль глав

## Технологии

- **Mini App**: React, TypeScript, Vite
- **Backend**: Supabase Edge Functions (Deno)
- **AI**: OpenAI GPT-4o-mini (текст), Google Gemini 2.5 Flash (изображения), Whisper (голос)
- **Database**: Supabase PostgreSQL
- **Storage**: Supabase Storage
- **Deploy**: GitHub Pages (frontend)

## Структура проекта

```
storybot/
├── mini-app/              # Telegram Mini App (React + TypeScript)
│   ├── src/               # Исходный код приложения
│   └── supabase/          # Edge Functions и миграции
├── telegram-bot/          # Telegram bot для запуска Mini App
├── shared/                # Общие схемы БД
├── prompts/               # JSON файлы с промптами для AI
└── .github/workflows/     # GitHub Actions для деплоя
```

## Возрастная группа

По умолчанию: 5-10 лет

## Quick Start

### 1. Mini App (Frontend)
```bash
cd mini-app
npm install
cp .env.example .env.local  # и заполнить переменные
npm run dev
```

### 2. Telegram Bot
```bash
source venv/bin/activate
cd telegram-bot
python mini_app_bot.py
```

### 3. Деплой
- **Frontend**: Push в main → автоматический деплой на GitHub Pages
- **Edge Functions**: `cd mini-app && supabase functions deploy`

## Документация

- [Настройка Mini App](mini-app/SETUP.md)
- [Supabase конфигурация](mini-app/supabase/)
