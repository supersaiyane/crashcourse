# RAG — A 2-Day Crash Course

> **In one sentence:** Retrieval-Augmented Generation (RAG) is the pattern of fetching relevant documents from your own data and injecting them into an LLM's context — it gives the model knowledge it was never trained on, without fine-tuning. Prerequisite: see `LLM-Fundamentals.md`.

---

## Part 0 — Why RAG exists

LLMs have three fundamental problems for production use.

First, they hallucinate. When a model doesn't know something, it doesn't say "I don't know" — it confabulates a plausible-sounding answer. That's catastrophic when your users are reading internal runbooks or compliance documents.

Second, their training data is stale. A model trained through early 2024 has no knowledge of your incident from last Tuesday, your new API contract, or the architecture decision your team made last month.

Third, they don't know your private data. Your Confluence space, your Slack history, your customer contracts — none of that is in any public model's weights. There's no prompt trick to fix that.

Fine-tuning is the obvious answer, but it's expensive, slow, and still doesn't solve freshness — fine-tuning bakes in a snapshot, not a live feed. You'd need to retrain every time anything changes.

RAG solves all three problems by moving knowledge out of the model's weights and into a retrieval system you control. At inference time, you query that system for the most relevant chunks and inject them directly into the prompt. The model now has access to your data, fresh data, and accurate data — and you can update it without touching the model at all.

**Mental model:** RAG is an open-book exam. A closed-book exam tests what the student memorized — that's a vanilla LLM. An open-book exam lets the student consult the right pages before answering. RAG hands the model the relevant pages right before it answers. The model's job shifts from memorization to reasoning over what you provide.

---

## Part 1 — The vocabulary

| Term | What it means |
|---|---|
| **Embedding** | A numerical vector that encodes the semantic meaning of text. Two semantically similar sentences produce vectors that are close in high-dimensional space. Produced by an embedding model (separate from the generation model). |
| **Vector Store** | A database purpose-built for storing and querying embeddings. Supports approximate nearest-neighbor (ANN) search, which finds the most semantically similar vectors to a query vector. Examples: pgvector, Chroma, FAISS, Pinecone, Weaviate. |
| **Chunk** | A fragment of a document — typically a few hundred tokens. You split documents into chunks before embedding because embedding a 50-page PDF as one vector loses granularity, and LLM context windows have limits. |
| **Retriever** | The component that takes a query, embeds it, and fetches the top-K most relevant chunks from the vector store. The retriever is the core of RAG. |
| **Re-ranker** | A second-pass model that re-scores the top-K retrieved chunks for relevance to the query. Retrievers optimize for recall (find everything plausibly relevant); re-rankers optimize for precision (surface the actually relevant chunks). Cross-encoders are the common choice. |
| **Context Window** | The maximum number of tokens an LLM can process in a single call — input + output combined. RAG is fundamentally bounded by this: you can only inject as many chunks as fit. |
| **Semantic Search** | Search based on meaning rather than exact keyword match. A query for "how do I restart the payment service" matches a chunk about "restarting the checkout microservice" even though none of those exact words overlap. |
| **Hybrid Search** | Combining semantic (vector) search with keyword (BM25/TF-IDF) search. Semantic search wins on paraphrase; keyword search wins on exact identifiers like error codes, function names, and version numbers. Production systems almost always need both. |
| **Ingestion Pipeline** | The offline process that takes raw documents, splits them into chunks, generates embeddings, and stores them in the vector store. Runs on schedule or on document change, not at query time. |
| **Grounding** | The property of a model answer being verifiably tied to retrieved source documents. Grounded answers can be traced back to specific chunks — ungrounded answers cannot. RAG enables grounding; whether you enforce it depends on your prompting. |

---

## DAY 1 — Build a basic RAG pipeline

### 1. Chunk your documents

The most basic split is fixed-size chunking: divide text into overlapping windows of N tokens. Overlap prevents a relevant sentence from being cut in half and landing in two chunks with neither having full context.

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,       # tokens per chunk
    chunk_overlap=64,     # overlap between consecutive chunks
    length_function=len,
)
chunks = splitter.split_text(document_text)
```

Start with chunk_size=512 and overlap=64. You'll tune this on Day 2.

### 2. Generate embeddings

Each chunk becomes a vector. You call an embedding model once per chunk during ingestion. At query time, you embed the query with the same model.

```python
from openai import OpenAI

client = OpenAI()

def embed(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding
```

The embedding model must stay constant across ingestion and retrieval — a vector from model A is meaningless to model B.

### 3. Store in a vector database

Here's the same flow using ChromaDB, which runs in-process with no external dependencies — good for prototyping.

```python
import chromadb

client = chromadb.Client()
collection = client.create_collection("runbooks")

for i, chunk in enumerate(chunks):
    collection.add(
        documents=[chunk],
        embeddings=[embed(chunk)],
        ids=[f"chunk_{i}"],
    )
```

For production, pgvector (Postgres extension) or a managed service like Pinecone is more appropriate. FAISS is fine for read-heavy workloads where you batch-load an index into memory.

### 4. Query with similarity search

```python
def retrieve(query: str, top_k: int = 5) -> list[str]:
    query_embedding = embed(query)
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
    )
    return results["documents"][0]
```

This returns the top-5 most semantically similar chunks to the query. Cosine similarity is the standard distance metric.

### 5. Inject retrieved chunks into the prompt

```python
def ask(query: str) -> str:
    chunks = retrieve(query)
    context = "\n\n---\n\n".join(chunks)

    prompt = f"""Answer the question using only the context below.
If the answer is not in the context, say "I don't know."

Context:
{context}

Question: {query}
Answer:"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content
```

Two critical prompt constraints: "using only the context below" reduces hallucination, and "if the answer is not in the context, say I don't know" gives the model permission to abstain rather than invent.

### 6. Get grounded answers

Run it end to end:

```python
answer = ask("How do I roll back a failed deployment?")
print(answer)
```

The answer cites what was in the retrieved chunks. If the retrieved chunks were wrong or irrelevant, the answer will be wrong or irrelevant — which leads directly to Day 2.

**By end of Day 1 you can:**
- Split any document corpus into chunks
- Embed chunks and store them in a vector database
- Retrieve semantically relevant chunks at query time
- Inject those chunks into a prompt and get a grounded answer
- Reason about why an answer was good or bad by inspecting the retrieved chunks

---

## DAY 2 — Make it real

### 1. Chunking strategies

Fixed-size chunking is a starting point, not a solution.

**Recursive character splitting** — splits on paragraph breaks, then sentences, then words, only splitting mid-sentence when necessary. Better than splitting on raw character count. This is what `RecursiveCharacterTextSplitter` does.

**Semantic chunking** — embeds candidate split points and only splits where meaning shifts significantly. Produces chunks with high internal coherence. More expensive but higher quality for dense technical prose.

**Document-structure-aware splitting** — split markdown at headers, split code at function boundaries, split PDFs at section breaks. Use the document's own structure as the guide. A markdown runbook should be chunked at `##` headings, not at every 512 tokens.

**Overlap tuning** — too little overlap and you lose cross-sentence context; too much and you inflate storage and retrieval cost. A 10-15% overlap ratio (64 tokens on a 512-token chunk) is a reasonable starting range.

### 2. Embedding model selection

Not all embedding models are equal. Key dimensions:

- **Dimension count** — higher-dimension embeddings (1536, 3072) capture more nuance but cost more to store and query. `text-embedding-3-small` (1536 dims) is a strong default. `text-embedding-3-large` (3072 dims) is worth trying on precision-critical applications.
- **Domain fit** — general-purpose models work well for most English prose. Code-heavy corpora benefit from code-specific embeddings (e.g., `voyage-code-2`). Multilingual corpora need multilingual models.
- **Max token length** — embedding models have their own token limits (typically 512–8192). Chunks larger than the model's limit are silently truncated. Know your model's limit before setting chunk size.
- **Latency and cost** — local models (e.g., `nomic-embed-text` via Ollama) eliminate API cost and latency for ingestion. Use them for high-volume offline processing; use API models when you need the best quality.

### 3. Hybrid search

Pure semantic search fails on exact matches — if a user asks about `PAYMENT_SERVICE_TIMEOUT_ERROR`, a semantic search may return chunks about timeouts in general, not the specific error code.

Add BM25 keyword search alongside vector search, then merge the result lists:

```python
from rank_bm25 import BM25Okapi

# Build BM25 index over chunk texts
tokenized_corpus = [chunk.split() for chunk in all_chunks]
bm25 = BM25Okapi(tokenized_corpus)

def hybrid_retrieve(query: str, top_k: int = 10) -> list[str]:
    # Semantic results
    semantic_results = retrieve(query, top_k=top_k)

    # Keyword results
    keyword_scores = bm25.get_scores(query.split())
    top_keyword_indices = keyword_scores.argsort()[-top_k:][::-1]
    keyword_results = [all_chunks[i] for i in top_keyword_indices]

    # Merge and deduplicate (Reciprocal Rank Fusion is a simple, effective strategy)
    seen = set()
    merged = []
    for chunk in semantic_results + keyword_results:
        if chunk not in seen:
            seen.add(chunk)
            merged.append(chunk)
    return merged[:top_k]
```

Reciprocal Rank Fusion (RRF) is the standard merge strategy — it re-ranks the combined list by summing reciprocal ranks from each source.

### 4. Re-ranking

The retriever returns top-K candidates optimized for recall. Re-ranking re-scores those candidates for precision — it's a second, slower, more accurate relevance pass.

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def rerank(query: str, chunks: list[str], top_n: int = 3) -> list[str]:
    pairs = [(query, chunk) for chunk in chunks]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(scores, chunks), reverse=True)
    return [chunk for _, chunk in ranked[:top_n]]
```

Retrieve 10-20 candidates, re-rank to top-3 or top-5 for context injection. This dramatically improves answer quality at the cost of one additional model call per query.

### 5. Metadata filtering

Every chunk should carry metadata: source file, section, date, author, document type, service name. Store metadata alongside the embedding and filter on it at query time.

```python
collection.add(
    documents=[chunk],
    embeddings=[embed(chunk)],
    ids=[f"chunk_{i}"],
    metadatas=[{
        "source": "runbooks/payment-service.md",
        "section": "Restart Procedures",
        "last_updated": "2025-11-15",
        "team": "payments",
    }],
)

# Filter at retrieval time
results = collection.query(
    query_embeddings=[embed(query)],
    n_results=5,
    where={"team": "payments"},  # only retrieve from payments team docs
)
```

Metadata filtering is underused. It's the difference between retrieving from your entire knowledge base and retrieving from the right namespace.

### 6. Evaluation

Without evaluation, you're flying blind. RAG has two evaluation surfaces:

**Retrieval quality** — did the retriever surface the right chunks?

- **Recall@K**: what fraction of ground-truth relevant chunks appear in the top-K results?
- **MRR (Mean Reciprocal Rank)**: how high in the result list does the first relevant chunk appear?
- Build a small labeled evaluation set: 50-100 (query, expected_source_chunk) pairs. Run it on every configuration change.

**Answer quality** — did the LLM produce a correct answer given the retrieved context?

- **Faithfulness**: is every claim in the answer supported by the retrieved chunks? (LLM-as-judge or RAGAS)
- **Answer relevance**: does the answer address the question?
- **Context precision**: of the retrieved chunks, what fraction were actually needed?

RAGAS is a practical evaluation framework for all of these:

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall

results = evaluate(
    dataset=eval_dataset,
    metrics=[faithfulness, answer_relevancy, context_recall],
)
```

Establish a baseline before tuning anything. Know your numbers. "It feels better" is not a metric.

### 7. Handling large documents

Documents that are themselves enormous (100+ page PDFs, full codebases) require extra care.

- **Hierarchical indexing** — index document summaries separately from detailed chunks. Retrieve summaries first to identify which documents are relevant, then retrieve detail chunks only from those documents.
- **Late chunking** — embed the full document, then split, preserving global context per token. Supported by some embedding models (e.g., `jina-embeddings-v3`).
- **Parent-child chunks** — small chunks for retrieval precision, large parent chunks for context richness. Retrieve by small chunk, inject the parent chunk.
- **Sliding window with sentence-level granularity** — split at sentence boundaries with a wide window, step by one sentence at a time. Expensive but highly precise.

### 8. Production architecture

A production RAG system has two distinct data flows.

**Ingestion pipeline (offline/async):**
```
Document source (S3, Confluence, GitHub)
  -> Document watcher (webhook or poll)
  -> Chunker
  -> Embedding model
  -> Vector store upsert
  -> Metadata store update
```

Run ingestion async. Use a queue (SQS, Kafka, Redis Streams) to buffer document change events. Upsert, don't delete-and-reinsert — track chunk IDs by (document_id, chunk_index) so updates touch only changed chunks.

**Caching:** cache embeddings for queries that repeat. A query like "how do I restart the payment service" will be asked dozens of times. Cache the retrieved chunks by query embedding (approximate match on the embedding itself, or exact match on the query string after normalization).

**Versioning:** when you change your embedding model, you must re-embed your entire corpus. Version your vector collections explicitly (`runbooks_v1`, `runbooks_v2`). Run both in parallel during the migration window.

### 9. Multi-modal RAG

Documents aren't just text. Diagrams, screenshots, tables, and PDFs with complex layouts require additional handling.

- **Tables** — extract as markdown or HTML, not plain text. Structure matters for reasoning.
- **Images and diagrams** — use a vision model (GPT-4o, Claude 3.5) to generate a text description. Embed the description.
- **PDFs** — use a proper PDF parser (PyMuPDF, pdfplumber) rather than simple text extraction. Many PDFs have two-column layouts, headers/footers, and footnotes that naive extractors mangle.
- **Code files** — embed at function/class granularity, not file granularity. Add language, function name, and module path as metadata.

### 10. Agentic RAG

Basic RAG is a single retrieval call before a single generation call. Agentic RAG loops retrieval and generation — the model can decide to retrieve more, retrieve differently, or stop.

Patterns:
- **Iterative retrieval** — after generation, the model evaluates whether its answer was well-supported and, if not, issues a refined query.
- **Query decomposition** — break a complex question into sub-questions, retrieve for each, synthesize.
- **Self-RAG** — the model generates "retrieval tokens" inline to decide when and what to retrieve during generation.
- **Tool-augmented retrieval** — give the model a `retrieve(query)` tool in a tool-use loop. The model calls it as many times as needed before answering.

Agentic RAG trades latency for quality. Reserve it for high-stakes queries where a single retrieval pass isn't sufficient.

---

## Worked example — RAG for internal runbooks

**Scenario:** your team has 80 markdown runbooks in a `runbooks/` directory. An on-call engineer asks: "how do I restart the payment service?"

**Step 1: Ingestion**

```python
import os
from pathlib import Path

runbook_dir = Path("runbooks/")

for md_file in runbook_dir.glob("**/*.md"):
    text = md_file.read_text()
    chunks = splitter.split_text(text)
    for i, chunk in enumerate(chunks):
        collection.add(
            documents=[chunk],
            embeddings=[embed(chunk)],
            ids=[f"{md_file.stem}_{i}"],
            metadatas=[{
                "source": str(md_file),
                "service": md_file.stem,
            }],
        )
```

**Step 2: Query**

The engineer submits: `"how do I restart the payment service"`

```python
query = "how do I restart the payment service"
query_vec = embed(query)
```

**Step 3: Retrieval**

The vector store returns the top-5 chunks by cosine similarity. The top result is a 400-token chunk from `runbooks/payment-service.md` containing:

```
## Restart Procedures

To perform a graceful restart of the payment service:

1. Drain in-flight requests: kubectl annotate pod -l app=payment-service \
   cluster-autoscaler.kubernetes.io/safe-to-evict="true"
2. Scale down: kubectl scale deployment payment-service --replicas=0 -n payments
3. Verify all pods terminated: kubectl get pods -n payments -w
4. Scale back up: kubectl scale deployment payment-service --replicas=3 -n payments
5. Confirm health: kubectl rollout status deployment/payment-service -n payments

⚠️ Never hard-kill pods during peak hours (09:00-21:00 UTC). Use drain first.
```

**Step 4: Context injection**

The retrieved chunk is injected into the prompt:

```
You are an SRE assistant. Answer using only the context below.
If the answer is not in the context, say "I don't know."

Context:
[retrieved chunk — 400 tokens of restart procedure]

Question: how do I restart the payment service?
Answer:
```

**Step 5: Grounded answer**

The model returns a step-by-step answer that mirrors the runbook — with the kubectl commands, the drain-first instruction, and the peak-hours warning — because all of that was in the retrieved context. The model didn't need to know any of this at training time.

If the retriever had instead returned a chunk about the payments database, the answer would have been wrong. Retrieval quality is the primary lever on answer quality.

---

## Common pitfalls

- **Chunks too large.** A 2000-token chunk usually contains multiple distinct topics. The embedding averages over all of them, making it a bad match for any single query about one of those topics. Keep chunks focused. 300-600 tokens is usually the right range.

- **Chunks too small.** A 50-token chunk is often a single sentence without context. The retriever surfaces it, but the model lacks the surrounding information to give a useful answer. Use overlap or parent-child chunking to preserve context.

- **Wrong embedding model.** Embedding text with a general-purpose English model and then querying in another language, or embedding code with a prose model, degrades retrieval quality significantly. Match the embedding model to the domain and language of your corpus.

- **No evaluation.** The most common RAG mistake. You tune chunk size, swap embedding models, add a re-ranker — and have no idea whether any of it helped. Build a labeled eval set on day one. Run it before and after every change.

- **Ignoring metadata.** Storing all documents in a single flat collection without metadata means a query about your payments service retrieves chunks from your unrelated infrastructure docs. Namespace with metadata and filter at retrieval time.

- **Stuffing too much context.** Injecting 15 chunks (6000 tokens) hoping more context is better is counterproductive. The model's attention degrades on long contexts — the "lost in the middle" phenomenon — and you're wasting context window on irrelevant chunks. Retrieve 10-20, re-rank to 3-5, inject those.

- **Not handling retrieval failure.** When no relevant chunks exist, a naive RAG system either injects irrelevant chunks or injects nothing — both produce bad answers. Add a confidence threshold. If the top-K similarity scores are below a threshold, respond "I couldn't find relevant information in the knowledge base" rather than hallucinating.

- **Stale embeddings.** Documents change. If your ingestion pipeline isn't running, your vector store drifts from reality. Runbooks updated after a major incident need to be re-ingested. Treat the ingestion pipeline as a first-class system with monitoring and alerting, not a one-time migration script.

---

## Quick reference

### Architecture diagram

```
                    INGESTION (offline)
                    +------------------------------------------+
  Raw Docs ------>  |  Chunker -> Embedder -> Vector Store     |
  (S3, Git,         +------------------------------------------+
   Confluence)                      |
                                    v
                    QUERY (online, per request)
  User Query                  +-----------+
      |                       | Vec Store |
      v                       +-----+-----+
  Embed Query --> Retriever <--------+
                      |
                      v
                  Re-ranker (optional)
                      |
                      v
               Top-K Chunks
                      |
                      v
  User Query + Chunks --> LLM --> Grounded Answer
```

### Chunking formulas

| Strategy | chunk_size | overlap | Best for |
|---|---|---|---|
| Short/precise | 256 tokens | 32 tokens | FAQs, structured data |
| General prose | 512 tokens | 64 tokens | Documentation, runbooks |
| Long-form | 1024 tokens | 128 tokens | Research papers, long reports |
| Hierarchical | 128 (child) + 512 (parent) | 0 | Mixed precision/context needs |

### Embedding model comparison

| Model | Dims | Max tokens | Notes |
|---|---|---|---|
| `text-embedding-3-small` | 1536 | 8191 | Strong default, low cost |
| `text-embedding-3-large` | 3072 | 8191 | Higher quality, 2x cost |
| `voyage-2` | 1024 | 4096 | Strong on general retrieval |
| `voyage-code-2` | 1536 | 16000 | Best for code corpora |
| `nomic-embed-text` | 768 | 8192 | Open weights, runs locally |
| `jina-embeddings-v3` | 1024 | 8192 | Supports late chunking |

### Vector database comparison

| DB | Deployment | Hybrid search | Metadata filtering | Best for |
|---|---|---|---|---|
| **pgvector** | Self-hosted (Postgres) | Via GIN index + pg_trgm | Native SQL | Teams already on Postgres |
| **Chroma** | In-process or server | No (bring your own) | Yes | Prototyping, local dev |
| **FAISS** | In-process (library) | No | No | High-throughput read-only indexes |
| **Pinecone** | Managed | Yes | Yes | Fully managed production |
| **Weaviate** | Self-hosted or managed | Yes (BM25 + vector) | Yes | Hybrid search at scale |
| **Qdrant** | Self-hosted or managed | Yes | Yes | Performance-critical production |

### Sample code patterns

**End-to-end RAG class:**

```python
from openai import OpenAI
import chromadb

class RAGPipeline:
    def __init__(self, collection_name: str = "knowledge"):
        self.client = OpenAI()
        self.db = chromadb.Client()
        self.collection = self.db.get_or_create_collection(collection_name)

    def ingest(self, text: str, metadata: dict, doc_id: str) -> None:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
        splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=64)
        chunks = splitter.split_text(text)
        for i, chunk in enumerate(chunks):
            self.collection.upsert(
                documents=[chunk],
                embeddings=[self._embed(chunk)],
                ids=[f"{doc_id}_{i}"],
                metadatas=[metadata],
            )

    def query(self, question: str, top_k: int = 5) -> str:
        results = self.collection.query(
            query_embeddings=[self._embed(question)],
            n_results=top_k,
        )
        chunks = results["documents"][0]
        context = "\n\n---\n\n".join(chunks)
        prompt = (
            "Answer using only the context below. "
            "If the answer is not present, say 'I don't know.'\n\n"
            f"Context:\n{context}\n\nQuestion: {question}\nAnswer:"
        )
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content

    def _embed(self, text: str) -> list[float]:
        return self.client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        ).data[0].embedding
```

**RAGAS evaluation:**

```python
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall

eval_data = {
    "question": ["how do I restart the payment service?"],
    "answer": [generated_answer],
    "contexts": [retrieved_chunks],
    "ground_truth": ["kubectl scale deployment payment-service --replicas=0 ..."],
}
dataset = Dataset.from_dict(eval_data)
scores = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_recall])
print(scores)
```

---

## Next steps after Day 2

- **`LLM-Fundamentals.md`** — understand the generation side: temperature, sampling, context window internals, and why the model behaves as it does.
- **`Prompt-Engineering.md`** — the quality of your RAG prompt is a major lever on answer quality. System prompts, few-shot examples, chain-of-thought, and citation instructions all matter.
- **`LLMOps.md`** — deploying RAG to production: latency budgets, observability, A/B testing retrieval strategies, cost management, and failure modes at scale.
- **LangChain / LlamaIndex** — high-level frameworks that abstract chunkers, retrievers, re-rankers, and LLM chains. Useful for prototyping; understand what's underneath before depending on the abstraction.
- **Vector database deep-dives** — if you're building on pgvector, read the index type tradeoffs (IVFFlat vs HNSW). If you're on Weaviate or Qdrant, understand their filtering and consistency models before production use.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [James Briggs — RAG & Vector Databases](https://www.youtube.com/@jamesbriggs) — detailed walkthroughs of chunking strategies, Pinecone, embedding models, and re-ranking pipelines
- [AI Jason — RAG Tutorials](https://www.youtube.com/@AIJasonZ) — practical RAG implementations, hybrid search, and evaluation patterns
- [Sam Witteveen — RAG Deep Dives](https://www.youtube.com/@samwitteveen) — advanced RAG techniques including parent-child chunking, metadata filtering, and multi-query retrieval
- [DeepLearning.AI — Building RAG Applications](https://www.youtube.com/@Deeplearningai) — short courses on RAG architecture, evaluation, and production deployment
- [Yannic Kilcher — Retrieval Papers](https://www.youtube.com/@YannicKilcher) — academic research on dense retrieval, re-ranking, and embedding model training

**Official docs & blogs:**
- [LangChain RAG Documentation](https://python.langchain.com/docs/tutorials/rag/) — end-to-end RAG tutorials with retrievers, splitters, and chain patterns
- [Pinecone Learning Centre](https://www.pinecone.io/learn/) — vector database concepts, embedding model comparisons, and retrieval architecture guides
- [Chip Huyen — Building RAG Systems](https://huyenchip.com/blog/) — evaluation strategies, chunking tradeoffs, and production RAG patterns

---

**The mantra:** Garbage in, garbage out — if your retriever surfaces the wrong chunks, no LLM in the world will save the answer.
