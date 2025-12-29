# Banana AI Setup Guide

## What is Banana AI?

Banana AI provides fast, cost-effective image generation using models like:
- **Flux Schnell** (super fast, 4 steps)
- **SDXL** (high quality)
- **Stable Diffusion 3**

Website: https://www.banana.dev/

## Setup Steps

### 1. Create Banana AI Account

1. Go to https://app.banana.dev/
2. Sign up for an account
3. Verify your email

### 2. Get API Key

1. Go to https://app.banana.dev/settings/api-keys
2. Click "Create API Key"
3. Copy your API key (starts with `sk-...`)

### 3. Deploy an Image Model

You need to deploy one of these models:

#### Option A: Flux Schnell (Recommended - Fast & Cheap)
1. Go to https://app.banana.dev/templates
2. Search for "Flux Schnell" or "SDXL"
3. Click "Deploy"
4. Wait for deployment (2-5 minutes)
5. Copy the **Model Key** from the deployment page

#### Option B: Use Community Models
Browse: https://app.banana.dev/models

### 4. Add Credentials to .env

Add these to your `server/.env` file:

```bash
# Banana AI Configuration
BANANA_API_KEY=your_api_key_here
BANANA_MODEL_KEY=your_model_key_here
```

### 5. Restart Server

```bash
cd server
npm run build
npm start
```

## How It Works

When a user asks for an image in **Normal mode**, the system:

1. ✅ Detects image-related keywords (show me, generate, create, visualize, etc.)
2. ✅ Extracts the image prompt from the query
3. ✅ Generates image using Banana AI (or falls back to DALL-E if configured)
4. ✅ Returns image URL with the answer

### Example Queries That Trigger Images:

```
"Show me a sunset over mountains"
"Generate an image of a futuristic city"
"Create a picture of a cat wearing sunglasses"
"What does a neural network look like? Show me"
"Visualize quantum computing"
```

## Pricing

Banana AI pricing is very competitive:

- **Flux Schnell**: ~$0.001-0.003 per image (super fast, 4 steps)
- **SDXL**: ~$0.01-0.02 per image (high quality)
- Much cheaper than DALL-E 3 ($0.04-0.08 per image)

## Fallback to DALL-E

If Banana AI is not configured or fails, the system automatically falls back to DALL-E 3 (if OpenAI API key is available).

To use DALL-E only, just don't set the Banana keys.

## Testing

Test image generation:

```bash
# In Normal chat mode, try:
"Show me a beautiful landscape"
"Generate an image of a robot"
"Create a picture of the ocean"
```

## Troubleshooting

### Images not generating?

1. Check logs for `🎨 Generating image with Banana AI:` message
2. Verify API key is correct
3. Verify model is deployed and running in Banana dashboard
4. Check model key matches your deployed model

### Image generation is slow?

- Use Flux Schnell model (fastest)
- Reduce `num_inference_steps` in `imageGeneration.ts`
- Consider caching generated images

### Want to disable images?

Comment out the Banana API keys in `.env` - system will skip image generation.

## Advanced Configuration

Edit `server/src/utils/imageGeneration.ts` to customize:

- Image size (default: 1024x1024)
- Inference steps (speed vs quality)
- Guidance scale (prompt adherence)
- Negative prompts (what to avoid)

## Alternative: Video Generation

For video generation with Veo 3.1, see: `VEO_SETUP.md` (coming soon)

