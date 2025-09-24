-- Миграция: Добавление поддержки референсов персонажей
-- Дата: 2025-09-23
-- Описание: Добавляем поля для хранения reference изображений персонажей в БД

-- Добавляем новые поля в таблицу characters
ALTER TABLE characters 
ADD COLUMN reference_image BYTEA,
ADD COLUMN reference_prompt TEXT,
ADD COLUMN has_reference BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN reference_created_at TIMESTAMP WITH TIME ZONE;

-- Создаем индекс для быстрого поиска персонажей с референсами
CREATE INDEX idx_characters_has_reference ON characters(has_reference) WHERE has_reference = TRUE;

-- Добавляем комментарии к новым полям
COMMENT ON COLUMN characters.reference_image IS 'PNG изображение-референс персонажа в формате BYTEA';
COMMENT ON COLUMN characters.reference_prompt IS 'Промпт, использованный для генерации референса';
COMMENT ON COLUMN characters.has_reference IS 'Флаг наличия референса у персонажа';
COMMENT ON COLUMN characters.reference_created_at IS 'Время создания референса';

-- Добавляем ограничение: если has_reference = true, то reference_image не должен быть NULL
ALTER TABLE characters 
ADD CONSTRAINT check_reference_consistency 
CHECK (
    (has_reference = FALSE) OR 
    (has_reference = TRUE AND reference_image IS NOT NULL AND reference_prompt IS NOT NULL)
);

-- Информация о миграции
INSERT INTO migrations (name, executed_at) 
VALUES ('add_character_references_20250923', NOW())
ON CONFLICT (name) DO NOTHING;