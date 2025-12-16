// Supabase Edge Function: Generate Character Reference Image
// Uses OpenAI DALL-E for image generation, stores in Supabase Storage

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
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { character_id, name, description }: GenerateCharacterRequest = await req.json();

    console.log(`Generating reference for character: ${name}`);

    // Build prompt for DALL-E (max 1000 chars)
    let prompt = `Simple Disney-Pixar style character portrait for children's book.

Character: ${name}
${description}

Style: Cute 2D cartoon, rounded features, big friendly eyes, bright cheerful colors, simple clean design, white background, portrait/bust shot. Safe for children 5-10 years old. No text.`;

    // Truncate if too long
    if (prompt.length > 950) {
      prompt = prompt.substring(0, 947) + '...';
    }

    console.log('Calling DALL-E...');

    // Generate image with DALL-E
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
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
      throw new Error(`DALL-E error: ${data.error.message}`);
    }

    const imageBase64 = data.data?.[0]?.b64_json;
    if (!imageBase64) {
      console.error('No image in DALL-E response');
      throw new Error('No image generated');
    }

    console.log('Image generated, uploading to Storage...');

    // Decode base64 to bytes
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const fileName = `characters/${character_id}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, bytes, {
        contentType: 'image/png',
        upsert: true,
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
