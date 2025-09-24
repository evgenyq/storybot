from supabase import create_client, Client
from typing import Optional, Dict, List, Any
from datetime import datetime
import json
import base64
from loguru import logger
from config.settings import settings

class DatabaseManager:
    def __init__(self):
        self.supabase: Client = create_client(settings.supabase_url, settings.supabase_key)
    
    
    # Users
    async def get_or_create_user(self, telegram_id: int, username: Optional[str] = None) -> Dict[str, Any]:
        """Получить или создать пользователя"""
        try:
            # Проверяем существует ли пользователь
            result = self.supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
            
            if result.data:
                return result.data[0]
            
            # Создаем нового пользователя
            user_data = {
                "telegram_id": telegram_id,
                "username": username,
                "created_at": datetime.now().isoformat(),
                "is_active": True
            }
            
            result = self.supabase.table("users").insert(user_data).execute()
            return result.data[0]
            
        except Exception as e:
            logger.error(f"Ошибка при работе с пользователем {telegram_id}: {e}")
            raise
    
    # Books
    async def create_book(self, user_id: str, title: str, description: str) -> Dict[str, Any]:
        """Создать новую книгу"""
        try:
            book_data = {
                "user_id": user_id,
                "title": title,
                "description": description,
                "created_at": datetime.now().isoformat(),
                "status": "active"
            }
            
            result = self.supabase.table("books").insert(book_data).execute()
            return result.data[0]
            
        except Exception as e:
            logger.error(f"Ошибка при создании книги: {e}")
            raise
    
    async def get_user_books(self, user_id: str) -> List[Dict[str, Any]]:
        """Получить все книги пользователя"""
        try:
            result = self.supabase.table("books").select("*").eq("user_id", user_id).eq("status", "active").order("created_at", desc=True).execute()
            return result.data
            
        except Exception as e:
            logger.error(f"Ошибка при получении книг пользователя {user_id}: {e}")
            raise
    
    async def get_book(self, book_id: str) -> Optional[Dict[str, Any]]:
        """Получить книгу по ID"""
        try:
            result = self.supabase.table("books").select("*").eq("id", book_id).execute()
            return result.data[0] if result.data else None
            
        except Exception as e:
            logger.error(f"Ошибка при получении книги {book_id}: {e}")
            raise
    
    # Characters
    async def create_character(self, book_id: str, name: str, full_description: str, visual_description: str = "") -> Dict[str, Any]:
        """Создать персонажа для книги"""
        try:
            character_data = {
                "book_id": book_id,
                "name": name,
                "full_description": full_description,
                "visual_description": visual_description,
                "created_at": datetime.now().isoformat()
            }
            
            result = self.supabase.table("characters").insert(character_data).execute()
            return result.data[0]
            
        except Exception as e:
            logger.error(f"Ошибка при создании персонажа: {e}")
            raise
    
    async def get_book_characters(self, book_id: str) -> List[Dict[str, Any]]:
        """Получить всех персонажей книги"""
        try:
            result = self.supabase.table("characters").select("*").eq("book_id", book_id).order("created_at").execute()
            return result.data
            
        except Exception as e:
            logger.error(f"Ошибка при получении персонажей книги {book_id}: {e}")
            raise
    
    # Chapters
    async def create_chapter(self, book_id: str, chapter_number: int, title: str, content: str, illustration_prompt: str = "", word_count: int = None) -> Dict[str, Any]:
        """Создать главу"""
        try:
            chapter_data = {
                "book_id": book_id,
                "chapter_number": chapter_number,
                "title": title,
                "content": content,
                "illustration_prompt": illustration_prompt,
                "word_count": word_count,
                "created_at": datetime.now().isoformat()
            }
            
            result = self.supabase.table("chapters").insert(chapter_data).execute()
            return result.data[0]
            
        except Exception as e:
            logger.error(f"Ошибка при создании главы: {e}")
            raise
    
    async def get_book_chapters(self, book_id: str) -> List[Dict[str, Any]]:
        """Получить все главы книги"""
        try:
            result = self.supabase.table("chapters").select("*").eq("book_id", book_id).order("chapter_number").execute()
            return result.data
            
        except Exception as e:
            logger.error(f"Ошибка при получении глав книги {book_id}: {e}")
            raise
    
    async def update_chapter_illustration(self, chapter_id: str, illustration_url: str) -> bool:
        """Обновить иллюстрацию главы"""
        try:
            result = self.supabase.table("chapters").update({"illustration_url": illustration_url}).eq("id", chapter_id).execute()
            return bool(result.data)
            
        except Exception as e:
            logger.error(f"Ошибка при обновлении иллюстрации главы {chapter_id}: {e}")
            raise
    
    # Character References
    async def save_character_reference(self, character_id: str, image_data: bytes, prompt: str) -> bool:
        """Сохранить референс персонажа в БД"""
        try:
            # Конвертируем bytes в hex формат для PostgreSQL BYTEA
            hex_data = "\\x" + image_data.hex()
            
            update_data = {
                "reference_image": hex_data,  # hex формат для BYTEA
                "reference_prompt": prompt,
                "has_reference": True,
                "reference_created_at": datetime.now().isoformat()
            }
            
            logger.debug(f"Сохраняем изображение в hex формате: {len(hex_data)} символов")
            
            result = self.supabase.table("characters").update(update_data).eq("id", character_id).execute()
            
            if result.data:
                logger.info(f"Референс персонажа {character_id} сохранен в БД")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Ошибка при сохранении референса персонажа {character_id}: {e}")
            raise
    
    async def get_character_reference(self, character_id: str) -> Optional[bytes]:
        """Получить референс персонажа из БД"""
        try:
            result = self.supabase.table("characters").select("reference_image").eq("id", character_id).execute()
            
            if result.data and result.data[0].get("reference_image"):
                hex_data = result.data[0]["reference_image"]
                logger.debug(f"Получили из BYTEA: тип {type(hex_data)}")
                
                # BYTEA в Supabase возвращается как hex строка с префиксом \x
                if isinstance(hex_data, str) and hex_data.startswith("\\x"):
                    # Убираем префикс \x и конвертируем hex в bytes
                    hex_string = hex_data[2:]  # убираем \x
                    image_bytes = bytes.fromhex(hex_string)
                    logger.debug(f"Конвертировали hex в bytes: {len(image_bytes)} байт")
                    return image_bytes
                
                # Fallback для других форматов
                elif isinstance(hex_data, bytes):
                    logger.debug("Получили bytes напрямую")
                    return hex_data
                
                elif isinstance(hex_data, str):
                    logger.warning("Получили строку без \\x префикса, пытаемся как base64")
                    return base64.b64decode(hex_data)
                
                logger.error(f"Неожиданный формат данных из BYTEA: {type(hex_data)}, значение: {str(hex_data)[:100]}...")
                return None
            
            return None
            
        except Exception as e:
            logger.error(f"Ошибка при получении референса персонажа {character_id}: {e}")
            return None
    
    async def get_characters_with_references(self, book_id: str) -> List[Dict[str, Any]]:
        """Получить всех персонажей книги с их референсами"""
        try:
            result = self.supabase.table("characters").select(
                "id, name, full_description, has_reference, reference_image, reference_prompt"
            ).eq("book_id", book_id).execute()
            
            characters = []
            for char_data in result.data:
                char = {
                    "id": char_data["id"],
                    "name": char_data["name"],
                    "full_description": char_data["full_description"],
                    "has_reference": char_data["has_reference"]
                }
                
                # Добавляем референс если есть
                if char_data["has_reference"] and char_data["reference_image"]:
                    hex_data = char_data["reference_image"]
                    
                    # Конвертируем hex данные в bytes
                    if isinstance(hex_data, str) and hex_data.startswith("\\x"):
                        hex_string = hex_data[2:]  # убираем \x
                        char["reference_image"] = bytes.fromhex(hex_string)
                    elif isinstance(hex_data, bytes):
                        char["reference_image"] = hex_data
                    elif isinstance(hex_data, str):
                        # Fallback для старых данных
                        char["reference_image"] = base64.b64decode(hex_data)
                    else:
                        logger.error(f"Неожиданный тип референса: {type(hex_data)}")
                        continue
                    
                    char["reference_prompt"] = char_data["reference_prompt"]
                
                characters.append(char)
            
            return characters
            
        except Exception as e:
            logger.error(f"Ошибка при получении персонажей с референсами для книги {book_id}: {e}")
            return []
    
    async def check_character_has_reference(self, character_id: str) -> bool:
        """Проверить есть ли у персонажа референс"""
        try:
            result = self.supabase.table("characters").select("has_reference").eq("id", character_id).execute()
            
            if result.data:
                return result.data[0].get("has_reference", False)
            return False
            
        except Exception as e:
            logger.error(f"Ошибка при проверке референса персонажа {character_id}: {e}")
            return False

# Глобальный экземпляр
db = DatabaseManager()