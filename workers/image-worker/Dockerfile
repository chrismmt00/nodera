# Nodera image worker — SDXL via Diffusers on CUDA.
# Requires the NVIDIA Container Toolkit on the provider host and `--gpus all`
# (the agent adds this for image models).
FROM pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime

WORKDIR /app
RUN pip install --no-cache-dir "diffusers==0.29.2" "transformers==4.42.4" \
    "accelerate==0.31.0" "safetensors==0.4.3" "invisible-watermark==0.2.0"

COPY app.py .
# Weights are baked at build time so runs need no network (blueprint §11).
ARG MODEL=stabilityai/stable-diffusion-xl-base-1.0
RUN python -c "from diffusers import StableDiffusionXLPipeline; import torch; \
    StableDiffusionXLPipeline.from_pretrained('${MODEL}', torch_dtype=torch.float16)"

# Non-root execution (blueprint §11).
RUN useradd --create-home worker && chown -R worker /app
USER worker
ENTRYPOINT ["python", "app.py"]
