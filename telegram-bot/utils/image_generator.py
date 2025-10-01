import asyncio
import json
import os
import io
import requests
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
from PIL import Image
from io import BytesIO
import google.generativeai as genai
from loguru import logger

from config.settings import settings
from .translator import translator
from .database import db

class ImageGenerator:
    def __init__(self):
        # Настраиваем Gemini
        genai.configure(api_key=settings.google_api_key)
        self.text_model = genai.GenerativeModel(settings.gemini_model)
        self.image_model = genai.GenerativeModel(settings.gemini_image_model)
        self.prompts = self._load_prompts()
    
    def _load_prompts(self) -> Dict:
        """Загружаем промпты из JSON файла"""
        try:
            prompts_path = os.path.join(settings.prompts_dir, "story_generation.json")
            with open(prompts_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Ошибка загрузки промптов для изображений: {e}")
            return {}
    
    def _build_character_descriptions(self, characters: List[Dict]) -> str:
        """Создаем описания персонажей для консистентности"""
        if not characters:
            return ""
        
        descriptions = []
        for char in characters:
            # Используем полное описание если есть, иначе старую структуру для совместимости
            if 'full_description' in char and char['full_description']:
                desc = f"{char['name']}: {char['full_description']}"
            else:
                # Fallback для старых записей
                parts = []
                if char.get('appearance'):
                    parts.append(char['appearance'])
                if char.get('personality'):
                    parts.append(char['personality'])
                desc = f"{char['name']}: {', '.join(parts)}"
            
            descriptions.append(desc)
        
        return "; ".join(descriptions)
    
    def _build_illustration_prompt(
        self, 
        scene_description: str, 
        characters: List[Dict],
        book_title: str = ""
    ) -> str:
        """Создаем полный промпт для иллюстрации"""
        
        # Базовый стиль
        illustration_config = self.prompts.get("illustration_prompts", {})
        base_style = illustration_config.get("style_base", 
                                           "Children's book illustration, cartoon style, bright colors, friendly atmosphere")
        
        # Описания персонажей
        character_descriptions = self._build_character_descriptions(characters)
        
        # Собираем промпт
        prompt_parts = [
            base_style,
            f"Scene: {scene_description}",
        ]
        
        if character_descriptions:
            prompt_parts.append(f"Characters should look like: {character_descriptions}")
        
        if book_title:
            prompt_parts.append(f"This is for the children's book '{book_title}'")
        
        # Дополнительные требования качества
        quality_requirements = illustration_config.get("quality_requirements", 
                                                      "High quality illustration, no text or words")
        prompt_parts.extend([
            "Make it suitable for children aged 6-10",
            "Use bright, warm colors", 
            "Safe and family-friendly content",
            quality_requirements
        ])
        
        return ". ".join(prompt_parts)
    
    async def generate_illustration(
        self,
        scene_description: str,
        characters: List[Dict],
        book_title: str = "",
        book_description: str = ""
    ) -> Optional[str]:
        """
        Генерируем иллюстрацию для сцены
        Автоматически выбирает между новой системой с референсами и старой системой
        
        Returns:
            Путь к изображению или None при ошибке
        """
        try:
            logger.info(f"Генерируем иллюстрацию: {scene_description[:50]}...")
            
            # Получаем персонажей с референсами из БД
            if characters and len(characters) > 0:
                book_id = characters[0].get('book_id')
                if book_id:
                    characters_with_refs = await db.get_characters_with_references(book_id)
                    
                    # Если есть персонажи с референсами, используем новую систему
                    if any(char.get('has_reference') for char in characters_with_refs):
                        logger.info("🎯 Используем новую систему с референсами")
                        return await self.generate_scene_with_references(
                            scene_description, 
                            characters_with_refs, 
                            book_title
                        )
            
            # Fallback на старую систему
            logger.info("📦 Используем старую систему без референсов")
            return await self._generate_illustration_legacy(
                scene_description, 
                characters, 
                book_title
            )
                
        except Exception as e:
            logger.error(f"Ошибка генерации иллюстрации: {e}")
            return None
    
    async def _generate_illustration_legacy(
        self,
        scene_description: str,
        characters: List[Dict],
        book_title: str = ""
    ) -> Optional[str]:
        """
        Старая система генерации иллюстраций (без референсов)
        """
        try:
            # Создаем промпт для изображения
            full_prompt = self._build_illustration_prompt(
                scene_description, 
                characters, 
                book_title
            )
            
            logger.debug(f"Legacy промпт для Gemini: {full_prompt}")
            
            # Генерируем изображение через Gemini Imagen
            response = await self._generate_with_gemini_imagen(full_prompt)
            
            if response:
                logger.info("Иллюстрация успешно сгенерирована через legacy систему")
                return response
            else:
                logger.warning("Legacy система не смогла сгенерировать изображение")
                return None
                
        except Exception as e:
            logger.error(f"Ошибка legacy генерации иллюстрации: {e}")
            return None
    
    async def _generate_with_gemini_imagen(self, prompt: str) -> Optional[str]:
        """
        Генерация изображения через Gemini 2.5 Flash Image (Nano Banana)
        
        Returns:
            URL изображения или None при ошибке
        """
        try:
            logger.info("Пытаемся сгенерировать изображение через Gemini 2.5 Flash Image")
            
            # Используем правильную модель для генерации изображений
            response = self.image_model.generate_content([prompt])
            
            logger.info("✅ Ответ от Gemini получен!")
            
            # Проверяем ответ
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content.parts:
                    logger.info(f"📊 Количество parts: {len(candidate.content.parts)}")
                    
                    for i, part in enumerate(candidate.content.parts):
                        logger.debug(f"🔍 Обрабатываем part {i}")
                        
                        # Проверяем на inline_data (встроенные данные изображения)
                        if hasattr(part, 'inline_data') and part.inline_data:
                            mime_type = part.inline_data.mime_type
                            image_data = part.inline_data.data  # Это уже bytes!
                            
                            logger.info(f"🎨 Найдено изображение в inline_data!")
                            logger.info(f"   MIME: {mime_type}")
                            logger.info(f"   Тип данных: {type(image_data)}")
                            logger.info(f"   Размер: {len(image_data)} байт")
                            
                            # Проверяем PNG signature
                            if image_data.startswith(b'\x89PNG'):
                                logger.info("✅ Валидный PNG файл!")
                                
                                # Сохраняем изображение временно и возвращаем локальный URL
                                # TODO: В будущем - загрузить в облачное хранилище
                                return await self._save_temp_image(image_data, mime_type)
                            else:
                                logger.warning(f"❌ Неизвестный формат изображения: {image_data[:8]}")
                                continue
                        
                        # Проверяем на текст для отладки
                        elif hasattr(part, 'text') and part.text:
                            logger.debug(f"💬 Текст в ответе: {part.text[:100]}...")
            
            logger.warning("❌ Изображение не найдено в ответе Gemini")
            
            # Переходим на fallback DALL-E
            logger.info("Переключаемся на DALL-E как fallback")
            return await self._generate_with_dalle_fallback(prompt)
            
        except Exception as e:
            logger.error(f"Ошибка генерации через Gemini 2.5 Flash Image: {e}")
            import traceback
            logger.error(traceback.format_exc())
            logger.info("Переключаемся на DALL-E как fallback")
            return await self._generate_with_dalle_fallback(prompt)
    
    async def generate_character_reference(self, character_id: str, name: str, description: str) -> bool:
        """
        Генерируем и сохраняем референс персонажа
        
        Returns:
            True если референс успешно создан и сохранен
        """
        try:
            logger.info(f"Генерируем референс для персонажа {name}")

            # Строим промпт для генерации referencer
            reference_prompt = self._build_character_reference_prompt(name, description)
            
            logger.debug(f"Промпт для референса {name}: {reference_prompt}")
            
            # Генерируем изображение
            response = self.image_model.generate_content([reference_prompt])
            
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data
                            
                            # Проверяем что это валидное изображение
                            if image_data.startswith(b'\x89PNG'):
                                logger.info(f"✅ Референс для {name} сгенерирован успешно")
                                logger.info(f"📏 Исходный размер: {len(image_data)} байт")
                                
                                # Сжимаем изображение до разумного размера
                                compressed_image = self._compress_reference_image(image_data)
                                logger.info(f"📏 Сжатый размер: {len(compressed_image)} байт")
                                
                                # Сохраняем сжатое изображение в БД
                                success = await db.save_character_reference(
                                    character_id, 
                                    compressed_image, 
                                    reference_prompt
                                )
                                
                                if success:
                                    logger.info(f"✅ Референс для {name} сохранен в БД")
                                    return True
                                else:
                                    logger.error(f"❌ Не удалось сохранить референс для {name} в БД")
                                    return False
            
            logger.warning(f"❌ Не удалось сгенерировать референс для {name}")
            return False
            
        except Exception as e:
            logger.error(f"Ошибка генерации референса для {name}: {e}")
            return False
    
    def _build_character_reference_prompt(self, name: str, description: str) -> str:
        """Строим оптимизированный промпт для создания референса персонажа"""

        prompt = f"""
Simple Disney-Pixar character portrait, minimalist 2D cartoon style, basic rounded features.

{description}

Create a small, simple character reference image. Basic cartoon portrait, minimal details, clean style, small size. White background, no complex elements, just the character.
"""
        return prompt.strip()
    
    def _compress_reference_image(self, image_data: bytes) -> bytes:
        """Сжимаем референс изображение до разумного размера"""
        try:
            # Открываем изображение
            img = Image.open(BytesIO(image_data))
            
            # Уменьшаем до 512x512 если больше
            max_size = 512
            if img.width > max_size or img.height > max_size:
                img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                logger.info(f"🔽 Изображение уменьшено до {img.width}x{img.height}")
            
            # Сохраняем с оптимизацией
            output = BytesIO()
            img.save(output, format='PNG', optimize=True, compress_level=6)
            
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Ошибка сжатия изображения: {e}")
            # Возвращаем оригинал если сжатие не удалось
            return image_data
    
    async def generate_scene_with_references(
        self,
        scene_description: str,
        characters: List[Dict],
        book_title: str = ""
    ) -> Optional[str]:
        """
        Генерируем сцену используя референсы персонажей
        
        Args:
            scene_description: Описание сцены
            characters: Список персонажей с референсами
            book_title: Название книги
        
        Returns:
            Путь к сгенерированному изображению или None
        """
        try:
            logger.info(f"Генерируем сцену с референсами: {scene_description[:50]}...")

            # Фильтруем персонажей с референсами
            characters_with_refs = [char for char in characters if char.get('has_reference') and char.get('reference_image')]

            if not characters_with_refs:
                logger.warning("Нет персонажей с референсами, используем fallback")
                return await self._generate_scene_fallback(scene_description, characters, book_title)

            # Строим промпт для сцены
            scene_prompt = self._build_scene_with_references_prompt(
                scene_description, 
                characters_with_refs,
                book_title
            )
            
            logger.debug(f"Промпт для сцены: {scene_prompt}")
            
            # Подготавливаем изображения персонажей для Gemini
            reference_images = []
            for char in characters_with_refs:
                image_pil = Image.open(BytesIO(char['reference_image']))
                reference_images.append(image_pil)
            
            # Генерируем сцену
            content_list = reference_images + [scene_prompt]
            response = self.image_model.generate_content(content_list)
            
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data
                            
                            if image_data.startswith(b'\x89PNG'):
                                logger.info("✅ Сцена с референсами сгенерирована успешно")
                                return await self._save_temp_image(image_data, part.inline_data.mime_type)
            
            logger.warning("Не удалось сгенерировать сцену с референсами, переходим на fallback")
            return await self._generate_scene_fallback(scene_description, characters, book_title)
            
        except Exception as e:
            logger.error(f"Ошибка генерации сцены с референсами: {e}")
            return await self._generate_scene_fallback(scene_description, characters, book_title)
    
    def _build_scene_with_references_prompt(
        self,
        scene_description: str,
        characters_with_refs: List[Dict],
        book_title: str = ""
    ) -> str:
        """Строим промпт для сцены с использованием referencer"""

        # Базовый стиль
        style = "Disney-Pixar children's book illustration, 2D cartoon art, bright cheerful colors."

        # Описание персонажей и их связь с референсами
        character_instructions = []
        for i, char in enumerate(characters_with_refs, 1):
            character_instructions.append(
                f"{i}. {char['name']}: Reference image {i} shows this character"
            )

        characters_text = "Characters (maintain exact appearance from reference images):\n" + "\n".join(character_instructions)

        # Композиция
        composition = "Composition: Wide shot showing all characters clearly, warm lighting, clean composition suitable for children's book."

        # Технические требования
        technical = "Technical: High quality illustration, no text or words in image, family-friendly content, clear and simple composition."

        prompt = f"""
Style: {style}

{characters_text}

Scene: {scene_description}

{composition}
{technical}
"""
        return prompt.strip()
    
    async def _generate_scene_fallback(
        self,
        scene_description: str,
        characters: List[Dict],
        book_title: str = ""
    ) -> Optional[str]:
        """Fallback генерация сцены без референсов (старая система)"""
        logger.info("Используем fallback генерацию без референсов")
        
        return await self.generate_illustration(
            scene_description=scene_description,
            characters=characters,
            book_title=book_title
        )
    
    async def _save_temp_image(self, image_data: bytes, mime_type: str) -> Optional[str]:
        """
        Сохраняем изображение во временную папку и возвращаем специальный маркер
        для дальнейшей обработки в боте
        
        TODO: В будущем заменить на загрузку в облачное хранилище
        """
        try:
            # Создаем папку для временных изображений
            temp_dir = Path(settings.project_root) / "temp_images"
            temp_dir.mkdir(exist_ok=True)
            
            # Определяем расширение файла
            extension = ".png"  # По умолчанию PNG
            if mime_type:
                if "jpeg" in mime_type or "jpg" in mime_type:
                    extension = ".jpg"
                elif "webp" in mime_type:
                    extension = ".webp"
            
            # Создаем уникальное имя файла
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"gemini_generated_{timestamp}{extension}"
            filepath = temp_dir / filename
            
            # Сохраняем изображение
            with open(filepath, 'wb') as f:
                f.write(image_data)
            
            logger.info(f"💾 Изображение сохранено временно: {filepath}")
            logger.info(f"📏 Размер файла: {len(image_data)} байт")
            
            # Возвращаем путь к локальному файлу
            # Бот будет использовать этот путь для отправки файла в Telegram
            return str(filepath.absolute())
            
        except Exception as e:
            logger.error(f"Ошибка сохранения временного изображения: {e}")
            return None
    
    async def _generate_with_dalle_fallback(self, prompt: str) -> Optional[str]:
        """
        Fallback генерация через DALL-E
        """
        try:
            from openai import OpenAI
            openai_client = OpenAI(api_key=settings.openai_api_key)
            
            # Ограничиваем длину промпта для DALL-E
            if len(prompt) > 1000:
                prompt = prompt[:997] + "..."
            
            logger.debug(f"Fallback DALL-E промпт: {prompt}")
            
            response = openai_client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size="1024x1024",
                quality="standard",
                n=1,
            )
            
            return response.data[0].url
            
        except Exception as e:
            logger.error(f"Ошибка fallback генерации через DALL-E: {e}")
            return None
    
    async def generate_illustration_dalle(
        self,
        scene_description: str,
        characters: List[Dict],
        book_title: str = ""
    ) -> Optional[str]:
        """
        Альтернативная генерация через DALL-E (OpenAI)
        
        Returns:
            URL изображения или None при ошибке
        """
        try:
            from openai import OpenAI
            openai_client = OpenAI(api_key=settings.openai_api_key)
            
            # Создаем промпт для DALL-E
            prompt = self._build_illustration_prompt(scene_description, characters, book_title)
            
            # Ограничиваем длину промпта для DALL-E (максимум 1000 символов)
            if len(prompt) > 1000:
                prompt = prompt[:997] + "..."
            
            logger.info(f"Генерируем иллюстрацию через DALL-E: {scene_description[:50]}...")
            logger.debug(f"Полный промпт для DALL-E: {prompt}")
            
            response = openai_client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size="1024x1024",
                quality="standard",
                n=1,
            )
            
            image_url = response.data[0].url
            logger.info("Иллюстрация успешно сгенерирована через DALL-E")
            return image_url
            
        except Exception as e:
            logger.error(f"Ошибка генерации иллюстрации через DALL-E: {e}")
            return None
    
    async def download_image(self, image_url: str) -> Optional[bytes]:
        """Скачиваем изображение по URL"""
        try:
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            return response.content
        except Exception as e:
            logger.error(f"Ошибка скачивания изображения: {e}")
            return None

    def generate_illustration_sync(
        self,
        scene_description: str,
        characters: List[Dict],
        book_title: str = ""
    ) -> Optional[str]:
        """
        СИНХРОННАЯ генерация иллюстрации для использования в отдельном потоке
        Минимальная версия без дублирования логики
        """
        try:
            logger.info(f"🚀 Синхронная генерация иллюстрации: {scene_description[:50]}...")

            # Получаем персонажей с референсами из БД (синхронно)
            characters_with_refs = None
            if characters and len(characters) > 0:
                book_id = characters[0].get('book_id')
                if book_id:
                    # Прямой синхронный запрос к Supabase
                    result = db.supabase.table("characters").select(
                        "id, name, full_description, has_reference, reference_image"
                    ).eq("book_id", book_id).execute()

                    if result.data:
                        # Обрабатываем reference_image (декодируем hex → bytes)
                        characters_with_refs = []
                        for char_data in result.data:
                            char = {
                                "id": char_data["id"],
                                "name": char_data["name"],
                                "full_description": char_data["full_description"],
                                "has_reference": char_data["has_reference"]
                            }

                            # Декодируем hex данные в bytes
                            if char_data["has_reference"] and char_data.get("reference_image"):
                                hex_data = char_data["reference_image"]
                                if isinstance(hex_data, str) and hex_data.startswith("\\x"):
                                    hex_string = hex_data[2:]
                                    char["reference_image"] = bytes.fromhex(hex_string)
                                elif isinstance(hex_data, bytes):
                                    char["reference_image"] = hex_data

                            characters_with_refs.append(char)

                        # Если есть персонажи с референсами, используем систему с референсами
                        if any(char.get('has_reference') and char.get('reference_image') for char in characters_with_refs):
                            logger.info("🎯 Используем систему с референсами (синхронно)")
                            return self._generate_scene_with_references_sync(
                                scene_description,
                                characters_with_refs,
                                book_title
                            )

            # Fallback на старую систему без референсов
            logger.info("📦 Используем систему без референсов (синхронно)")
            return self._generate_illustration_legacy_sync(
                scene_description,
                characters,
                book_title
            )

        except Exception as e:
            logger.error(f"Ошибка синхронной генерации иллюстрации: {e}")
            return None

    def _generate_scene_with_references_sync(
        self,
        scene_description: str,
        characters_with_refs: List[Dict],
        book_title: str = ""
    ) -> Optional[str]:
        """Синхронная генерация сцены с референсами"""
        try:
            # Фильтруем персонажей с референсами
            characters_with_valid_refs = [
                char for char in characters_with_refs
                if char.get('has_reference') and char.get('reference_image')
            ]

            if not characters_with_valid_refs:
                logger.warning("Нет персонажей с референсами, fallback")
                return self._generate_illustration_legacy_sync(scene_description, characters_with_refs, book_title)

            # Строим промпт
            scene_prompt = self._build_scene_with_references_prompt(
                scene_description,
                characters_with_valid_refs,
                book_title
            )

            # Подготавливаем изображения персонажей
            reference_images = []
            for char in characters_with_valid_refs:
                image_pil = Image.open(BytesIO(char['reference_image']))
                reference_images.append(image_pil)

            # Генерируем сцену СИНХРОННО
            content_list = reference_images + [scene_prompt]
            response = self.image_model.generate_content(content_list)

            # Обрабатываем ответ
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data
                            if image_data.startswith(b'\x89PNG'):
                                logger.info("✅ Сцена с референсами сгенерирована (синхронно)")
                                return self._save_temp_image_sync(image_data, part.inline_data.mime_type)

            logger.warning("Не удалось сгенерировать сцену с референсами")
            return self._generate_illustration_legacy_sync(scene_description, characters_with_refs, book_title)

        except Exception as e:
            logger.error(f"Ошибка генерации сцены с референсами (синхронно): {e}")
            return self._generate_illustration_legacy_sync(scene_description, characters_with_refs, book_title)

    def _generate_illustration_legacy_sync(
        self,
        scene_description: str,
        characters: List[Dict],
        book_title: str = ""
    ) -> Optional[str]:
        """Синхронная генерация без референсов"""
        try:
            # Создаем промпт
            full_prompt = self._build_illustration_prompt(scene_description, characters, book_title)

            # Генерируем изображение СИНХРОННО
            response = self.image_model.generate_content([full_prompt])

            # Обрабатываем ответ
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data
                            if image_data.startswith(b'\x89PNG'):
                                logger.info("✅ Иллюстрация сгенерирована (синхронно)")
                                return self._save_temp_image_sync(image_data, part.inline_data.mime_type)

            logger.warning("Не удалось сгенерировать изображение")
            return None

        except Exception as e:
            logger.error(f"Ошибка генерации иллюстрации (синхронно): {e}")
            return None

    def _save_temp_image_sync(self, image_data: bytes, mime_type: str) -> Optional[str]:
        """Синхронное сохранение изображения"""
        try:
            temp_dir = Path(settings.project_root) / "temp_images"
            temp_dir.mkdir(exist_ok=True)

            extension = ".png"
            if mime_type and ("jpeg" in mime_type or "jpg" in mime_type):
                extension = ".jpg"
            elif mime_type and "webp" in mime_type:
                extension = ".webp"

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"gemini_generated_{timestamp}{extension}"
            filepath = temp_dir / filename

            with open(filepath, 'wb') as f:
                f.write(image_data)

            logger.info(f"💾 Изображение сохранено: {filepath}")
            return str(filepath.absolute())

        except Exception as e:
            logger.error(f"Ошибка сохранения изображения: {e}")
            return None

    async def generate_illustration_threaded_async(
        self,
        scene_description: str,
        characters: List[Dict],
        book_title: str = "",
        book_description: str = ""
    ) -> Optional[str]:
        """
        Асинхронная обертка для параллельной генерации
        Использует asyncio.to_thread() для неблокирующей работы
        """
        try:
            logger.info(f"🚀 Запуск параллельной генерации иллюстрации")

            # Запускаем синхронную функцию в отдельном потоке
            result = await asyncio.to_thread(
                self.generate_illustration_sync,
                scene_description,
                characters,
                book_title
            )

            logger.info(f"✅ Параллельная генерация завершена")
            return result

        except Exception as e:
            logger.error(f"Ошибка параллельной генерации: {e}")
            return None

    def generate_character_reference_data_sync(self, name: str, description: str) -> Optional[bytes]:
        """
        СИНХРОННАЯ генерация данных референса персонажа (БЕЗ сохранения в БД)
        Переиспользует логику из generate_character_reference
        """
        try:
            logger.info(f"🚀 Генерация референса для {name} (синхронно)")

            # Строим промпт
            reference_prompt = self._build_character_reference_prompt(name, description)

            # Генерируем изображение СИНХРОННО
            response = self.image_model.generate_content([reference_prompt])

            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data

                            if image_data.startswith(b'\x89PNG'):
                                logger.info(f"✅ Референс для {name} сгенерирован")

                                # Сжимаем и возвращаем (НЕ сохраняем в БД)
                                compressed_image = self._compress_reference_image(image_data)
                                return compressed_image

            logger.warning(f"❌ Не удалось сгенерировать референс для {name}")
            return None

        except Exception as e:
            logger.error(f"Ошибка генерации референса для {name}: {e}")
            return None

    async def generate_character_reference_data_threaded_async(self, name: str, description: str) -> Optional[bytes]:
        """
        Асинхронная обертка для параллельной генерации референса персонажа
        Использует asyncio.to_thread() для неблокирующей работы
        """
        try:
            logger.info(f"🚀 Запуск параллельной генерации референса для {name}")

            # Запускаем синхронную функцию в отдельном потоке
            result = await asyncio.to_thread(
                self.generate_character_reference_data_sync,
                name,
                description
            )

            logger.info(f"✅ Параллельная генерация referencer завершена для {name}")
            return result

        except Exception as e:
            logger.error(f"Ошибка параллельной генерации референса для {name}: {e}")
            return None

# Глобальный экземпляр
image_generator = ImageGenerator()