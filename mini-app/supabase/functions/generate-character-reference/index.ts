// Supabase Edge Function: Generate Character Reference Image
// Uses Google Gemini for image generation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateCharacterRequest {
  character_id: string;
  name: string;
  description: string;
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

    // Build prompt for character reference
    const prompt = `Create a simple character portrait for a children's book.

Character: ${name}
Description: ${description}

Style requirements:
- Disney-Pixar cartoon style
- Simple 2D illustration
- Bright, cheerful colors
- Friendly expression
- White or simple solid background
- Portrait/bust shot
- No text or words in image
- Safe and appropriate for children ages 5-10`;

    // Generate image with Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${googleKey}`,
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
    let imageUrl: string | null = null;

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        // TODO: Upload to Supabase Storage
        // For now, store as base64 data URL
        imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageUrl) {
      throw new Error('Failed to generate image');
    }

    // Update character with image URL
    const { error: updateError } = await supabase
      .from('characters')
      .update({ image_url: imageUrl })
      .eq('id', character_id);

    if (updateError) {
      console.error('Failed to update character:', updateError);
    }

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

