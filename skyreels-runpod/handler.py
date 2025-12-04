import math
import os
import subprocess
import time

import requests
import runpod
import torch

from diffusers import (
    AutoModel,
    AutoencoderKLWan,
    SkyReelsV2DiffusionForcingPipeline,
    SkyReelsV2DiffusionForcingImageToVideoPipeline,
    UniPCMultistepScheduler,
)
from diffusers.utils import export_to_video, load_image


# -----------------------------
# Config
# -----------------------------

# Model IDs from Hugging Face (Diffusers versions)
T2V_MODEL_ID = "Skywork/SkyReels-V2-DF-14B-540P-Diffusers"
I2V_MODEL_ID = "Skywork/SkyReels-V2-DF-14B-540P-Diffusers"  # using 540p for both to save VRAM

DEFAULT_FPS = 24

MIN_SECONDS = 4.0      # user can't go below this
MAX_SECONDS = 10.0     # user can't go above this

SUPPORTED_QUALITIES = ["540p", "720p", "1080p"]

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Supabase config (bucket "files")
SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "files")


# -----------------------------
# Load models once on startup
# -----------------------------

print("Loading SkyReels-V2 T2V pipeline...")
t2v_vae = AutoModel.from_pretrained(
    T2V_MODEL_ID, subfolder="vae", torch_dtype=torch.float32
)
t2v_transformer = AutoModel.from_pretrained(
    T2V_MODEL_ID, subfolder="transformer", torch_dtype=torch.bfloat16
)

t2v_pipe = SkyReelsV2DiffusionForcingPipeline.from_pretrained(
    T2V_MODEL_ID,
    vae=t2v_vae,
    transformer=t2v_transformer,
    torch_dtype=torch.bfloat16,
)

t2v_pipe.scheduler = UniPCMultistepScheduler.from_config(
    t2v_pipe.scheduler.config, flow_shift=8.0  # recommended for T2V
)
t2v_pipe = t2v_pipe.to(DEVICE)

print("Loading SkyReels-V2 I2V pipeline...")
i2v_vae = AutoencoderKLWan.from_pretrained(
    I2V_MODEL_ID, subfolder="vae", torch_dtype=torch.float32
)
i2v_pipe = SkyReelsV2DiffusionForcingImageToVideoPipeline.from_pretrained(
    I2V_MODEL_ID,
    vae=i2v_vae,
    torch_dtype=torch.bfloat16,
)
i2v_pipe.scheduler = UniPCMultistepScheduler.from_config(
    i2v_pipe.scheduler.config, flow_shift=5.0  # recommended for I2V
)
i2v_pipe = i2v_pipe.to(DEVICE)

print("Pipelines loaded.")


# -----------------------------
# Helpers
# -----------------------------

def clamp_duration(seconds: float) -> float:
    seconds = float(seconds or 0)
    seconds = max(MIN_SECONDS, min(seconds, MAX_SECONDS))
    return seconds


def seconds_to_frames(seconds: float, fps: int = DEFAULT_FPS) -> int:
    """
    4s at 24fps = 96 frames, 10s = 240 frames.
    """
    seconds = clamp_duration(seconds)
    frames = int(math.floor(seconds * fps))
    return max(96, min(frames, 240))


def upscale_video_ffmpeg(input_path: str, quality: str) -> str:
    """
    Upscale 540p video to 720p or 1080p using ffmpeg.
    If quality is 540p, returns the original path.
    """
    quality = (quality or "540p").lower()
    if quality not in SUPPORTED_QUALITIES:
        quality = "540p"

    if quality == "540p":
        return input_path

    if quality == "720p":
        target_height = 720
        output_path = "/tmp/output_720p.mp4"
    else:  # "1080p"
        target_height = 1080
        output_path = "/tmp/output_1080p.mp4"

    # keep aspect ratio: set height, auto width (-2)
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-vf", f"scale=-2:{target_height}",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "copy",
        output_path,
    ]

    subprocess.run(cmd, check=True)
    return output_path


def upload_to_supabase(file_path: str, file_name: str) -> str:
    """
    Uploads an MP4 file to Supabase Storage (bucket 'files' by default)
    and returns the public URL.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise Exception("Supabase config missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.")

    upload_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{file_name}"

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    headers = {
        "Content-Type": "video/mp4",
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "x-upsert": "true",
    }

    resp = requests.post(upload_url, data=file_bytes, headers=headers)
    if resp.status_code >= 300:
        raise Exception(f"Supabase upload failed ({resp.status_code}): {resp.text}")

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{file_name}"
    return public_url


# -----------------------------
# Core generation functions
# -----------------------------

def generate_t2v(prompt: str,
                 seconds: float = 8.0,
                 fps: int = DEFAULT_FPS,
                 quality: str = "540p") -> str:
    """
    Text → video using SkyReels-V2.
    Always generates at 540p, then upscales to desired quality.
    Returns final video path.
    """
    seconds = clamp_duration(seconds)
    num_frames = seconds_to_frames(seconds, fps)

    # 540p settings from SkyReels docs
    height, width = 544, 960
    base_num_frames = 97

    with torch.inference_mode():
        output = t2v_pipe(
            prompt=prompt,
            num_inference_steps=30,
            height=height,
            width=width,
            num_frames=num_frames,
            base_num_frames=base_num_frames,
            ar_step=0,                 # synchronous (good for <=10s)
            overlap_history=None,
            addnoise_condition=20,
        ).frames[0]

    base_path = "/tmp/output_t2v_540p.mp4"
    export_to_video(output, base_path, fps=fps, quality=8)

    final_path = upscale_video_ffmpeg(base_path, quality)
    return final_path


def generate_i2v(image_url: str,
                 prompt: str,
                 seconds: float = 8.0,
                 fps: int = DEFAULT_FPS,
                 quality: str = "540p") -> str:
    """
    Image + text → video using SkyReels-V2 I2V.
    Always generates around 540p, then upscales.
    Returns final video path.
    """
    seconds = clamp_duration(seconds)
    num_frames = seconds_to_frames(seconds, fps)

    init_image = load_image(image_url)

    # simple resize to ~540p while keeping aspect ratio
    target_height = 544
    aspect = init_image.width / init_image.height
    target_width = int(round(target_height * aspect))
    init_image = init_image.resize((target_width, target_height))

    with torch.inference_mode():
        output = i2v_pipe(
            image=init_image,
            prompt=prompt,
            height=init_image.height,
            width=init_image.width,
            guidance_scale=5.0,
            num_inference_steps=30,
            num_frames=num_frames,
            base_num_frames=97,
            ar_step=0,
            overlap_history=None,
            addnoise_condition=20,
        ).frames[0]

    base_path = "/tmp/output_i2v_540p.mp4"
    export_to_video(output, base_path, fps=fps, quality=8)

    final_path = upscale_video_ffmpeg(base_path, quality)
    return final_path


# -----------------------------
# RunPod handler
# -----------------------------

def handler(job):
    """
    Expected input:

    {
      "mode": "t2v" | "i2v",
      "prompt": "description...",
      "seconds": 4-10,
      "fps": 24,
      "quality": "540p" | "720p" | "1080p",
      "image_url": "https://... (for i2v)"
    }
    """
    job_input = job.get("input", {}) or {}
    mode = job_input.get("mode", "t2v")
    prompt = (job_input.get("prompt") or "").strip()
    seconds = float(job_input.get("seconds", 8))
    fps = int(job_input.get("fps", DEFAULT_FPS))
    quality = (job_input.get("quality") or "540p").lower()

    if not prompt:
        return {"error": "prompt is required"}

    if quality not in SUPPORTED_QUALITIES:
        quality = "540p"

    # clamp seconds (and reflect back the value actually used)
    seconds = clamp_duration(seconds)

    try:
        if mode == "i2v":
            image_url = job_input.get("image_url")
            if not image_url:
                return {"error": "image_url is required for i2v mode"}
            video_path = generate_i2v(
                image_url=image_url,
                prompt=prompt,
                seconds=seconds,
                fps=fps,
                quality=quality,
            )
        else:
            video_path = generate_t2v(
                prompt=prompt,
                seconds=seconds,
                fps=fps,
                quality=quality,
            )

        # unique filename: mode_timestamp.mp4
        file_name = f"{mode}_{int(time.time())}.mp4"
        video_url = upload_to_supabase(video_path, file_name)

        return {
            "mode": mode,
            "seconds": seconds,
            "fps": fps,
            "quality": quality,
            "video_url": video_url,
        }
    except Exception as e:
        return {"error": str(e)}


# Start RunPod serverless worker
if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
