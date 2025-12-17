// Supabase Edge Function: Generate Chapter
// Returns chapter text immediately, illustrations are generated async

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

interface Character {
  id: string;
  name: string;
  description: string;
  image_url?: string;
}

interface PendingIllustration {
  id: string;
  position: number;
  text_position: number;
  prompt: string;
  status: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { book_id, hint }: GenerateChapterRequest = await req.json();

    console.log(`Generating chapter for book: ${book_id}`);

    // Get book details with characters
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
    const imagesCount = settings.images_per_chapter || 2;
    
    // Prepare context
    const characters: Character[] = book.book_characters?.map((bc: any) => bc.character) || [];
    const previousChapters = book.chapters?.sort((a: any, b: any) => a.chapter_number - b.chapter_number) || [];
    const nextChapterNum = previousChapters.length + 1;

    console.log(`Generating chapter ${nextChapterNum}, characters: ${characters.length}, images: ${imagesCount}`);

    // ============ STEP 1: Generate chapter text with OpenAI ============
    
    const systemPrompt = `Ты - мастер создания увлекательных детских историй для детей 5-10 лет. 
Пиши добрые, понятные истории без насилия и страшных сцен.
Используй простой язык, яркие описания и живые диалоги.
Персонажи должны вести себя согласно своим описаниям.`;

    const charactersText = characters.length > 0
      ? characters.map((c: Character) => `- ${c.name}: ${c.description || 'персонаж книги'}`).join('\n')
      : 'Персонажи не указаны';

    const previousText = previousChapters.length > 0
      ? previousChapters.slice(-2).map((ch: any) => 
          `Глава ${ch.chapter_number}: ${ch.content.substring(0, 400)}...`
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

ВАЖНО: Вставь ровно ${imagesCount} маркера для иллюстраций ВНУТРИ текста в подходящих местах.
Формат маркера: [ИЛЛЮСТРАЦИЯ: краткое описание сцены для картинки]

Правила размещения маркеров:
- Первый маркер — после интересного момента в начале-середине главы
- Последний маркер — ближе к концу, но НЕ в самом конце
- Маркер должен описывать сцену, которую читатель УЖЕ прочитал (не спойлер)
- Описание сцены должно быть кратким (10-20 слов)`;

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
        max_tokens: 2500,
      }),
    });

    const openaiData = await openaiResponse.json();
    
    if (!openaiData.choices?.[0]?.message?.content) {
      console.error('OpenAI error:', openaiData);
      throw new Error('Failed to generate chapter text');
    }

    let chapterContent = openaiData.choices[0].message.content;
    console.log(`Chapter text generated, length: ${chapterContent.length}`);

    // ============ STEP 2: Parse illustration markers ============
    
    const illustrationMarkers: { position: number; prompt: string; textPosition: number }[] = [];
    const markerRegex = /\[ИЛЛЮСТРАЦИЯ:\s*([^\]]+)\]/gi;
    let match;
    let imgIndex = 0;
    
    while ((match = markerRegex.exec(chapterContent)) !== null) {
      illustrationMarkers.push({
        position: imgIndex,
        prompt: match[1].trim(),
        textPosition: match.index, // Character position in text
      });
      imgIndex++;
    }

    console.log(`Found ${illustrationMarkers.length} illustration markers`);

    // Replace markers with [IMG:N] placeholders
    let processedContent = chapterContent;
    illustrationMarkers.forEach((marker, i) => {
      processedContent = processedContent.replace(
        /\[ИЛЛЮСТРАЦИЯ:\s*[^\]]+\]/i,
        `[IMG:${i}]`
      );
    });

    // ============ STEP 3: Save chapter immediately ============
    
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        book_id,
        chapter_number: nextChapterNum,
        title: `Глава ${nextChapterNum}`,
        content: processedContent,
      })
      .select()
      .single();

    if (chapterError) {
      console.error('Chapter save error:', chapterError);
      throw new Error('Failed to save chapter');
    }

    console.log(`Chapter saved: ${chapter.id}`);

    // ============ STEP 4: Create pending illustrations ============
    
    const pendingIllustrations: PendingIllustration[] = [];
    
    for (const marker of illustrationMarkers) {
      const { data: illustration, error: illError } = await supabase
        .from('illustrations')
        .insert({
          chapter_id: chapter.id,
          prompt: marker.prompt,
          position: marker.position,
          text_position: marker.textPosition,
          status: 'pending',
          image_url: '', // Will be filled when generated
        })
        .select()
        .single();

      if (illustration && !illError) {
        pendingIllustrations.push({
          id: illustration.id,
          position: marker.position,
          text_position: marker.textPosition,
          prompt: marker.prompt,
          status: 'pending',
        });
      }
    }

    console.log(`Created ${pendingIllustrations.length} pending illustrations`);

    // ============ STEP 5: Set book cover from first image if needed ============
    
    const needsCover = !book.cover_url && pendingIllustrations.length > 0;

    return new Response(
      JSON.stringify({
        chapter: {
          ...chapter,
          illustrations: pendingIllustrations.map(ill => ({
            id: ill.id,
            position: ill.position,
            text_position: ill.text_position,
            status: ill.status,
            image_url: null,
          })),
        },
        pending_illustrations: pendingIllustrations,
        needs_cover: needsCover,
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
