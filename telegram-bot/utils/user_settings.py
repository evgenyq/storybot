import json
from typing import Dict, Optional, Any
from datetime import datetime
from loguru import logger

from utils.database import db


class UserSettings:
    """Класс для хранения настроек пользователя"""
    
    def __init__(self, data: Dict = None):
        if data is None:
            data = {}
        
        # Значения по умолчанию
        self.chapter_size: int = data.get('chapter_size', 600)
        self.chapter_pics: int = data.get('chapter_pics', 1)
        self.created_at: str = data.get('created_at', datetime.utcnow().isoformat())
        self.updated_at: str = datetime.utcnow().isoformat()
    
    def to_dict(self) -> Dict:
        """Преобразование в словарь для хранения в БД"""
        return {
            'chapter_size': self.chapter_size,
            'chapter_pics': self.chapter_pics,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }
    
    def validate(self) -> bool:
        """Валидация настроек"""
        # Проверяем размер глав
        if not (200 <= self.chapter_size <= 1200):
            return False
        
        # Проверяем количество картинок
        if not (1 <= self.chapter_pics <= 3):
            return False
        
        return True
    
    def get_chapter_size_description(self) -> str:
        """Получить описание размера главы"""
        if self.chapter_size <= 300:
            return "короткие"
        elif self.chapter_size <= 700:
            return "средние"
        else:
            return "длинные"
    
    def get_chapter_pics_description(self) -> str:
        """Получить описание количества картинок"""
        if self.chapter_pics == 1:
            return "1 иллюстрация"
        else:
            return f"{self.chapter_pics} иллюстрации"


class UserSettingsManager:
    """Менеджер для работы с пользовательскими настройками"""
    
    async def get_user_settings(self, telegram_id: int) -> UserSettings:
        """Получить настройки пользователя"""
        try:
            # Получаем сессию пользователя
            session_result = db.supabase.table("user_sessions").select("session_data").eq("telegram_id", telegram_id).execute()
            
            if session_result.data:
                session_data = session_result.data[0]['session_data']
                user_settings_data = session_data.get('user_settings', {})
                return UserSettings(user_settings_data)
            else:
                # Возвращаем настройки по умолчанию
                return UserSettings()
                
        except Exception as e:
            logger.error(f"Ошибка получения настроек пользователя {telegram_id}: {e}")
            return UserSettings()  # Fallback к настройкам по умолчанию
    
    async def update_user_settings(self, telegram_id: int, settings: UserSettings) -> bool:
        """Обновить настройки пользователя"""
        try:
            if not settings.validate():
                logger.warning(f"Некорректные настройки пользователя {telegram_id}: {settings.to_dict()}")
                return False
            
            # Получаем пользователя
            user = await db.get_or_create_user(telegram_id)
            
            # Проверяем существует ли сессия
            session_result = db.supabase.table("user_sessions").select("*").eq("telegram_id", telegram_id).execute()
            
            session_data = {
                'user_settings': settings.to_dict()
            }
            
            if session_result.data:
                # Обновляем существующую сессию
                # Сначала получаем существующие данные
                existing_data = session_result.data[0]['session_data']
                if existing_data:
                    session_data.update(existing_data)
                
                session_data['user_settings'] = settings.to_dict()
                
                db.supabase.table("user_sessions").update({
                    "session_data": session_data,
                    "updated_at": datetime.utcnow().isoformat()
                }).eq("telegram_id", telegram_id).execute()
            else:
                # Создаем новую сессию
                db.supabase.table("user_sessions").insert({
                    "user_id": user['id'],
                    "telegram_id": telegram_id,
                    "session_data": session_data
                }).execute()
            
            logger.info(f"Настройки пользователя {telegram_id} обновлены: {settings.to_dict()}")
            return True
            
        except Exception as e:
            logger.error(f"Ошибка обновления настроек пользователя {telegram_id}: {e}")
            return False
    
    async def set_chapter_size(self, telegram_id: int, size: int) -> tuple[bool, str]:
        """Установить размер главы"""
        if not (200 <= size <= 1200):
            return False, "❌ Размер главы должен быть от 200 до 1200 слов"
        
        settings = await self.get_user_settings(telegram_id)
        settings.chapter_size = size
        
        success = await self.update_user_settings(telegram_id, settings)
        if success:
            return True, f"✅ Размер главы установлен: {size} слов ({settings.get_chapter_size_description()})"
        else:
            return False, "❌ Не удалось сохранить настройки"
    
    async def set_chapter_pics(self, telegram_id: int, pics: int) -> tuple[bool, str]:
        """Установить количество картинок"""
        if not (1 <= pics <= 3):
            return False, "❌ Количество иллюстраций должно быть от 1 до 3"
        
        settings = await self.get_user_settings(telegram_id)
        settings.chapter_pics = pics
        
        success = await self.update_user_settings(telegram_id, settings)
        if success:
            return True, f"✅ Количество иллюстраций установлено: {settings.get_chapter_pics_description()}"
        else:
            return False, "❌ Не удалось сохранить настройки"
    
    async def reset_settings(self, telegram_id: int) -> tuple[bool, str]:
        """Сбросить настройки к значениям по умолчанию"""
        default_settings = UserSettings()
        
        success = await self.update_user_settings(telegram_id, default_settings)
        if success:
            return True, "✅ Настройки сброшены к значениям по умолчанию"
        else:
            return False, "❌ Не удалось сбросить настройки"
    
    def format_settings_message(self, settings: UserSettings) -> str:
        """Форматировать сообщение с настройками"""
        text = "⚙️ **Текущие настройки:**\n\n"
        text += f"📝 **Размер глав:** {settings.chapter_size} слов ({settings.get_chapter_size_description()})\n"
        text += f"🎨 **Иллюстрации:** {settings.get_chapter_pics_description()}\n\n"
        
        text += "**Доступные команды:**\n"
        text += f"• `/chapter_size <число>` - размер главы (200-1200)\n"
        text += f"• `/chapter_pics <число>` - иллюстрации (1-3)\n"
        text += f"• `/reset_settings` - сбросить к умолчанию\n\n"
        
        text += f"_Обновлено: {settings.updated_at[:19].replace('T', ' ')}_"
        
        return text


# Глобальный экземпляр
user_settings_manager = UserSettingsManager()