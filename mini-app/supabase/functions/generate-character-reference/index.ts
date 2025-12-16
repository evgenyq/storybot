// Supabase Edge Function: Generate Character Reference Image
// Uses Google Gemini (Nano Banana / Gemini 2.5 Flash Image) for image generation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateCharacterRequest {
  character_id: string;
  name: string;
  description: string;
}

// Actual model names for image generation (from Google API)
const MODEL_NAMES = [
  'gemini-2.5-flash-image',             // Gemini 2.5 Flash Image (Nano Banana)
  'nano-banana-pro-preview',            // Nano Banana Pro direct name
  'gemini-2.5-flash-image-preview',     // Preview version
  'gemini-3-pro-image-preview',         // Gemini 3 Pro Image
];

async function tryGenerateImage(googleKey: string, prompt: string): Promise<{ imageData: Uint8Array; mimeType: string } | null> {
  for (const modelName of MODEL_NAMES) {
    try {
      console.log(`Trying model: ${modelName}`);
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${googleKey}`,
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
      
      // Check for errors
      if (data.error) {
        console.log(`Model ${modelName} error: ${data.error.message}`);
        
        // If it's a country restriction, try next model
        if (data.error.message?.includes('not available in your country')) {
          continue;
        }
        // If model not found, try next
        if (data.error.code === 404) {
          continue;
        }
        // Other error - log and try next
        continue;
      }
      
      // Extract image from response
      const parts = data.candidates?.[0]?.content?.parts || [];
      
      for (const part of parts) {
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleKey = Deno.env.get('GOOGLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { character_id, name, description }: GenerateCharacterRequest = await req.json();

    console.log(`Generating reference for character: ${name}`);

    // Build prompt for character reference (similar to Python bot)
    const prompt = `Simple Disney-Pixar character portrait, minimalist 2D cartoon style, basic rounded features.

Character: ${name}
Description: ${description}

Create a small, simple character reference image. Basic cartoon portrait, minimal details, clean style.
- Portrait/bust shot of the character
- White or simple solid background
- Friendly expression, big eyes
- Bright, cheerful colors
- No text or words in image
- Safe and appropriate for children ages 5-10`;

    // Try to generate image with different models
    const result = await tryGenerateImage(googleKey, prompt);

    if (!result) {
      throw new Error('Failed to generate image with any available model');
    }

    const { imageData, mimeType } = result;
    console.log(`Image generated: ${imageData.length} bytes, ${mimeType}`);

    // Upload to Supabase Storage with unique filename (timestamp for cache-busting)
    const timestamp = Date.now();
    const fileName = `characters/${character_id}_${timestamp}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageData, {
        contentType: mimeType,
        upsert: false, // Always create new file
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    const imageUrl = urlData.publicUrl;
    console.log(`Image uploaded: ${imageUrl}`);

    // Update character with image URL
    const { error: updateError } = await supabase
      .from('characters')
      .update({ image_url: imageUrl })
      .eq('id', character_id);

    if (updateError) {
      console.error('Failed to update character:', updateError);
      throw new Error(`Failed to update character: ${updateError.message}`);
    }

    console.log(`Character ${name} reference saved successfully`);

    return new Response(
      JSON.stringify({ 
        success: true,
        image_url: imageUrl,
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
