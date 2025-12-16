// Supabase Edge Function: Generate Chapter with Illustrations
// Uses OpenAI GPT for text, OpenAI DALL-E for images

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
    
    // Prepare context
    const characters: Character[] = book.book_characters?.map((bc: any) => bc.character) || [];
    const previousChapters = book.chapters?.sort((a: any, b: any) => a.chapter_number - b.chapter_number) || [];
    const nextChapterNum = previousChapters.length + 1;

    console.log(`Generating chapter ${nextChapterNum}, characters: ${characters.length}`);

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

В конце добавь строку в формате:
[ИЛЛЮСТРАЦИЯ: краткое описание ключевой сцены для иллюстрации на английском языке]`;

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
    
    if (!openaiData.choices?.[0]?.message?.content) {
      console.error('OpenAI error:', openaiData);
      throw new Error('Failed to generate chapter text');
    }

    let chapterContent = openaiData.choices[0].message.content;

    // Extract illustration prompt
    const illustrationMatch = chapterContent.match(/\[ИЛЛЮСТРАЦИЯ:\s*([^\]]+)\]/i);
    const illustrationPrompt = illustrationMatch?.[1] || `scene from chapter ${nextChapterNum} of children's book "${book.title}"`;
    
    // Remove illustration tag from content
    chapterContent = chapterContent.replace(/\[ИЛЛЮСТРАЦИЯ:[^\]]+\]/gi, '').trim();

    console.log(`Chapter text generated, illustration prompt: ${illustrationPrompt}`);

    // ============ STEP 2: Save chapter ============
    
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
      console.error('Chapter save error:', chapterError);
      throw new Error('Failed to save chapter');
    }

    console.log(`Chapter saved: ${chapter.id}`);

    // ============ STEP 3: Generate illustrations with DALL-E ============
    
    const illustrations: any[] = [];
    
    // Build character descriptions for DALL-E
    const characterDescriptions = characters
      .map(c => `${c.name}: ${c.description || ''}`)
      .join('. ')
      .substring(0, 300);

    for (let i = 0; i < settings.images_per_chapter; i++) {
      try {
        console.log(`Generating illustration ${i + 1}/${settings.images_per_chapter}`);
        
        const imageUrl = await generateIllustration(
          openaiKey,
          supabase,
          illustrationPrompt,
          characterDescriptions,
          book.title,
          chapter.id,
          i
        );

        if (imageUrl) {
          const { data: illustration, error: illError } = await supabase
            .from('illustrations')
            .insert({
              chapter_id: chapter.id,
              image_url: imageUrl,
              prompt: illustrationPrompt,
              position: i,
            })
            .select()
            .single();

          if (illustration && !illError) {
            illustrations.push(illustration);
            console.log(`Illustration ${i + 1} saved: ${imageUrl}`);
          }

          // Set first illustration as book cover if no cover
          if (i === 0 && !book.cover_url) {
            await supabase
              .from('books')
              .update({ cover_url: imageUrl })
              .eq('id', book_id);
            console.log('Book cover updated');
          }
        }
      } catch (imgError) {
        console.error(`Illustration ${i + 1} generation error:`, imgError);
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

// Generate illustration using DALL-E
async function generateIllustration(
  apiKey: string,
  supabase: any,
  sceneDescription: string,
  characterDescriptions: string,
  bookTitle: string,
  chapterId: string,
  position: number
): Promise<string | null> {
  try {
    // Build DALL-E prompt (max 1000 chars)
    let prompt = `Children's book illustration, Disney-Pixar cartoon style, bright cheerful colors, simple 2D art.

Scene: ${sceneDescription}
Characters: ${characterDescriptions}
Book: ${bookTitle}

Style: Cute, friendly, warm lighting, clean composition. Safe for children 5-10 years old. No text or words in image.`;

    // Truncate if too long
    if (prompt.length > 950) {
      prompt = prompt.substring(0, 947) + '...';
    }

    // Call DALL-E API
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'b64_json',
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('DALL-E error:', data.error);
      return null;
    }

    const imageBase64 = data.data?.[0]?.b64_json;
    if (!imageBase64) {
      console.error('No image in DALL-E response');
      return null;
    }

    // Decode base64 to bytes
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Storage
    const fileName = `illustrations/${chapterId}_${position}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, bytes, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Image generation failed:', error);
    return null;
  }
}
