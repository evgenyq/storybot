import json
import re
from typing import Dict, List, Optional
from loguru import logger

class CharacterAnalyzer:
    def __init__(self):
        self._prompts = None
    
    @property
    def prompts(self):
        """Ленивая загрузка промптов"""
        if self._prompts is None:
            from utils.ai_generator import ai_generator
            self._prompts = ai_generator.prompts
        return self._prompts
    
    async def analyze_character_description(self, name: str, description: str) -> Dict:
        """
        Анализирует описание персонажа и определяет, что нужно уточнить
        
        Returns:
            {
                "missing_fields": ["appearance", "personality"],
                "clarification_question": "Расскажи побольше о том, как выглядит Мурзик?"
            }
        """
        try:
            # Простой анализ без сложных промптов пока что
            logger.debug(f"Анализируем описание персонажа: {description[:50]}...")
            
            # Простая логика: если описание очень короткое, просим уточнить
            if len(description) < 15:
                return {
                    "missing_fields": ["details"],
                    "clarification_question": f"Расскажи побольше о том, как выглядит {name} и какой у него характер?"
                }
            
            # Проверяем наличие ключевых слов для внешности и характера
            appearance_keywords = ["внешность", "выглядит", "цвет", "размер", "рост", "глаза", "волосы", "шерсть", "большой", "маленький", "рыжий", "белый", "черный"]
            personality_keywords = ["характер", "любит", "добрый", "смелый", "веселый", "умный", "дружелюбный", "храбрый", "озорной"]
            
            has_appearance = any(word in description.lower() for word in appearance_keywords)
            has_personality = any(word in description.lower() for word in personality_keywords)
            
            missing = []
            if not has_appearance:
                missing.append("appearance")
            if not has_personality:
                missing.append("personality")
            
            if missing:
                questions = []
                if "appearance" in missing:
                    questions.append(f"как выглядит {name}")
                if "personality" in missing:
                    questions.append("какой у него характер")
                
                question = f"Расскажи {' и '.join(questions)}?"
                
                return {
                    "missing_fields": missing,
                    "clarification_question": question
                }
            
            # Описание достаточно полное
            return {
                "missing_fields": [],
                "clarification_question": ""
            }
                
        except Exception as e:
            logger.error(f"Ошибка анализа персонажа: {e}")
            return {
                "missing_fields": [],
                "clarification_question": ""
            }
    

# Глобальный экземпляр
character_analyzer = CharacterAnalyzer()