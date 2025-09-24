import asyncio
import json
from typing import Optional, Dict, Any, List
from io import BytesIO
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes, ConversationHandler
from loguru import logger
import os
import sys

# Добавляем путь к проекту
current_dir = os.path.dirname(__file__)
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from config.settings import settings
from utils.database import db
from utils.ai_generator import ai_generator
from utils.image_generator import image_generator
from utils.character_analyzer import character_analyzer

# Состояния разговора
(
    MAIN_MENU,
    CREATE_BOOK_TITLE,
    CREATE_BOOK_DESCRIPTION,
    CREATE_CHARACTER_NAME,
    CREATE_CHARACTER_DESCRIPTION,
    CREATE_CHARACTER_CLARIFICATION,
    ADD_MORE_CHARACTERS,
    CHAPTER_HINT,
    READING_BOOK
) = range(9)

class StoryBot:
    def __init__(self):
        self.application = Application.builder().token(settings.telegram_bot_token).build()
        self.setup_handlers()
    
    def setup_handlers(self):
        """Настройка обработчиков команд и сообщений"""
        
        # Conversation handler для создания книги
        create_book_conv = ConversationHandler(
            entry_points=[CallbackQueryHandler(self.start_create_book, pattern="^create_book$")],
            states={
                CREATE_BOOK_TITLE: [MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_book_title)],
                CREATE_BOOK_DESCRIPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_book_description)],
                CREATE_CHARACTER_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_character_name)],
                CREATE_CHARACTER_DESCRIPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_character_description)],
                CREATE_CHARACTER_CLARIFICATION: [MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_character_clarification)],
                ADD_MORE_CHARACTERS: [
                    CallbackQueryHandler(self.add_more_characters, pattern="^add_character$"),
                    CallbackQueryHandler(self.finish_characters, pattern="^finish_characters$")
                ]
            },
            fallbacks=[CommandHandler("cancel", self.cancel_conversation)]
        )
        
        # Conversation handler для создания главы
        create_chapter_conv = ConversationHandler(
            entry_points=[CallbackQueryHandler(self.start_create_chapter, pattern="^create_chapter_.*")],
            states={
                CHAPTER_HINT: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_chapter_hint),
                    CallbackQueryHandler(self.auto_generate_chapter, pattern="^auto_generate$"),
                    CallbackQueryHandler(self.ask_for_hint, pattern="^give_hint$")
                ]
            },
            fallbacks=[CommandHandler("cancel", self.cancel_conversation)]
        )
        
        # Основные команды
        self.application.add_handler(CommandHandler("start", self.start_command))
        self.application.add_handler(CommandHandler("help", self.help_command))
        
        # Conversation handlers
        self.application.add_handler(create_book_conv)
        self.application.add_handler(create_chapter_conv)
        
        # Callback handlers
        self.application.add_handler(CallbackQueryHandler(self.handle_main_menu, pattern="^main_menu$"))
        self.application.add_handler(CallbackQueryHandler(self.show_my_books, pattern="^my_books$"))
        self.application.add_handler(CallbackQueryHandler(self.show_book_details, pattern="^book_.*"))
        self.application.add_handler(CallbackQueryHandler(self.read_chapter, pattern="^read_chapter_.*"))
        
        # Обработка ошибок
        self.application.add_error_handler(self.error_handler)
    
    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Обработка команды /start"""
        user = update.effective_user
        
        # Получаем или создаем пользователя в БД
        await db.get_or_create_user(user.id, user.username)
        
        welcome_text = f"🌟 Привет, {user.first_name}! Добро пожаловать в StoryBot!\n\n" \
                      f"Я помогу тебе создавать удивительные детские книжки с персонажами и иллюстрациями! ✨📚\n\n" \
                      f"Что ты хочешь сделать?"
        
        keyboard = self.get_main_menu_keyboard()
        
        if update.message:
            await update.message.reply_text(welcome_text, reply_markup=keyboard)
        else:
            await update.callback_query.edit_message_text(welcome_text, reply_markup=keyboard)
        
        return MAIN_MENU
    
    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработка команды /help"""
        help_text = "🆘 **Помощь по StoryBot**\n\n" \
                   "📖 **Как создать книгу:**\n" \
                   "1. Нажми 'Создать новую книгу'\n" \
                   "2. Придумай название и описание\n" \
                   "3. Создай персонажей\n" \
                   "4. Начинай писать главы!\n\n" \
                   "⭐ **Команды:**\n" \
                   "/start - Главное меню\n" \
                   "/help - Эта справка\n" \
                   "/cancel - Отменить текущее действие\n\n" \
                   "❓ Есть вопросы? Просто напиши нам!"
        
        await update.message.reply_text(help_text, parse_mode='Markdown')
    
    def get_main_menu_keyboard(self):
        """Клавиатура главного меню"""
        keyboard = [
            [InlineKeyboardButton("📝 Создать новую книгу", callback_data="create_book")],
            [InlineKeyboardButton("📚 Мои книги", callback_data="my_books")],
            [InlineKeyboardButton("ℹ️ Помощь", callback_data="help")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    async def handle_main_menu(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Возврат в главное меню"""
        await self.start_command(update, context)
    
    async def show_my_books(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Показать книги пользователя"""
        user_id = str(update.effective_user.id)
        
        # Получаем пользователя из БД
        user = await db.get_or_create_user(update.effective_user.id)
        books = await db.get_user_books(user['id'])
        
        if not books:
            text = "📚 У тебя пока нет книг.\n\nДавай создадим первую книгу! 🌟"
            keyboard = [
                [InlineKeyboardButton("📝 Создать первую книгу", callback_data="create_book")],
                [InlineKeyboardButton("⬅️ Назад", callback_data="main_menu")]
            ]
        else:
            text = f"📚 **Твои книги ({len(books)}):**\n\n"
            keyboard = []
            
            for book in books[:10]:  # Показываем максимум 10 книг
                text += f"📖 **{book['title']}**\n"
                if book['description']:
                    text += f"💭 _{book['description'][:50]}{'...' if len(book['description']) > 50 else ''}_\n"
                text += "\n"
                
                keyboard.append([InlineKeyboardButton(f"📖 {book['title']}", callback_data=f"book_{book['id']}")])
            
            keyboard.extend([
                [InlineKeyboardButton("📝 Создать новую книгу", callback_data="create_book")],
                [InlineKeyboardButton("⬅️ Назад", callback_data="main_menu")]
            ])
        
        await update.callback_query.edit_message_text(
            text, 
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def show_book_details(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Показать детали книги"""
        book_id = update.callback_query.data.split("_")[1]
        book = await db.get_book(book_id)
        
        if not book:
            await update.callback_query.answer("Книга не найдена!")
            return
        
        chapters = await db.get_book_chapters(book_id)
        characters = await db.get_book_characters(book_id)
        
        text = f"📖 **{book['title']}**\n\n"
        if book['description']:
            text += f"💭 _{book['description']}_\n\n"
        
        text += f"👥 **Персонажи ({len(characters)}):**\n"
        for char in characters[:5]:  # Показываем первых 5 персонажей
            text += f"• {char['name']}\n"
        if len(characters) > 5:
            text += f"• ... и еще {len(characters) - 5}\n"
        text += "\n"
        
        text += f"📄 **Глав написано: {len(chapters)}**\n\n"
        
        keyboard = []
        
        # Кнопки для чтения глав
        if chapters:
            text += "📚 **Главы:**\n"
            for i, chapter in enumerate(chapters[:5]):  # Показываем первые 5 глав
                chapter_title = chapter['title'] if chapter['title'] else f"Глава {chapter['chapter_number']}"
                text += f"{chapter['chapter_number']}. {chapter_title}\n"
                keyboard.append([InlineKeyboardButton(f"📖 Читать главу {chapter['chapter_number']}", callback_data=f"read_chapter_{chapter['id']}")])
            
            if len(chapters) > 5:
                text += f"... и еще {len(chapters) - 5} глав\n"
        
        # Кнопка создания новой главы
        next_chapter_num = len(chapters) + 1
        keyboard.append([InlineKeyboardButton(f"✍️ Написать главу {next_chapter_num}", callback_data=f"create_chapter_{book_id}")])
        
        keyboard.extend([
            [InlineKeyboardButton("📚 Мои книги", callback_data="my_books")],
            [InlineKeyboardButton("🏠 Главное меню", callback_data="main_menu")]
        ])
        
        await update.callback_query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    # === СОЗДАНИЕ КНИГИ ===
    
    async def start_create_book(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Начать создание книги"""
        await update.callback_query.edit_message_text(
            "📝 **Создаем новую книгу!**\n\n"
            "Сначала придумай название для своей книги. Это может быть что угодно - приключения, сказка, история о дружбе... ✨\n\n"
            "💡 Например: 'Приключения кота Мурзика' или 'Волшебный лес'\n\n"
            "Напиши название своей книги:",
            parse_mode='Markdown'
        )
        return CREATE_BOOK_TITLE
    
    async def handle_book_title(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Обработка названия книги"""
        title = update.message.text.strip()
        
        if len(title) < 3:
            await update.message.reply_text(
                "🤔 Название слишком короткое. Придумай название длиннее 3 символов!"
            )
            return CREATE_BOOK_TITLE
        
        if len(title) > 100:
            await update.message.reply_text(
                "😅 Название слишком длинное! Давай покороче (до 100 символов)."
            )
            return CREATE_BOOK_TITLE
        
        context.user_data['book_title'] = title
        
        await update.message.reply_text(
            f"📖 Отлично! Название: **{title}**\n\n"
            f"Теперь расскажи кратко, о чем будет эта книга? Опиши основную идею или сюжет.\n\n"
            f"💡 Например: 'История о том, как кот Мурзик нашел волшебную палочку и отправился спасать друзей'\n\n"
            f"Напиши описание:",
            parse_mode='Markdown'
        )
        return CREATE_BOOK_DESCRIPTION
    
    async def handle_book_description(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Обработка описания книги"""
        description = update.message.text.strip()
        
        if len(description) < 10:
            await update.message.reply_text(
                "🤔 Описание слишком короткое. Расскажи побольше о своей истории!"
            )
            return CREATE_BOOK_DESCRIPTION
        
        context.user_data['book_description'] = description
        context.user_data['characters'] = []
        
        await update.message.reply_text(
            f"✨ Замечательно!\n\n"
            f"📖 **Название:** {context.user_data['book_title']}\n"
            f"💭 **Описание:** {description}\n\n"
            f"Теперь давай создадим персонажей для твоей истории! 👥\n\n"
            f"Напиши имя первого персонажа:\n\n"
            f"💡 Это может быть человек, животное, волшебное существо - кто угодно!",
            parse_mode='Markdown'
        )
        return CREATE_CHARACTER_NAME
    
    async def handle_character_name(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Обработка имени персонажа"""
        name = update.message.text.strip()
        
        if len(name) < 2:
            await update.message.reply_text(
                "🤔 Имя слишком короткое. Придумай имя подлиннее!"
            )
            return CREATE_CHARACTER_NAME
        
        context.user_data['current_character'] = {'name': name}
        
        await update.message.reply_text(
            f"👤 Персонаж: **{name}**\n\n"
            f"Теперь опиши его одним сообщением - кто это, как выглядит, какой характер.\n\n"
            f"💡 Например: 'Смелый рыжий кот 5 лет, который любит приключения и помогать друзьям. У него зеленые глаза и белые лапки.'\n\n"
            f"Расскажи про {name}:",
            parse_mode='Markdown'
        )
        return CREATE_CHARACTER_DESCRIPTION
    
    async def handle_character_description(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Обработка описания персонажа с анализом"""
        description = update.message.text.strip()
        
        if len(description) < 10:
            await update.message.reply_text(
                "🤔 Описание слишком короткое. Расскажи побольше о своем персонаже!"
            )
            return CREATE_CHARACTER_DESCRIPTION
        
        name = context.user_data['current_character']['name']
        context.user_data['current_character']['original_description'] = description
        
        # Показываем что анализируем
        analyzing_msg = await update.message.reply_text(
            f"🤖 Анализирую описание {name}...",
            parse_mode='Markdown'
        )
        
        try:
            # Анализируем описание через ИИ
            analysis = await character_analyzer.analyze_character_description(name, description)
            
            missing_fields = analysis.get("missing_fields", [])
            clarification_question = analysis.get("clarification_question", "")
            
            if missing_fields and clarification_question:
                # Нужны уточнения
                context.user_data['current_character']['needs_clarification'] = True
                
                await analyzing_msg.edit_text(
                    f"✨ Хорошее начало!\n\n"
                    f"📝 **{name}**: {description}\n\n"
                    f"Давай добавим еще несколько деталей:\n\n"
                    f"❓ {clarification_question}",
                    parse_mode='Markdown'
                )
                return CREATE_CHARACTER_CLARIFICATION
            else:
                # Описание достаточно полное
                await analyzing_msg.edit_text(
                    f"✅ Отличное описание!\n\n"
                    f"📝 **{name}**: {description}\n\n"
                    f"Создаю полный образ персонажа...",
                    parse_mode='Markdown'
                )
                
                # Создаем финальное описание
                full_description = description  # Используем как есть, если анализ показал что достаточно
                context.user_data['current_character']['full_description'] = full_description
                
                return await self.finish_character_creation(update, context)
                
        except Exception as e:
            logger.error(f"Ошибка анализа персонажа: {e}")
            # Fallback - продолжаем с исходным описанием
            await analyzing_msg.edit_text(
                f"✅ Персонаж создан!\n\n"
                f"📝 **{name}**: {description}",
                parse_mode='Markdown'
            )
            
            context.user_data['current_character']['full_description'] = description
            return await self.finish_character_creation(update, context)
    
    async def handle_character_clarification(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Обработка уточняющей информации о персонаже"""
        additional_info = update.message.text.strip()
        
        if len(additional_info) < 5:
            await update.message.reply_text(
                "🤔 Расскажи чуть больше деталей!"
            )
            return CREATE_CHARACTER_CLARIFICATION
        
        name = context.user_data['current_character']['name']
        original_description = context.user_data['current_character']['original_description']
        
        # Показываем что создаем полное описание
        completing_msg = await update.message.reply_text(
            f"🎨 Создаю полный образ {name}...",
            parse_mode='Markdown'
        )
        
        try:
            # Создаем полное описание персонажа
            full_description = await character_analyzer.complete_character_description(
                name, original_description, additional_info
            )
            
            context.user_data['current_character']['full_description'] = full_description
            
            await completing_msg.edit_text(
                f"✅ **{name} готов!**\n\n"
                f"📝 Полное описание: _{full_description}_\n\n"
                f"Отлично! Персонаж получился очень ярким! 🌟",
                parse_mode='Markdown'
            )
            
            return await self.finish_character_creation(update, context)
            
        except Exception as e:
            logger.error(f"Ошибка создания полного описания: {e}")
            # Fallback - объединяем описания вручную
            full_description = f"{original_description}. {additional_info}"
            context.user_data['current_character']['full_description'] = full_description
            
            await completing_msg.edit_text(
                f"✅ **{name} готов!**\n\n"
                f"📝 Описание: _{full_description}_",
                parse_mode='Markdown'
            )
            
            return await self.finish_character_creation(update, context)
    
    async def finish_character_creation(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Завершение создания персонажа и показ кнопок выбора"""
        char = context.user_data['current_character']
        context.user_data['characters'].append(char)
        
        char_count = len(context.user_data['characters'])
        
        text = f"🎉 Персонаж создан!\n\n"
        text += f"👤 **{char['name']}**\n"
        text += f"📝 _{char['full_description']}_\n\n"
        text += f"Всего персонажей: **{char_count}**\n\n"
        text += "Что дальше?"
        
        keyboard = [
            [InlineKeyboardButton("➕ Добавить еще персонажа", callback_data="add_character")],
            [InlineKeyboardButton("✅ Закончить и создать книгу", callback_data="finish_characters")]
        ]
        
        await update.message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        return ADD_MORE_CHARACTERS
    
    
    async def add_more_characters(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Добавить еще персонажа"""
        char_count = len(context.user_data.get('characters', []))
        
        await update.callback_query.edit_message_text(
            f"👥 Отлично! У нас уже {char_count} персонаж{'ей' if char_count > 1 else ''}.\n\n"
            f"Давай добавим еще одного! Как его зовут?",
            parse_mode='Markdown'
        )
        return CREATE_CHARACTER_NAME
    
    async def finish_characters(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Завершить создание персонажей и создать книгу"""
        try:
            # Получаем пользователя
            user = await db.get_or_create_user(update.effective_user.id)
            
            # Создаем книгу
            book = await db.create_book(
                user_id=user['id'],
                title=context.user_data['book_title'],
                description=context.user_data['book_description']
            )
            
            # Создаем персонажей и генерируем референсы
            created_characters = []
            for char_data in context.user_data['characters']:
                character = await db.create_character(
                    book_id=book['id'],
                    name=char_data['name'],
                    full_description=char_data['full_description'],
                    visual_description=char_data['full_description']  # Используем полное описание для визуала
                )
                created_characters.append(character)
            
            # Отправляем уведомление о начале генерации референсов
            await update.callback_query.message.reply_text(
                f"🎨 Создаю визуальные портреты персонажей...\n\n"
                f"Это займет несколько секунд и поможет сделать иллюстрации более консистентными.",
                parse_mode='Markdown'
            )
            
            # Генерируем референсы для всех персонажей
            references_created = 0
            for i, character in enumerate(created_characters):
                char_data = context.user_data['characters'][i]
                
                # Показываем прогресс
                await update.callback_query.message.reply_text(
                    f"🎨 Создаю портрет: **{character['name']}** ({i+1}/{len(created_characters)})",
                    parse_mode='Markdown'
                )
                
                # Генерируем референс
                success = await image_generator.generate_character_reference(
                    character_id=character['id'],
                    name=character['name'],
                    description=char_data['full_description']
                )
                
                if success:
                    references_created += 1
                    
                    # Показываем референс пользователю
                    reference_image = await db.get_character_reference(character['id'])
                    if reference_image:
                        await update.callback_query.message.reply_photo(
                            photo=BytesIO(reference_image),
                            caption=f"✅ Портрет **{character['name']}** готов!",
                            parse_mode='Markdown'
                        )
                else:
                    await update.callback_query.message.reply_text(
                        f"⚠️ Не удалось создать портрет для {character['name']}, но это не критично."
                    )
            
            char_count = len(context.user_data['characters'])
            characters_list = "\n".join([f"• {char['name']}" for char in context.user_data['characters']])
            
            text = f"🎉 **Книга создана!**\n\n"
            text += f"📖 **{context.user_data['book_title']}**\n"
            text += f"💭 _{context.user_data['book_description']}_\n\n"
            text += f"👥 **Персонажи ({char_count}):**\n{characters_list}\n\n"
            
            # Добавляем информацию о референсах
            if references_created > 0:
                text += f"🎨 **Портреты готовы:** {references_created}/{char_count}\n\n"
                text += f"Теперь иллюстрации будут более консистентными! ✨\n\n"
            
            text += f"Теперь можно начинать писать первую главу! ✍️"
            
            keyboard = [
                [InlineKeyboardButton("✍️ Написать первую главу", callback_data=f"create_chapter_{book['id']}")],
                [InlineKeyboardButton("📚 Мои книги", callback_data="my_books")],
                [InlineKeyboardButton("🏠 Главное меню", callback_data="main_menu")]
            ]
            
            await update.callback_query.edit_message_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
            # Очищаем данные
            context.user_data.clear()
            
        except Exception as e:
            logger.error(f"Ошибка при создании книги: {e}")
            await update.callback_query.edit_message_text(
                "😔 Произошла ошибка при создании книги. Попробуй еще раз!",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🏠 Главное меню", callback_data="main_menu")]])
            )
        
        return ConversationHandler.END
    
    # === СОЗДАНИЕ ГЛАВЫ ===
    
    async def start_create_chapter(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Начать создание главы"""
        book_id = update.callback_query.data.split("_")[2]
        book = await db.get_book(book_id)
        chapters = await db.get_book_chapters(book_id)
        
        if not book:
            await update.callback_query.answer("Книга не найдена!")
            return ConversationHandler.END
        
        context.user_data['current_book_id'] = book_id
        next_chapter_num = len(chapters) + 1
        
        text = f"✍️ **Пишем главу {next_chapter_num}**\n\n"
        text += f"📖 Книга: **{book['title']}**\n\n"
        text += f"Можешь дать подсказку о том, что должно произойти в этой главе, или я сам придумаю интересное продолжение! 🎭\n\n"
        text += f"💡 Например: 'Герои встречают нового друга' или 'Они попадают в волшебный лес'\n\n"
        text += f"Что делаем?"
        
        keyboard = [
            [InlineKeyboardButton("🎲 Сгенерировать автоматически", callback_data="auto_generate")],
            [InlineKeyboardButton("💬 Дать подсказку", callback_data="give_hint")]
        ]
        
        await update.callback_query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        return CHAPTER_HINT
    
    async def auto_generate_chapter(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Автоматическая генерация главы"""
        await self.generate_chapter(update, context)
        return ConversationHandler.END
    
    async def ask_for_hint(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Просим пользователя дать подсказку"""
        book_id = context.user_data['current_book_id']
        book = await db.get_book(book_id)
        chapters = await db.get_book_chapters(book_id)
        next_chapter_num = len(chapters) + 1
        
        text = f"💬 **Подсказка для главы {next_chapter_num}**\n\n"
        text += f"📖 Книга: **{book['title']}**\n\n"
        text += f"Напиши, что должно произойти в этой главе:\n\n"
        text += f"💡 Например:\n"
        text += f"• 'Герои встречают нового друга'\n"
        text += f"• 'Они попадают в волшебный лес'\n"
        text += f"• 'Персонажи решают сложную загадку'\n\n"
        text += f"Твоя подсказка:"
        
        await update.callback_query.edit_message_text(
            text,
            parse_mode='Markdown'
        )
        return CHAPTER_HINT
    
    async def handle_chapter_hint(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Обработка подсказки для главы"""
        hint = update.message.text.strip()
        context.user_data['chapter_hint'] = hint
        
        await update.message.reply_text(
            f"💡 Отлично! Тема главы: _{hint}_\n\n"
            f"Начинаю генерацию... ⏳",
            parse_mode='Markdown'
        )
        
        await self.generate_chapter(update, context, hint)
        return ConversationHandler.END
    
    async def generate_chapter(self, update: Update, context: ContextTypes.DEFAULT_TYPE, hint: str = ""):
        """Генерация главы с помощью ИИ"""
        try:
            book_id = context.user_data['current_book_id']
            book = await db.get_book(book_id)
            characters = await db.get_book_characters(book_id)
            chapters = await db.get_book_chapters(book_id)
            
            next_chapter_num = len(chapters) + 1
            
            # Показываем сообщение о начале генерации
            generating_msg = f"🤖 Генерирую главу {next_chapter_num}...\n\n"
            generating_msg += f"📖 Книга: **{book['title']}**\n"
            if hint:
                generating_msg += f"💡 Тема: _{hint}_\n"
            generating_msg += f"👥 Персонажей: {len(characters)}\n\n"
            generating_msg += "⏳ Это может занять 10-30 секунд..."
            
            if update.callback_query:
                await update.callback_query.edit_message_text(
                    generating_msg,
                    parse_mode='Markdown'
                )
            else:
                await update.message.reply_text(
                    generating_msg,
                    parse_mode='Markdown'
                )
            
            # Генерируем главу с помощью OpenAI
            generated_chapter = await ai_generator.generate_chapter(
                book_title=book['title'],
                book_description=book['description'],
                characters=characters,
                previous_chapters=chapters,
                chapter_hint=hint,
                word_count=settings.default_chapter_length
            )
            
            # Сохраняем главу в БД
            chapter = await db.create_chapter(
                book_id=book_id,
                chapter_number=next_chapter_num,
                title=generated_chapter['title'],
                content=generated_chapter['content'],
                illustration_prompt=generated_chapter['illustration_prompt'],
                word_count=generated_chapter['word_count']
            )
            
            # Показываем полную главу сразу
            text = f"✅ **{generated_chapter['title']} готова!**\n\n"
            text += f"📚 Книга: _{book['title']}_\n"
            text += f"📊 Слов: {generated_chapter['word_count']}\n\n"
            text += "─" * 20 + "\n\n"
            
            # Добавляем полный текст главы
            full_content = generated_chapter['content']
            
            # Проверяем лимит Telegram (4096 символов)
            if len(text + full_content) > 4000:
                # Урезаем содержание, если слишком длинное
                available_space = 4000 - len(text) - 100  # оставляем место для кнопок
                text += full_content[:available_space] + "\n\n📖 _[Текст сокращен для отображения]_"
            else:
                text += full_content
            
            keyboard = [
                [InlineKeyboardButton(f"✍️ Написать главу {next_chapter_num + 1}", callback_data=f"create_chapter_{book_id}")],
                [InlineKeyboardButton("📚 К книге", callback_data=f"book_{book_id}")],
                [InlineKeyboardButton("🏠 Главное меню", callback_data="main_menu")]
            ]
            
            # Отправляем главу
            if update.callback_query:
                await update.callback_query.edit_message_text(
                    text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                user_id = update.callback_query.from_user.id
            else:
                await update.message.reply_text(
                    text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
                user_id = update.message.from_user.id
            
            # Генерируем иллюстрацию асинхронно
            await self.generate_and_send_illustration(
                user_id, 
                generated_chapter['illustration_prompt'],
                characters,
                book['title'],
                chapter['id']
            )
            
        except Exception as e:
            logger.error(f"Ошибка при генерации главы: {e}")
            error_text = "😔 Произошла ошибка при создании главы. Попробуй еще раз!"
            keyboard = [[InlineKeyboardButton("🏠 Главное меню", callback_data="main_menu")]]
            
            if update.callback_query:
                await update.callback_query.edit_message_text(
                    error_text,
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
            else:
                await update.message.reply_text(
                    error_text,
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
    
    async def read_chapter(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Чтение главы"""
        chapter_id = update.callback_query.data.split("_")[2]
        
        try:
            # Получаем главу из БД
            chapter_result = db.supabase.table("chapters").select("*").eq("id", chapter_id).execute()
            
            if not chapter_result.data:
                await update.callback_query.answer("Глава не найдена!")
                return
            
            chapter = chapter_result.data[0]
            
            # Получаем информацию о книге
            book = await db.get_book(chapter['book_id'])
            
            text = f"📖 **{chapter['title']}**\n\n"
            text += f"📚 Книга: _{book['title']}_\n"
            text += f"📊 Слов: {chapter['word_count'] or 'не подсчитано'}\n\n"
            text += "─" * 20 + "\n\n"
            
            # Разбиваем длинный текст на части (Telegram лимит ~4096 символов)
            content = chapter['content']
            if len(text + content) > 4000:
                # Отправляем первую часть
                first_part = content[:3500]
                text += first_part + "\n\n📖 _Продолжение следует..._"
                
                keyboard = [
                    [InlineKeyboardButton("📄 Продолжить чтение", callback_data=f"continue_reading_{chapter_id}")],
                    [InlineKeyboardButton("📚 К книге", callback_data=f"book_{book['id']}")],
                    [InlineKeyboardButton("🏠 Главное меню", callback_data="main_menu")]
                ]
            else:
                text += content
                
                keyboard = [
                    [InlineKeyboardButton("📚 К книге", callback_data=f"book_{book['id']}")],
                    [InlineKeyboardButton("✍️ Следующая глава", callback_data=f"create_chapter_{book['id']}")],
                    [InlineKeyboardButton("🏠 Главное меню", callback_data="main_menu")]
                ]
            
            await update.callback_query.edit_message_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Ошибка при чтении главы {chapter_id}: {e}")
            await update.callback_query.edit_message_text(
                "😔 Произошла ошибка при загрузке главы.",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🏠 Главное меню", callback_data="main_menu")]])
            )
    
    async def generate_and_send_illustration(
        self, 
        user_id: int, 
        illustration_prompt: str, 
        characters: List[Dict], 
        book_title: str,
        chapter_id: str
    ):
        """Генерируем и отправляем иллюстрацию пользователю"""
        try:
            # Отправляем сообщение о начале генерации
            await self.application.bot.send_message(
                chat_id=user_id,
                text=f"🎨 Генерирую иллюстрацию...\n\n💡 Сцена: _{illustration_prompt}_"
            )
            
            # Генерируем иллюстрацию через Gemini (с DALL-E fallback)
            image_url = await image_generator.generate_illustration(
                scene_description=illustration_prompt,
                characters=characters,
                book_title=book_title
            )
            
            if image_url:
                # Определяем тип изображения и отправляем соответственно
                if image_url.startswith('http'):
                    # URL изображения (DALL-E)
                    photo_source = image_url
                    logger.info("Отправляем изображение по URL (DALL-E)")
                else:
                    # Локальный файл (Gemini)
                    photo_source = open(image_url, 'rb')
                    logger.info(f"Отправляем локальный файл (Gemini): {image_url}")
                
                try:
                    # Отправляем изображение
                    await self.application.bot.send_photo(
                        chat_id=user_id,
                        photo=photo_source,
                        caption=f"🎨 **Иллюстрация к главе**\n\n📖 _{illustration_prompt}_",
                        parse_mode='Markdown'
                    )
                finally:
                    # Закрываем файл если он был открыт
                    if hasattr(photo_source, 'close'):
                        photo_source.close()
                
                # Сохраняем URL в базу данных
                await db.update_chapter_illustration(chapter_id, image_url)
                logger.info(f"Иллюстрация сохранена для главы {chapter_id}")
                
            else:
                # Если не удалось сгенерировать
                await self.application.bot.send_message(
                    chat_id=user_id,
                    text="😔 Не удалось сгенерировать иллюстрацию. Попробую еще раз позже!"
                )
                
        except Exception as e:
            logger.error(f"Ошибка при генерации иллюстрации для пользователя {user_id}: {e}")
            try:
                await self.application.bot.send_message(
                    chat_id=user_id,
                    text="😔 Произошла ошибка при создании иллюстрации."
                )
            except:
                pass  # Игнорируем ошибки отправки сообщений об ошибках
    
    async def cancel_conversation(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Отмена текущего разговора"""
        context.user_data.clear()
        await update.message.reply_text(
            "❌ Действие отменено.\n\nВозвращаемся в главное меню! 🏠"
        )
        await self.start_command(update, context)
        return ConversationHandler.END
    
    async def error_handler(self, update: object, context: ContextTypes.DEFAULT_TYPE):
        """Обработка ошибок"""
        logger.error("Exception while handling an update:", exc_info=context.error)
        
        if isinstance(update, Update) and update.effective_message:
            await update.effective_message.reply_text(
                "😔 Произошла ошибка. Попробуй еще раз или напиши /start"
            )
    
    def run(self):
        """Запуск бота"""
        logger.info("Запуск StoryBot...")
        self.application.run_polling(allowed_updates=Update.ALL_TYPES)

def main():
    """Главная функция"""
    # Настройка логирования
    logger.add(
        "logs/bot.log",
        rotation="1 day",
        retention="30 days",
        level=settings.log_level
    )
    
    # Создание и запуск бота
    bot = StoryBot()
    bot.run()

if __name__ == "__main__":
    main()