// Supabase Edge Function: Generate Character Reference Image
// Uses Google Gemini for image generation, stores in Supabase Storage

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

${description}

Create a small, simple character reference image. Basic cartoon portrait, minimal details, clean style.
- Portrait/bust shot of the character
- White or simple solid background
- Friendly expression, big eyes
- Bright, cheerful colors
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
    let imageData: Uint8Array | null = null;
    let mimeType = 'image/png';

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        // Decode base64 to bytes
        imageData = base64Decode(part.inlineData.data);
        mimeType = part.inlineData.mimeType;
        console.log(`Image generated: ${imageData.length} bytes, ${mimeType}`);
        break;
      }
    }

    if (!imageData) {
      console.error('No image in Gemini response:', JSON.stringify(data).substring(0, 500));
      throw new Error('Failed to generate image - no image in response');
    }

    // Upload to Supabase Storage
    const fileName = `characters/${character_id}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, imageData, {
        contentType: mimeType,
        upsert: true, // Overwrite if exists
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
