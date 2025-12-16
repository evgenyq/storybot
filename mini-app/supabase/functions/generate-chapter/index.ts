// Supabase Edge Function: Generate Chapter with Illustrations
// Uses OpenAI GPT for text, Google Gemini for images with character references

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as base64Decode, encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

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
    const googleKey = Deno.env.get('GOOGLE_API_KEY')!;

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
[ИЛЛЮСТРАЦИЯ: краткое описание ключевой сцены для иллюстрации]`;

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
    const illustrationPrompt = illustrationMatch?.[1] || `сцена из главы ${nextChapterNum} книги "${book.title}"`;
    
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

    // ============ STEP 3: Generate illustrations with character references ============
    
    const illustrations: any[] = [];
    
    // Fetch character reference images
    const characterReferences = await fetchCharacterReferences(supabase, characters);
    console.log(`Loaded ${characterReferences.length} character references`);

    for (let i = 0; i < settings.images_per_chapter; i++) {
      try {
        console.log(`Generating illustration ${i + 1}/${settings.images_per_chapter}`);
        
        const imageUrl = await generateIllustration(
          googleKey,
          supabase,
          illustrationPrompt,
          characters,
          characterReferences,
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

// Fetch character reference images from Storage
async function fetchCharacterReferences(
  supabase: any,
  characters: Character[]
): Promise<{ name: string; description: string; imageBase64: string }[]> {
  const references: { name: string; description: string; imageBase64: string }[] = [];
  
  for (const char of characters) {
    if (!char.image_url) continue;
    
    try {
      // Download image from Storage
      const response = await fetch(char.image_url);
      if (!response.ok) continue;
      
      const imageBuffer = await response.arrayBuffer();
      const imageBase64 = base64Encode(new Uint8Array(imageBuffer));
      
      references.push({
        name: char.name,
        description: char.description || '',
        imageBase64,
      });
    } catch (e) {
      console.error(`Failed to fetch reference for ${char.name}:`, e);
    }
  }
  
  return references;
}

// Generate illustration using Gemini with character references
async function generateIllustration(
  apiKey: string,
  supabase: any,
  sceneDescription: string,
  characters: Character[],
  characterReferences: { name: string; description: string; imageBase64: string }[],
  bookTitle: string,
  chapterId: string,
  position: number
): Promise<string | null> {
  try {
    // Build content parts for Gemini
    const parts: any[] = [];
    
    // If we have character references, include them
    if (characterReferences.length > 0) {
      // Add reference images first
      for (const ref of characterReferences) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: ref.imageBase64,
          },
        });
      }
      
      // Build prompt with reference instructions
      const characterInstructions = characterReferences
        .map((ref, i) => `${i + 1}. ${ref.name}: Reference image ${i + 1} shows this character`)
        .join('\n');
      
      const prompt = `Create a children's book illustration using EXACTLY the characters from the reference images provided.

Style: Disney-Pixar children's book illustration, 2D cartoon art, bright cheerful colors.

Characters (maintain EXACT appearance from reference images):
${characterInstructions}

Scene: ${sceneDescription}

Important:
- Keep characters looking EXACTLY like their reference images
- Wide shot showing all characters clearly
- Warm lighting, clean composition
- No text or words in image
- Safe for children 5-10 years old`;

      parts.push({ text: prompt });
    } else {
      // No references - use text-only prompt
      const characterDescriptions = characters
        .map(c => `${c.name}: ${c.description || ''}`)
        .join('. ');

      const prompt = `Children's book illustration, Disney-Pixar cartoon style, bright cheerful colors, simple 2D art.

Scene: ${sceneDescription}
Characters: ${characterDescriptions}
Book: ${bookTitle}

Style: Cute, friendly, safe for children 5-10 years old. No text in image. Clean composition.`;

      parts.push({ text: prompt });
    }

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['image', 'text'],
          },
        }),
      }
    );

    const data = await response.json();
    
    // Extract image from response
    const responseParts = data.candidates?.[0]?.content?.parts || [];
    let imageData: Uint8Array | null = null;
    let mimeType = 'image/png';

    for (const part of responseParts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        imageData = base64Decode(part.inlineData.data);
        mimeType = part.inlineData.mimeType;
        break;
      }
    }

    if (!imageData) {
      console.error('No image in Gemini response');
      return null;
    }

    // Upload to Storage
    const fileName = `illustrations/${chapterId}_${position}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageData, {
        contentType: mimeType,
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

