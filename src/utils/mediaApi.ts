import { getAuthHeaders, getAuthToken } from "./auth";

export type GeneratedImageResult = {
  url: string;
  prompt: string;
  width: number;
  height: number;
  aspectRatio: string;
  provider: string;
};

export type GeneratedVideoResult = {
  url: string;
  prompt: string;
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
  provider: string;
};

function getBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) {
    throw new Error(
      "API URL not configured. Please set VITE_API_URL in your .env file."
    );
  }
  return baseUrl.replace(/\/+$/, "");
}

function authOnlyHeaders(): HeadersInit {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Please log in to use this feature.");
  }
  return { Authorization: `Bearer ${token}` };
}

async function parseApiError(res: Response, fallback: string): Promise<never> {
  const errorData = await res.json().catch(() => ({ error: fallback }));
  throw new Error(errorData.error || `${fallback} (${res.status})`);
}

function appendReferenceImages(formData: FormData, referenceImages?: File | File[]) {
  const files = referenceImages
    ? (Array.isArray(referenceImages) ? referenceImages : [referenceImages])
    : [];
  // Use "referenceImage" (single field) for a single file, "referenceImages" for multiple.
  // Never append the same file to both fields — server combines them and would get duplicates.
  if (files.length === 1) {
    formData.append("referenceImage", files[0]);
  } else {
    files.forEach((file) => formData.append("referenceImages", file));
  }
}

export type ImageModelChoice =
  | 'auto'
  | 'nano-banana'
  | 'imagen-4'
  | 'gpt-image-1'
  | 'grok-image';

export async function generateImageApi(
  prompt: string,
  aspectRatio: string = "1:1",
  referenceImages?: File | File[],
  imageModel: ImageModelChoice = 'auto'
): Promise<GeneratedImageResult> {
  const baseUrl = getBaseUrl();
  const hasReferenceImages = Array.isArray(referenceImages)
    ? referenceImages.length > 0
    : Boolean(referenceImages);

  if (hasReferenceImages) {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("aspectRatio", aspectRatio);
    formData.append("imageModel", imageModel);
    appendReferenceImages(formData, referenceImages);

    const res = await fetch(`${baseUrl}/api/media/generate-image`, {
      method: "POST",
      headers: authOnlyHeaders(),
      body: formData,
    });

    if (!res.ok) await parseApiError(res, "Image edit failed");
    const data = await res.json();
    if (!data?.image?.url) throw new Error("No image returned from server");
    return data.image;
  }

  const res = await fetch(`${baseUrl}/api/media/generate-image`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ prompt, aspectRatio, imageModel }),
  });

  if (!res.ok) await parseApiError(res, "Image generation failed");
  const data = await res.json();
  if (!data?.image?.url) throw new Error("No image returned from server");
  return data.image;
}

export async function generateVideoApi(
  prompt: string,
  duration: number = 5,
  aspectRatio: string = "16:9",
  referenceImages?: File | File[]
): Promise<GeneratedVideoResult> {
  const baseUrl = getBaseUrl();
  const hasReferenceImages = Array.isArray(referenceImages)
    ? referenceImages.length > 0
    : Boolean(referenceImages);

  if (hasReferenceImages) {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("duration", duration.toString());
    formData.append("aspectRatio", aspectRatio);
    appendReferenceImages(formData, referenceImages);

    const res = await fetch(`${baseUrl}/api/media/generate-video`, {
      method: "POST",
      headers: authOnlyHeaders(),
      body: formData,
    });

    if (!res.ok) await parseApiError(res, "Video generation failed");
    const data = await res.json();
    if (!data?.video?.url) throw new Error("No video returned from server");
    return data.video;
  }

  const res = await fetch(`${baseUrl}/api/media/generate-video`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ prompt, duration, aspectRatio }),
  });

  if (!res.ok) await parseApiError(res, "Video generation failed");
  const data = await res.json();
  if (!data?.video?.url) throw new Error("No video returned from server");
  return data.video;
}
