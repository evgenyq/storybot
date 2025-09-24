-- Supabase database schema for StoryBot

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Books table
CREATE TABLE IF NOT EXISTS public.books (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Characters table
CREATE TABLE IF NOT EXISTS public.characters (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    appearance TEXT,
    personality TEXT,
    visual_description TEXT, -- Для консистентности в изображениях
    reference_image BYTEA, -- PNG изображение-референс персонажа
    reference_prompt TEXT, -- Промпт, использованный для генерации референса
    has_reference BOOLEAN DEFAULT FALSE NOT NULL, -- Флаг наличия референса у персонажа
    reference_created_at TIMESTAMP WITH TIME ZONE, -- Время создания референса
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_reference_consistency CHECK (
        (has_reference = FALSE) OR 
        (has_reference = TRUE AND reference_image IS NOT NULL AND reference_prompt IS NOT NULL)
    )
);

-- Chapters table
CREATE TABLE IF NOT EXISTS public.chapters (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    illustration_prompt TEXT,
    illustration_url TEXT,
    word_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(book_id, chapter_number)
);

-- User sessions table (для хранения состояния бота)
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    session_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(telegram_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON public.books(status);
CREATE INDEX IF NOT EXISTS idx_characters_book_id ON public.characters(book_id);
CREATE INDEX IF NOT EXISTS idx_characters_has_reference ON public.characters(has_reference) WHERE has_reference = TRUE;
CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON public.chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_chapters_book_chapter ON public.chapters(book_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_user_sessions_telegram_id ON public.user_sessions(telegram_id);

-- RLS (Row Level Security) policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Policies (пользователи могут видеть только свои данные)
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Users can view own books" ON public.books
    FOR ALL USING (user_id IN (SELECT id FROM public.users WHERE telegram_id = ANY(SELECT telegram_id FROM public.users WHERE id = auth.uid())));

CREATE POLICY "Users can view characters of own books" ON public.characters
    FOR ALL USING (book_id IN (SELECT id FROM public.books WHERE user_id = auth.uid()));

CREATE POLICY "Users can view chapters of own books" ON public.chapters
    FOR ALL USING (book_id IN (SELECT id FROM public.books WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own sessions" ON public.user_sessions
    FOR ALL USING (user_id = auth.uid());

-- Triggers для updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON public.books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON public.user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();