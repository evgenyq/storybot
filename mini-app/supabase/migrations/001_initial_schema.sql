-- StoryBot Mini App - Initial Database Schema
-- Run this migration to set up the database

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS public.illustrations CASCADE;
DROP TABLE IF EXISTS public.chapters CASCADE;
DROP TABLE IF EXISTS public.book_characters CASCADE;
DROP TABLE IF EXISTS public.books CASCADE;
DROP TABLE IF EXISTS public.characters CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.user_sessions CASCADE;

-- Users table
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    settings JSONB DEFAULT '{"chapter_size": 500, "images_per_chapter": 2}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Characters table (global, linked to user not book)
CREATE TABLE public.characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,  -- URL to Supabase Storage
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Books table
CREATE TABLE public.books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,  -- First illustration or generated cover
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Book-Characters relationship (many-to-many)
CREATE TABLE public.book_characters (
    book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
    character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (book_id, character_id)
);

-- Chapters table
CREATE TABLE public.chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
    chapter_number INT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(book_id, chapter_number)
);

-- Illustrations table (multiple per chapter)
CREATE TABLE public.illustrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    prompt TEXT,  -- Generation prompt for debugging
    position INT DEFAULT 0,  -- Order within chapter
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX idx_characters_user_id ON public.characters(user_id);
CREATE INDEX idx_books_user_id ON public.books(user_id);
CREATE INDEX idx_books_status ON public.books(status);
CREATE INDEX idx_book_characters_book_id ON public.book_characters(book_id);
CREATE INDEX idx_book_characters_character_id ON public.book_characters(character_id);
CREATE INDEX idx_chapters_book_id ON public.chapters(book_id);
CREATE INDEX idx_chapters_book_chapter ON public.chapters(book_id, chapter_number);
CREATE INDEX idx_illustrations_chapter_id ON public.illustrations(chapter_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_characters_updated_at 
    BEFORE UPDATE ON public.characters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_books_updated_at 
    BEFORE UPDATE ON public.books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at 
    BEFORE UPDATE ON public.chapters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.illustrations ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for Edge Functions)
CREATE POLICY "Service role has full access to users" ON public.users
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to characters" ON public.characters
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to books" ON public.books
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to book_characters" ON public.book_characters
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to chapters" ON public.chapters
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to illustrations" ON public.illustrations
    FOR ALL USING (true) WITH CHECK (true);

