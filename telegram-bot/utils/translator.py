"""
Модуль для перевода текстов на английский язык для лучшей работы с Gemini
"""

import json
from typing import Dict, Optional
from loguru import logger
import google.generativeai as genai
from config.settings import settings

class Translator:
    def __init__(self):
        # Кэш переводов для оптимизации
        self._cache: Dict[str, str] = {}
        
        # Настраиваем Gemini для переводов
        genai.configure(api_key=settings.google_api_key)
        self.model = genai.GenerativeModel(settings.gemini_model)
    
    def translate_to_english_sync(self, russian_text: str) -> str:
        """
        СИНХРОННАЯ версия перевода для использования в отдельном потоке
        """
        # Проверяем кэш
        if russian_text in self._cache:
            return self._cache[russian_text]
        
        try:
            prompt = f"""
Translate the following Russian text to English. Keep names (like "Марк", "Рома") in original form.
Focus on preserving the meaning and context for children's book illustrations.

Russian text: {russian_text}

Translate to English:"""

            response = self.model.generate_content([prompt])
            
            if hasattr(response, 'text') and response.text:
                english_text = response.text.strip()
                
                # Сохраняем в кэш
                self._cache[russian_text] = english_text
                
                logger.debug(f"Перевод: '{russian_text[:50]}...' -> '{english_text[:50]}...'")
                return english_text
            
            # Fallback - возвращаем оригинал если перевод не удался
            logger.warning(f"Перевод не удался для: {russian_text[:50]}...")
            return russian_text
            
        except Exception as e:
            logger.error(f"Ошибка перевода: {e}")
            return russian_text
    
    async def translate_to_english(self, russian_text: str) -> str:
        """
        Переводит русский текст на английский
        Использует кэш для оптимизации повторных переводов
        """
        # Проверяем кэш
        if russian_text in self._cache:
            return self._cache[russian_text]
        
        try:
            prompt = f"""
Translate the following Russian text to English. Keep names (like "Марк", "Рома") in original form.
Focus on preserving the meaning and context for children's book illustrations.

Russian text: {russian_text}

Translate to English:"""

            response = self.model.generate_content([prompt])
            
            if hasattr(response, 'text') and response.text:
                english_text = response.text.strip()
                
                # Сохраняем в кэш
                self._cache[russian_text] = english_text
                
                logger.debug(f"Перевод: '{russian_text[:50]}...' -> '{english_text[:50]}...'")
                return english_text
            
            # Fallback - возвращаем оригинал если перевод не удался
            logger.warning(f"Не удалось перевести текст, используем оригинал: {russian_text[:50]}")
            return russian_text
            
        except Exception as e:
            logger.error(f"Ошибка перевода: {e}")
            # Fallback - возвращаем оригинал
            return russian_text
    
    def clear_cache(self):
        """Очистить кэш переводов"""
        self._cache.clear()
        logger.info("Кэш переводов очищен")

# Глобальный экземпляр
translator = Translator()