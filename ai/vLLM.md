# vLLM — A 2-Day Crash Course

vLLM is a high-throughput LLM inference engine built around PagedAttention and continuous batching, exposing an OpenAI-compatible API that turns open-weight models into production-grade services.

**Prerequisites:** `LLM-Fundamentals.md`, `Ollama.md`

---

## Part 0 — Why vLLM Exists

You already know Ollama. It is the right tool for running a model on your laptop or in a dev environment where you send one request at a time and convenience matters more than efficiency.

Production is a different problem. A single GPU serving Llama 3 8B naively allocates KV cache memory up front for every possible token in every possible request. Most of that memory sits idle most of the time, and requests queue up while waiting for it. When real traffic arrives — dozens of concurrent users, long prompts, streaming responses — naive serving collapses under the waste.

vLLM was built to solve that. Two ideas do most of the work.

**PagedAttention** borrows a concept from operating systems: virtual memory paging. Instead of pre-allocating one giant contiguous block of GPU memory for each request's KV cache, PagedAttention manages memory in small fixed-size pages and maps logical blocks to physical blocks on demand. Requests no longer compete for contiguous space. Fragmentation drops dramatically. You fit far more concurrent requests on the same hardware.

**Continuous batching** means the server does not wait for a full batch to finish before starting new work. As soon as one request in the batch generates its last token, a new request takes its slot. The GPU stays busy. Utilization goes from 40-60% on naive servers to 80-95% on vLLM under load.

The result: vLLM typically delivers 10-24x higher throughput than Hugging Face's naive text-generation pipeline and 2-5x higher than TGI (Text Generation Inference), depending on workload.

Use Ollama to iterate locally. Use vLLM to serve production traffic.

---

## Vocabulary

**PagedAttention** — A memory management algorithm that stores KV cache in non-contiguous pages, eliminating waste from internal and external fragmentation. Analogous to OS virtual memory.

**Continuous Batching** — A scheduling strategy where new requests join an in-flight batch immediately when a slot opens, rather than waiting for the entire batch to drain. Keeps the GPU saturated.

**KV Cache** — The key-value tensors from the attention mechanism stored across decode steps. Recomputing them every token is prohibitively slow; caching them is what makes autoregressive decoding tractable.

**Tensor Parallelism** — Splitting individual weight matrices across multiple GPUs so a single large model can be served by a group of GPUs working in parallel on each forward pass. Requires fast interconnects (NVLink, InfiniBand).

**Quantization (AWQ / GPTQ)** — Reducing weight precision from FP16 to INT4 or INT8 to shrink model size and increase throughput. AWQ (Activation-aware Weight Quantization) calibrates based on activation magnitudes; GPTQ uses a second-order approximation. Both are post-training and run without retraining.

**OpenAI-compatible API** — vLLM exposes `/v1/chat/completions`, `/v1/completions`, and `/v1/models` endpoints that match OpenAI's schema. Any client that talks to OpenAI can point at vLLM with a base URL change.

**LoRA (Low-Rank Adaptation)** — A fine-tuning method that adds small rank-decomposed weight matrices instead of retraining the full model. vLLM can load multiple LoRA adapters on top of a single base model and switch between them per request.

**Throughput** — Tokens generated per second across all concurrent requests. The primary metric for evaluating inference server efficiency under load.

**Latency** — Time to first token (TTFT) and time per output token (TPOT). The primary metrics for evaluating user-facing responsiveness.

**Prefix Caching** — Reusing computed KV cache blocks for identical prompt prefixes across requests. Essential for system prompts shared by many users — compute the system prompt once, cache it, reuse it.

---

## DAY 1 — Install, Serve, and Benchmark

### Install

vLLM requires a CUDA-capable GPU. A single A100 80GB or H100 80GB is ideal; a 24GB consumer card (RTX 4090, A5000) works for 7B and 8B models.

```bash
# Create an isolated environment — vLLM pins CUDA and torch versions
python -m venv .venv
source .venv/bin/activate

pip install vllm
# This pulls a pre-built wheel with CUDA 12.1 and torch 2.x.
# For other CUDA versions: pip install vllm --extra-index-url https://download.pytorch.org/whl/cu118
```

Verify:

```bash
python -c "import vllm; print(vllm.__version__)"
```

### Serve a Model

```bash
vllm serve meta-llama/Meta-Llama-3-8B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --max-model-len 8192
```

vLLM downloads the model from Hugging Face on first run. Set `HUGGING_FACE_HUB_TOKEN` for gated models like Llama 3.

The server prints memory allocation info and available KV cache blocks. Watch for `GPU blocks: N` in the logs — this tells you how many concurrent sequences the server can hold.

### Hit the OpenAI-Compatible Endpoint

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Meta-Llama-3-8B-Instruct",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain PagedAttention in two sentences."}
    ],
    "max_tokens": 200
  }'
```

From Python, swap the base URL:

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="ignored")

response = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3-8B-Instruct",
    messages=[{"role": "user", "content": "What is continuous batching?"}],
    max_tokens=150,
)
print(response.choices[0].message.content)
```

### Benchmark

```bash
python -m vllm.entrypoints.openai.run_benchmark \
  --backend vllm \
  --model meta-llama/Meta-Llama-3-8B-Instruct \
  --num-prompts 200 --request-rate 10
```

The output reports median TTFT, P99 TTFT, median TPOT, and overall throughput. Run this before and after any tuning change.

### Docker Deployment

```dockerfile
# Dockerfile
FROM vllm/vllm-openai:latest

ENV HUGGING_FACE_HUB_TOKEN=""
EXPOSE 8000

CMD ["--model", "meta-llama/Meta-Llama-3-8B-Instruct", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--max-model-len", "8192"]
```

```bash
docker run --gpus all \
  -p 8000:8000 \
  -e HUGGING_FACE_HUB_TOKEN=$HF_TOKEN \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  vllm/vllm-openai:latest \
  --model meta-llama/Meta-Llama-3-8B-Instruct
```

The official image (`vllm/vllm-openai`) is the fastest path to a clean deployment — it bundles the right CUDA, flash-attention, and torch versions.

---

## DAY 2 — Production Features

### Quantization: AWQ vs GPTQ

Quantization is the highest-leverage knob for fitting larger models onto available hardware.

| | AWQ | GPTQ |
|---|---|---|
| Method | Activation-aware weight scaling | Hessian-based weight rounding |
| Quality | Slightly better at INT4 | Slightly lower perplexity loss |
| Speed | Faster inference | Depends on kernel |
| vLLM support | Native, recommended | Supported |

```bash
# Serve a pre-quantized AWQ model (no extra args needed — vLLM auto-detects)
vllm serve TheBloke/Llama-2-13B-chat-AWQ \
  --quantization awq \
  --max-model-len 4096

# GPTQ
vllm serve TheBloke/Llama-2-13B-chat-GPTQ \
  --quantization gptq \
  --max-model-len 4096
```

AWQ 4-bit roughly halves memory versus FP16. A 13B model at FP16 needs ~26GB; at INT4 AWQ it fits in ~7GB, opening an RTX 4090 for it.

### Tensor Parallelism (Multi-GPU)

When a model does not fit on one GPU, or you want to reduce latency by spreading computation across cards:

```bash
vllm serve meta-llama/Meta-Llama-3-70B-Instruct \
  --tensor-parallel-size 2 \
  --gpu-memory-utilization 0.90 \
  --max-model-len 8192
```

`--tensor-parallel-size` must divide evenly into the number of attention heads. For Llama 3 70B (64 heads), valid values are 1, 2, 4, 8. GPUs must be on the same node. For multi-node, add `--pipeline-parallel-size`.

### LoRA Serving

vLLM can hot-swap LoRA adapters per request. Load the base model once, attach adapters dynamically.

```bash
vllm serve meta-llama/Meta-Llama-3-8B-Instruct \
  --enable-lora \
  --lora-modules \
    sql-adapter=my-org/llama3-sql-lora \
    code-adapter=my-org/llama3-code-lora \
  --max-lora-rank 64
```

Request with a specific adapter:

```python
response = client.chat.completions.create(
    model="sql-adapter",   # references the lora-modules name
    messages=[{"role": "user", "content": "Write a SQL query..."}],
)
```

### Structured Output (Guided Decoding)

Force the model to produce valid JSON, a regex match, or a grammar-constrained output without prompt tricks:

```python
response = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3-8B-Instruct",
    messages=[{"role": "user", "content": "Extract name and age as JSON."}],
    extra_body={
        "guided_json": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer"}
            },
            "required": ["name", "age"]
        }
    }
)
```

vLLM uses the `outlines` library under the hood to constrain the token logits at each step.

### Prefix Caching

Prefix caching is on by default in recent vLLM versions. Verify with an explicit flag:

```bash
vllm serve meta-llama/Meta-Llama-3-8B-Instruct \
  --enable-prefix-caching
```

When many requests share a long system prompt, the KV blocks for that prefix are computed once and reused. Cache hit rate appears in Prometheus as `vllm:prefix_cache_hit_rate`. A 2000-token system prompt shared by 100 requests means you pay the compute cost once — substantial savings at scale.

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-llama3-8b
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vllm
  template:
    metadata:
      labels:
        app: vllm
    spec:
      containers:
      - name: vllm
        image: vllm/vllm-openai:latest
        args: ["--model", "meta-llama/Meta-Llama-3-8B-Instruct",
               "--max-model-len", "8192", "--gpu-memory-utilization", "0.90"]
        resources:
          limits:
            nvidia.com/gpu: "1"
        ports:
        - containerPort: 8000
        env:
        - name: HUGGING_FACE_HUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: hf-token
              key: token
```

Expose via a ClusterIP Service on port 80 targeting 8000. For autoscaling on queue depth, use KEDA with a Prometheus trigger — see the Worked Example below.

### Monitoring with Prometheus

vLLM exposes metrics at `/metrics`. Key ones to watch:

| Metric | What it tells you |
|---|---|
| `vllm:num_requests_running` | Active requests in the engine |
| `vllm:num_requests_waiting` | Queue depth — rising means undersized |
| `vllm:gpu_cache_usage_perc` | KV cache utilization |
| `vllm:prefix_cache_hit_rate` | Prefix caching effectiveness |
| `vllm:e2e_request_latency_seconds` | End-to-end latency histogram |
| `vllm:time_to_first_token_seconds` | TTFT histogram |
| `vllm:time_per_output_token_seconds` | TPOT histogram |

Wire these into Grafana. Alert when `num_requests_waiting` stays above 0 for more than 30 seconds — that is your scaling signal.

### vLLM vs TGI vs Ollama

| | vLLM | TGI (Hugging Face) | Ollama |
|---|---|---|---|
| Primary use case | Production, high throughput | Production, HF ecosystem | Dev, local exploration |
| PagedAttention | Yes | No (dynamic batching) | No |
| Continuous batching | Yes | Yes | No |
| OpenAI API compatibility | Full | Partial | Full |
| Quantization | AWQ, GPTQ, INT8 | GPTQ, AWQ, bitsandbytes | GGUF (llama.cpp) |
| LoRA serving | Yes (multi-adapter) | Yes | No |
| Multi-GPU | Tensor + pipeline parallel | Tensor parallel | No |
| Structured output | Yes (outlines) | Yes | Yes (limited) |
| Ease of setup | Medium | Medium | Easy |
| Throughput at scale | Highest | High | Low |

TGI is a reasonable alternative if you are deeply embedded in the Hugging Face ecosystem. Ollama is not a competitor — it is a different tool for a different job.

---

## Worked Example — Llama 3 70B on 2 GPUs with Autoscaling

**Goal:** Serve `meta-llama/Meta-Llama-3-70B-Instruct` on two A100 80GB GPUs, expose an OpenAI-compatible endpoint, and autoscale the deployment based on queue depth.

**Step 1: Launch with tensor parallelism**

```bash
vllm serve meta-llama/Meta-Llama-3-70B-Instruct \
  --tensor-parallel-size 2 \
  --gpu-memory-utilization 0.90 \
  --max-model-len 4096 \
  --enable-prefix-caching \
  --host 0.0.0.0 \
  --port 8000
```

With two A100 80GBs and TP=2, Llama 3 70B in FP16 (~140GB) fits with room for KV cache. Startup logs should report 800-1200 GPU blocks.

**Step 2: Baseline benchmark**

```bash
python -m vllm.entrypoints.openai.run_benchmark \
  --model meta-llama/Meta-Llama-3-70B-Instruct \
  --num-prompts 500 --request-rate 5
```

Expect 300-500 tokens/second on two A100s at moderate concurrency.

**Step 3: KEDA autoscaling on queue depth**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: vllm-scaledobject
spec:
  scaleTargetRef:
    name: vllm-llama3-70b
  minReplicaCount: 1
  maxReplicaCount: 4
  triggers:
  - type: prometheus
    metadata:
      serverAddress: http://prometheus:9090
      metricName: vllm_num_requests_waiting
      threshold: "5"
      query: avg(vllm:num_requests_waiting{job="vllm"})
```

When the waiting queue exceeds 5 requests, KEDA adds a replica. Scales back down when the queue clears.

---

## Pitfalls

**OOM on startup.** vLLM profiles memory at startup and pre-allocates KV cache blocks. If it crashes immediately, lower `--gpu-memory-utilization` (try 0.85) or reduce `--max-model-len`. The error message usually says "CUDA out of memory during memory profiling" — that is the clue.

**Tensor parallel size mismatch.** `--tensor-parallel-size` must divide the number of attention heads evenly. Llama 3 8B has 32 heads, so TP=3 is invalid. vLLM will error at startup with a clear message, but it is a common first-timer mistake.

**Slow first request.** vLLM compiles CUDA kernels on the first request of a given shape (input length, batch size). The second request is fast. In production, send a few warmup requests before opening the endpoint to real traffic.

**Prefix cache misses due to slight prompt variations.** Prefix caching only fires on byte-identical prefixes. If your system prompt has a timestamp embedded in it, you get zero cache hits. Keep system prompts static. Move dynamic context to the user turn.

**LoRA adapter rank too high.** Setting `--max-lora-rank` too high wastes GPU memory on the adapter weight buffers. Match it to the actual rank of your adapters. Most LoRAs use rank 8, 16, or 64.

**Quantization quality regression.** AWQ and GPTQ at INT4 introduce perplexity loss. It is usually acceptable for chat tasks and harmful for reasoning-heavy or math tasks. Always benchmark task accuracy — not just throughput — when evaluating a quantized model.

**Not pinning the vLLM version.** vLLM moves fast. Breaking changes between minor versions are common. Pin `vllm==0.x.y` in your requirements and test upgrades explicitly.

⚠️ Do not set `--gpu-memory-utilization 1.0`. vLLM needs a small buffer for activations and intermediate tensors. Setting it to 1.0 causes intermittent OOM crashes under high load that are difficult to reproduce locally.

---

## Quick Reference

```bash
# Serve a model
vllm serve <model-id> --port 8000

# Tensor parallelism
vllm serve <model> --tensor-parallel-size 4

# AWQ quantization
vllm serve <model> --quantization awq

# LoRA adapters
vllm serve <model> --enable-lora --lora-modules name=path

# Prefix caching
vllm serve <model> --enable-prefix-caching

# GPU memory budget
vllm serve <model> --gpu-memory-utilization 0.90

# Context length cap
vllm serve <model> --max-model-len 8192

# Metrics endpoint
curl http://localhost:8000/metrics

# List loaded models
curl http://localhost:8000/v1/models

# Benchmark
python -m vllm.entrypoints.openai.run_benchmark \
  --model <model> --num-prompts 200 --request-rate 10
```

| Flag | Purpose | Default |
|---|---|---|
| `--tensor-parallel-size` | GPUs per instance | 1 |
| `--gpu-memory-utilization` | Fraction of VRAM for KV cache | 0.90 |
| `--max-model-len` | Max sequence length | model config |
| `--quantization` | awq, gptq, int8, fp8 | none |
| `--enable-prefix-caching` | Reuse KV cache for shared prefixes | off |
| `--enable-lora` | Multi-adapter LoRA serving | off |
| `--max-lora-rank` | Cap on LoRA rank to pre-allocate | 16 |
| `--host` | Bind address | 127.0.0.1 |
| `--port` | Bind port | 8000 |

---

## Next Steps

- `Ollama.md` — local dev workflow that feeds into vLLM in production
- `LLM-Fundamentals.md` — attention, KV cache, and tokenization concepts that underpin PagedAttention
- `Docker.md` — containerizing the vLLM server image
- `Kubernetes.md` — deploying and autoscaling GPU workloads
- `LLMOps.md` — model lifecycle, versioning, A/B testing, and observability in production

---

## The Mantra

> Ollama gets the model running. vLLM gets the model serving.
> PagedAttention eliminates memory waste. Continuous batching eliminates GPU idle time.
> Measure throughput under load before claiming your deployment is production-ready.
