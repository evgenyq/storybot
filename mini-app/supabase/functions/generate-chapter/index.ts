// Supabase Edge Function: Generate Chapter
// Deno runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateChapterRequest {
  book_id: string;
  hint?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;
    const googleKey = Deno.env.get('GOOGLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { book_id, hint }: GenerateChapterRequest = await req.json();

    // Get book details
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*, chapters(*), book_characters(character:characters(*))')
      .eq('id', book_id)
      .single();

    if (bookError || !book) {
      throw new Error('Book not found');
    }

    // Get user settings
    const { data: user } = await supabase
      .from('users')
      .select('settings')
      .eq('id', book.user_id)
      .single();

    const settings = user?.settings || { chapter_size: 500, images_per_chapter: 2 };
    
    // Prepare context
    const characters = book.book_characters?.map((bc: any) => bc.character) || [];
    const previousChapters = book.chapters?.sort((a: any, b: any) => a.chapter_number - b.chapter_number) || [];
    const nextChapterNum = previousChapters.length + 1;

    // Build prompt
    const systemPrompt = `Ты - мастер создания увлекательных детских историй для детей 5-10 лет. 
Пиши добрые, понятные истории без насилия и страшных сцен.
Используй простой язык, яркие описания и живые диалоги.`;

    const charactersText = characters.length > 0
      ? characters.map((c: any) => `- ${c.name}: ${c.description || 'персонаж книги'}`).join('\n')
      : 'Персонажи не указаны';

    const previousText = previousChapters.length > 0
      ? previousChapters.map((ch: any) => 
          `Глава ${ch.chapter_number}: ${ch.content.substring(0, 300)}...`
        ).join('\n\n')
      : 'Это первая глава книги.';

    const userPrompt = `Напиши главу ${nextChapterNum} для детской книги.

Название книги: ${book.title}
Описание: ${book.description || 'Не указано'}

Персонажи:
${charactersText}

Предыдущие главы:
${previousText}

${hint ? `Подсказка для этой главы: ${hint}` : 'Придумай интересное продолжение истории.'}

Требования:
- Длина: примерно ${settings.chapter_size} слов
- Стиль: добрый, увлекательный, подходящий для детей 5-10 лет
- Включи диалоги персонажей
- Закончи главу интригующе, чтобы хотелось читать дальше

В конце добавь строку в формате:
[ИЛЛЮСТРАЦИЯ: краткое описание ключевой сцены для иллюстрации]`;

    // Generate text with OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    const openaiData = await openaiResponse.json();
    let chapterContent = openaiData.choices[0].message.content;

    // Extract illustration prompt
    const illustrationMatch = chapterContent.match(/\[ИЛЛЮСТРАЦИЯ:\s*([^\]]+)\]/i);
    const illustrationPrompt = illustrationMatch?.[1] || `сцена из главы ${nextChapterNum}`;
    
    // Remove illustration tag from content
    chapterContent = chapterContent.replace(/\[ИЛЛЮСТРАЦИЯ:[^\]]+\]/gi, '').trim();

    // Save chapter
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        book_id,
        chapter_number: nextChapterNum,
        title: `Глава ${nextChapterNum}`,
        content: chapterContent,
      })
      .select()
      .single();

    if (chapterError) {
      throw new Error('Failed to save chapter');
    }

    // Generate illustrations
    const illustrations: any[] = [];
    
    for (let i = 0; i < settings.images_per_chapter; i++) {
      try {
        const imageUrl = await generateImage(
          googleKey,
          illustrationPrompt,
          characters,
          book.title
        );

        if (imageUrl) {
          const { data: illustration } = await supabase
            .from('illustrations')
            .insert({
              chapter_id: chapter.id,
              image_url: imageUrl,
              prompt: illustrationPrompt,
              position: i,
            })
            .select()
            .single();

          if (illustration) {
            illustrations.push(illustration);
          }

          // Update book cover with first illustration
          if (i === 0 && !book.cover_url) {
            await supabase
              .from('books')
              .update({ cover_url: imageUrl })
              .eq('id', book_id);
          }
        }
      } catch (imgError) {
        console.error('Image generation error:', imgError);
      }
    }

    return new Response(
      JSON.stringify({
        chapter,
        illustrations,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function generateImage(
  apiKey: string,
  sceneDescription: string,
  characters: any[],
  bookTitle: string
): Promise<string | null> {
  try {
    const characterDescriptions = characters
      .map(c => `${c.name}: ${c.description || ''}`)
      .join('. ');

    const prompt = `Children's book illustration, Disney-Pixar cartoon style, bright cheerful colors, simple 2D art.
Scene: ${sceneDescription}
Characters: ${characterDescriptions}
Style: Cute, friendly, safe for children 5-10 years old. No text in image.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['image', 'text'],
          },
        }),
      }
    );

    const data = await response.json();
    
    // Extract image from response
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        // For now, return base64 data URL
        // TODO: Upload to Supabase Storage and return URL
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }

    return null;
  } catch (error) {
    console.error('Image generation failed:', error);
    return null;
  }
}

