/**
 * Image generation service using z-ai-web-dev-sdk.
 * Generates images with style variations to simulate multi-model outputs.
 */

// Local cache for generated images (simulates B2 storage in demo mode)
const imageStore = new Map<string, string>();

// Style presets that simulate different model characteristics
const STYLE_PRESETS: Record<string, { style: string; negative: string }> = {
  'flux-schnell': {
    style: 'digital art, clean lines, vibrant colors, modern aesthetic, high contrast',
    negative: 'blurry, low quality, distorted, watermark, text overlay',
  },
  'flux-pro': {
    style: 'photorealistic, cinematic lighting, 8K detail, professional photography, depth of field',
    negative: 'blurry, low quality, distorted, watermark, cartoon, illustration',
  },
  'sdxl-turbo': {
    style: 'hyperrealistic, dramatic composition, studio quality, rich textures',
    negative: 'blurry, low quality, distorted, watermark, overexposed, noise',
  },
  'playground-v2.5': {
    style: 'artistic, creative composition, painterly quality, dynamic lighting',
    negative: 'blurry, low quality, distorted, watermark, flat, boring',
  },
  'ideogram-v2': {
    style: 'clean design, precise details, balanced composition, professional finish',
    negative: 'blurry, low quality, distorted, watermark, cluttered, messy',
  },
};

/**
 * Generate an image using z-ai-web-dev-sdk with model-specific style.
 */
export async function generateImage(
  prompt: string,
  model: { id: string; qualityTier: string }
): Promise<string> {
  const preset = STYLE_PRESETS[model.id] || STYLE_PRESETS['flux-schnell'];
  const size = model.qualityTier === 'ultra' ? '1024x1024' : '768x768';
  
  const fullPrompt = `${prompt}, ${preset.style}`;

  try {
    // Use the z-ai-web-dev-sdk for image generation
    const { createImage } = await import('z-ai-web-dev-sdk');
    const result = await createImage({
      model: model.qualityTier === 'ultra' ? 'flux-pro' : 'flux-schnell',
      prompt: fullPrompt,
      negativePrompt: preset.negative,
      width: parseInt(size.split('x')[0]),
      height: parseInt(size.split('x')[1]),
      n: 1,
    });

    if (result?.images?.[0]?.url) {
      // Fetch the image and convert to base64 for local storage
      const response = await fetch(result.images[0].url);
      const buffer = await response.arrayBuffer();
      const base64 = `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
      return base64;
    }

    if (result?.images?.[0]?.b64_json) {
      return `data:image/png;base64,${result.images[0].b64_json}`;
    }

    throw new Error('No image data returned from SDK');
  } catch (error) {
    console.error(`[ImageGen] Generation failed for ${model.id}:`, error);
    throw error;
  }
}

/**
 * Store a generated image locally (used when B2 is not configured).
 */
export function storeImageLocal(key: string, data: string): void {
  imageStore.set(key, data);
}

/**
 * Retrieve a locally stored image.
 */
export function getImageLocal(key: string): string | undefined {
  return imageStore.get(key);
}

export { imageStore };