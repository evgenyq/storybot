import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Telegram
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    # OpenAI
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4")
    
    # Google Gemini
    google_api_key: str = os.getenv("GOOGLE_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
    gemini_image_model: str = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image-preview")
    
    # Supabase
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_key: str = os.getenv("SUPABASE_KEY", "")
    
    # App settings
    environment: str = os.getenv("ENVIRONMENT", "development")
    log_level: str = os.getenv("LOG_LEVEL", "DEBUG")
    
    # Story settings
    default_chapter_length: int = 600
    max_chapter_length: int = 800
    min_chapter_length: int = 400
    
    # File paths
    prompts_dir: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "prompts")
    project_root: str = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    
    def __init__(self):
        # Все настройки уже загружены через os.getenv выше
        pass

settings = Settings()