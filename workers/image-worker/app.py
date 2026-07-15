"""Nodera image worker (docs/BLUEPRINT.md §8).

Reads /job/input.json, generates an image with SDXL via Diffusers, writes
/job/out/{output.png, result.json, meta.json, logs.txt}. Exits non-zero on
any failure so the provider agent records a failed run.

Runtime: needs an NVIDIA GPU with >= 12 GB VRAM (menu min_vram_gb). On less
VRAM it enables model CPU offload, which is much slower but functional.
"""
import json
import os
import sys
import time
import base64

JOB_DIR = os.environ.get("JOB_DIR", "/job")
OUT_DIR = os.path.join(JOB_DIR, "out")

_log_lines = []


def log(line):
    _log_lines.append(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {line}")


def flush_logs():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "logs.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(_log_lines) + "\n")


def main():
    started = time.time()
    with open(os.path.join(JOB_DIR, "input.json"), encoding="utf-8") as fh:
        job = json.load(fh)

    params = job.get("input", {})
    prompt = params.get("prompt")
    width = int(params.get("width", 1024))
    height = int(params.get("height", 1024))
    runtime_ref = job.get("runtime_ref")
    if not prompt or not runtime_ref:
        raise ValueError("input.json needs input.prompt and runtime_ref")

    import torch
    from diffusers import StableDiffusionXLPipeline

    has_cuda = torch.cuda.is_available()
    dtype = torch.float16 if has_cuda else torch.float32
    log(f"loading {runtime_ref} (cuda={has_cuda}, dtype={dtype})")
    pipe = StableDiffusionXLPipeline.from_pretrained(runtime_ref, torch_dtype=dtype)

    if has_cuda:
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        if vram_gb < 12:
            log(f"{vram_gb:.1f} GB VRAM < 12 GB — enabling model CPU offload (slower)")
            pipe.enable_model_cpu_offload()
        else:
            pipe = pipe.to("cuda")
    else:
        log("no CUDA device — running on CPU (very slow)")

    log(f"generating {width}x{height}")
    image = pipe(prompt=prompt, width=width, height=height).images[0]

    os.makedirs(OUT_DIR, exist_ok=True)
    png_path = os.path.join(OUT_DIR, "output.png")
    image.save(png_path)
    size = os.path.getsize(png_path)

    with open(os.path.join(OUT_DIR, "result.json"), "w", encoding="utf-8") as fh:
        json.dump({"image": "output.png", "width": width, "height": height}, fh)

    usage = {
        "tokens_in": 0,
        "tokens_out": 0,
        "images": 1,
        "duration_ms": int((time.time() - started) * 1000),
        "model_slug": job.get("model"),
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump({"usage": usage}, fh)
    log(f"done: {size} bytes, {usage['duration_ms']}ms")


if __name__ == "__main__":
    try:
        main()
        flush_logs()
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 — top-level worker boundary
        log(f"ERROR: {exc}")
        flush_logs()
        print(str(exc), file=sys.stderr)
        sys.exit(1)
