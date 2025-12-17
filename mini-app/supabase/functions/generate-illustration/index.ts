// Supabase Edge Function: Generate Single Illustration
// Called asynchronously after chapter text is shown

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as base64Decode, encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Actual model names for image generation (from Google API)
const MODEL_NAMES = [
  'gemini-2.5-flash-image',
  'nano-banana-pro-preview',
  'gemini-2.5-flash-image-preview',
  'gemini-3-pro-image-preview',
];

interface GenerateIllustrationRequest {
  illustration_id: string;
  set_as_cover?: boolean; // If true, also set as book cover
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
    const googleKey = Deno.env.get('GOOGLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { illustration_id, set_as_cover }: GenerateIllustrationRequest = await req.json();

    console.log(`Generating illustration: ${illustration_id}`);

    // Get illustration details
    const { data: illustration, error: illError } = await supabase
      .from('illustrations')
      .select('*, chapter:chapters(*, book:books(*, book_characters(character:characters(*))))')
      .eq('id', illustration_id)
      .single();

    if (illError || !illustration) {
      throw new Error('Illustration not found');
    }

    // Mark as generating
    await supabase
      .from('illustrations')
      .update({ status: 'generating' })
      .eq('id', illustration_id);

    const chapter = illustration.chapter;
    const book = chapter?.book;
    const characters: Character[] = book?.book_characters?.map((bc: any) => bc.character) || [];

    console.log(`Illustration for chapter ${chapter?.chapter_number}, prompt: ${illustration.prompt}`);

    // Fetch character reference images
    const characterReferences = await fetchCharacterReferences(characters);
    console.log(`Loaded ${characterReferences.length} character references`);

    // Generate image
    const imageUrl = await generateImage(
      googleKey,
      supabase,
      illustration.prompt,
      characters,
      characterReferences,
      book?.title || 'Book',
      illustration_id
    );

    if (!imageUrl) {
      // Mark as error
      await supabase
        .from('illustrations')
        .update({ status: 'error' })
        .eq('id', illustration_id);
      
      throw new Error('Failed to generate image');
    }

    // Update illustration with URL and status
    const { data: updatedIllustration, error: updateError } = await supabase
      .from('illustrations')
      .update({ 
        image_url: imageUrl,
        status: 'ready',
      })
      .eq('id', illustration_id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update illustration:', updateError);
      throw new Error('Failed to save illustration URL');
    }

    console.log(`Illustration saved: ${imageUrl}`);

    // Set as book cover if requested
    if (set_as_cover && book?.id) {
      await supabase
        .from('books')
        .update({ cover_url: imageUrl })
        .eq('id', book.id);
      console.log('Book cover updated');
    }

    return new Response(
      JSON.stringify({
        illustration: updatedIllustration,
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

// Fetch character reference images from their URLs
async function fetchCharacterReferences(
  characters: Character[]
): Promise<{ name: string; description: string; imageBase64: string }[]> {
  const references: { name: string; description: string; imageBase64: string }[] = [];
  
  for (const char of characters) {
    if (!char.image_url) continue;
    
    try {
      // Remove any cache-busting params
      const cleanUrl = char.image_url.split('?')[0];
      const response = await fetch(cleanUrl);
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

// Try to generate image with different Gemini models
async function tryGenerateImageWithGemini(
  googleKey: string,
  parts: any[]
): Promise<{ imageData: Uint8Array; mimeType: string } | null> {
  for (const modelName of MODEL_NAMES) {
    try {
      console.log(`Trying model: ${modelName}`);
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${googleKey}`,
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
      
      if (data.error) {
        console.log(`Model ${modelName} error: ${data.error.message}`);
        continue;
      }
      
      const responseParts = data.candidates?.[0]?.content?.parts || [];
      
      for (const part of responseParts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          const imageData = base64Decode(part.inlineData.data);
          console.log(`Success with model ${modelName}! Image size: ${imageData.length} bytes`);
          return {
            imageData,
            mimeType: part.inlineData.mimeType,
          };
        }
      }
      
      console.log(`Model ${modelName}: No image in response`);
      
    } catch (e) {
      console.log(`Model ${modelName} exception: ${e.message}`);
    }
  }
  
  return null;
}

// Generate illustration using Gemini with character references
async function generateImage(
  apiKey: string,
  supabase: any,
  sceneDescription: string,
  characters: Character[],
  characterReferences: { name: string; description: string; imageBase64: string }[],
  bookTitle: string,
  illustrationId: string
): Promise<string | null> {
  try {
    const parts: any[] = [];
    
    // If we have character references, include them
    if (characterReferences.length > 0) {
      for (const ref of characterReferences) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: ref.imageBase64,
          },
        });
      }
      
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

    // Try to generate with Gemini
    const result = await tryGenerateImageWithGemini(apiKey, parts);
    
    if (!result) {
      console.error('Failed to generate image with any Gemini model');
      return null;
    }

    const { imageData, mimeType } = result;

    // Upload to Storage with unique filename
    const timestamp = Date.now();
    const fileName = `illustrations/${illustrationId}_${timestamp}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageData, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Image generation failed:', error);
    return null;
  }
}

