#!/usr/bin/env python3
"""
Точка входа для запуска StoryBot
"""

import os
import sys

# Добавляем пути к модулям
current_dir = os.path.dirname(os.path.abspath(__file__))
telegram_bot_dir = os.path.join(current_dir, 'telegram-bot')
sys.path.insert(0, telegram_bot_dir)

# Импортируем и запускаем бота
from api.bot import main

if __name__ == "__main__":
    main()