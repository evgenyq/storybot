"""
Simple Telegram Bot for launching StoryBot Mini App
Run this instead of the main bot
"""

import os
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
# Update this URL after GitHub Pages deployment
MINI_APP_URL = os.getenv("MINI_APP_URL", "https://your-username.github.io/storybot/")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a message with a button to open Mini App"""
    user = update.effective_user
    
    keyboard = [
        [InlineKeyboardButton(
            "📚 Открыть StoryBot",
            web_app=WebAppInfo(url=MINI_APP_URL)
        )],
    ]
    
    await update.message.reply_text(
        f"👋 Привет, {user.first_name}!\n\n"
        f"🌟 Добро пожаловать в StoryBot!\n\n"
        f"Создавай волшебные книжки вместе с искусственным интеллектом.\n\n"
        f"Нажми кнопку ниже, чтобы начать! 👇",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send help message"""
    await update.message.reply_text(
        "🆘 **Помощь**\n\n"
        "StoryBot помогает создавать детские книжки с картинками.\n\n"
        "**Как использовать:**\n"
        "1. Нажми /start\n"
        "2. Открой Mini App\n"
        "3. Создай книгу и персонажей\n"
        "4. Генерируй главы и наслаждайся!\n\n"
        "❓ Вопросы? Напиши @your_username",
        parse_mode="Markdown"
    )


def main():
    """Start the bot"""
    if not BOT_TOKEN:
        print("Error: TELEGRAM_BOT_TOKEN not set in environment")
        return
    
    print("🤖 Starting StoryBot...")
    print(f"📱 Mini App URL: {MINI_APP_URL}")
    
    app = Application.builder().token(BOT_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    
    print("✅ Bot is running!")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

