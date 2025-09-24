import asyncio
import json
import os
from typing import List, Dict, Optional
from openai import OpenAI
from loguru import logger

from config.settings import settings

class AIGenerator:
    def __init__(self):
        self.openai_client = OpenAI(api_key=settings.openai_api_key)
        self.prompts = self._load_prompts()
    
    def _load_prompts(self) -> Dict:
        """Загружаем промпты из JSON файла"""
        try:
            prompts_path = os.path.join(settings.prompts_dir, "story_generation.json")
            with open(prompts_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Ошибка загрузки промптов: {e}")
            return {}
    
    def _build_system_prompt(self) -> str:
        """Создаем системный промпт для генерации"""
        if not self.prompts:
            return "Ты - мастер создания детских историй. Пиши добрые, понятные и увлекательные истории для детей 6-10 лет."
        
        system_config = self.prompts.get("system_prompt", {})
        base = system_config.get("base", "")
        guidelines = system_config.get("guidelines", [])
        restrictions = system_config.get("restrictions", [])
        
        prompt = base + "\n\n"
        
        if guidelines:
            prompt += "Принципы написания:\n"
            for guideline in guidelines:
                prompt += f"- {guideline}\n"
            prompt += "\n"
        
        if restrictions:
            prompt += "Ограничения:\n"
            for restriction in restrictions:
                prompt += f"- {restriction}\n"
            prompt += "\n"
        
        return prompt
    
    def _format_characters_list(self, characters: List[Dict]) -> str:
        """Форматируем список персонажей для промпта"""
        if not characters:
            return "Персонажей пока нет."
        
        char_template = self.prompts.get("character_prompts", {}).get("character_description_template", 
                                                                     "Персонаж: {name}\nОписание: {description}\nВнешность: {appearance}\nХарактер: {personality}")
        
        characters_text = ""
        for char in characters:
            # Используем новую структуру с full_description или fallback для старых записей
            if 'full_description' in char and char['full_description']:
                char_text = f"Персонаж: {char['name']}\nОписание: {char['full_description']}"
            else:
                # Fallback для старых записей (если остались)
                char_text = char_template.format(
                    name=char['name'],
                    description=char.get('description', ''),
                    appearance=char.get('appearance', ''),
                    personality=char.get('personality', '')
                )
            characters_text += char_text + "\n\n"
        
        return characters_text.strip()
    
    def _format_previous_chapters(self, chapters: List[Dict]) -> str:
        """Форматируем предыдущие главы для контекста"""
        if not chapters:
            return "Это первая глава книги."
        
        chapters_text = ""
        for chapter in chapters:
            chapters_text += f"Глава {chapter['chapter_number']}: {chapter['title'] or 'Без названия'}\n"
            # Сокращаем содержание для экономии токенов
            content = chapter['content'][:200] + "..." if len(chapter['content']) > 200 else chapter['content']
            chapters_text += f"{content}\n\n"
        
        return chapters_text.strip()
    
    def _extract_illustration_prompt(self, chapter_content: str) -> str:
        """Извлекаем промпт для иллюстрации из текста главы"""
        # Ищем паттерн [ИЛЛЮСТРАЦИЯ: описание]
        import re
        pattern = r'\[ИЛЛЮСТРАЦИЯ:\s*([^\]]+)\]'
        match = re.search(pattern, chapter_content, re.IGNORECASE)
        
        if match:
            return match.group(1).strip()
        
        # Если не найден, создаем общее описание
        return "сцена из детской книги с главными персонажами"
    
    async def generate_chapter(
        self, 
        book_title: str,
        book_description: str,
        characters: List[Dict],
        previous_chapters: List[Dict],
        chapter_hint: str = "",
        word_count: int = 600
    ) -> Dict:
        """
        Генерируем главу книги
        
        Returns:
            Dict с ключами: content, title, illustration_prompt, word_count
        """
        try:
            # Подготавливаем данные для промпта
            characters_list = self._format_characters_list(characters)
            previous_chapters_text = self._format_previous_chapters(previous_chapters)
            chapter_number = len(previous_chapters) + 1
            
            # Создаем промпт
            chapter_config = self.prompts.get("chapter_generation", {})
            template = chapter_config.get("template", 
                "Напиши главу детской книги длиной примерно {word_count} слов.\n\n"
                "Название: {book_title}\nОписание: {book_description}\n\n"
                "Персонажи:\n{characters_list}\n\n"
                "Предыдущие главы:\n{previous_chapters}\n\n"
                "Тема этой главы: {chapter_hint}")
            
            user_prompt = template.format(
                word_count=word_count,
                book_title=book_title,
                book_description=book_description,
                characters_list=characters_list,
                previous_chapters=previous_chapters_text,
                chapter_hint=chapter_hint or "Продолжи историю интересным и захватывающим образом"
            )
            
            # Генерируем текст
            logger.info(f"Генерируем главу {chapter_number} для книги '{book_title}'")
            
            response = self.openai_client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": self._build_system_prompt()},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.8,  # Для творческого контента
                max_tokens=1500,  # Достаточно для ~600-800 слов
            )
            
            chapter_content = response.choices[0].message.content.strip()
            
            # Извлекаем промпт для иллюстрации
            illustration_prompt = self._extract_illustration_prompt(chapter_content)
            
            # Убираем [ИЛЛЮСТРАЦИЯ: ...] из основного текста
            import re
            clean_content = re.sub(r'\[ИЛЛЮСТРАЦИЯ:[^\]]+\]', '', chapter_content, flags=re.IGNORECASE).strip()
            
            # Подсчитываем слова (приблизительно)
            word_count_actual = len(clean_content.split())
            
            # Генерируем заголовок главы
            chapter_title = f"Глава {chapter_number}"
            
            result = {
                'content': clean_content,
                'title': chapter_title,
                'illustration_prompt': illustration_prompt,
                'word_count': word_count_actual
            }
            
            logger.info(f"Глава сгенерирована: {word_count_actual} слов")
            return result
            
        except Exception as e:
            logger.error(f"Ошибка генерации главы: {e}")
            raise Exception(f"Не удалось сгенерировать главу: {str(e)}")

# Глобальный экземпляр
ai_generator = AIGenerator()