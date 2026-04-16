/**
 * Semantic search using multilingual-e5-small via @xenova/transformers.
 * Runs entirely in the browser as WebAssembly — no server, no API call.
 * Document text is embedded locally, never transmitted.
 *
 * Model: intfloat/multilingual-e5-small
 * Size: ~117MB (cached in IndexedDB after first load)
 * Dimensions: 384
 * Languages: 100+
 */

let embedder: ((text: string, options: object) => Promise<{ data: Float32Array }>) | null = null
let loadingPromise: Promise<void> | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Model Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the e5-small model (once, cached in browser IndexedDB).
 * Call this during app startup to preload the model.
 */
export async function loadEmbeddingModel(
    onProgress?: (progress: number) => void
): Promise<void> {
    if (embedder) return  // already loaded

    if (loadingPromise) {
        await loadingPromise
        return
    }

    loadingPromise = (async () => {
        // Dynamic import to avoid SSR issues
        const { pipeline, env } = await import('@xenova/transformers')

        // Use browser cache (IndexedDB) — model downloads once
        env.useBrowserCache = true
        env.allowLocalModels = false

        const pipe = await pipeline(
            'feature-extraction',
            'Xenova/multilingual-e5-small',
            {
                progress_callback: (progress: { progress?: number }) => {
                    if (onProgress && progress.progress !== undefined) {
                        onProgress(Math.round(progress.progress))
                    }
                },
            }
        )

        // Store as typed function
        embedder = pipe as unknown as typeof embedder
    })()

    await loadingPromise
}

/**
 * Check if the model is loaded.
 */
export function isModelLoaded(): boolean {
    return embedder !== null
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Embed a text passage (document chunk).
 * Use "passage: " prefix as required by the e5 model format.
 */
async function embedPassage(text: string): Promise<Float32Array> {
    if (!embedder) throw new Error('Embedding model not loaded. Call loadEmbeddingModel() first.')
    const output = await embedder(`passage: ${text}`, { pooling: 'mean', normalize: true })
    return output.data
}

/**
 * Embed a search query.
 * Use "query: " prefix as required by the e5 model format.
 */
async function embedQuery(text: string): Promise<Float32Array> {
    if (!embedder) throw new Error('Embedding model not loaded. Call loadEmbeddingModel() first.')
    const output = await embedder(`query: ${text}`, { pooling: 'mean', normalize: true })
    return output.data
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Chunking
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 400     // characters per chunk (approx 100-120 tokens)
const CHUNK_OVERLAP = 50   // overlap to maintain context at chunk boundaries

/**
 * Split document text into overlapping chunks for embedding.
 */
export function chunkText(text: string): string[] {
    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
        const end = Math.min(start + CHUNK_SIZE, text.length)
        const chunk = text.slice(start, end).trim()
        if (chunk.length > 20) {  // skip tiny fragments
            chunks.push(chunk)
        }
        start += CHUNK_SIZE - CHUNK_OVERLAP
    }

    return chunks
}

// ─────────────────────────────────────────────────────────────────────────────
// Cosine Similarity
// ─────────────────────────────────────────────────────────────────────────────

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Index
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentChunk {
    docId: string
    chunkIndex: number
    text: string
    embedding: Float32Array
}

/**
 * Index a document by computing embeddings for all its text chunks.
 * Run this after decrypting a document locally.
 *
 * @param docId Document identifier
 * @param documentText Plaintext content (decrypted locally, never transmitted)
 * @returns Array of indexed chunks with embeddings
 */
export async function indexDocument(
    docId: string,
    documentText: string
): Promise<DocumentChunk[]> {
    const chunks = chunkText(documentText)
    const indexed: DocumentChunk[] = []

    for (let i = 0; i < chunks.length; i++) {
        const embedding = await embedPassage(chunks[i])
        indexed.push({ docId, chunkIndex: i, text: chunks[i], embedding })
    }

    return indexed
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic Search
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchResult {
    docId: string
    chunk: string
    score: number
}

const SIMILARITY_THRESHOLD = 0.5

/**
 * Search across indexed document chunks using semantic similarity.
 * All computation is local — query text never leaves the browser.
 *
 * @param query Natural language question or search term
 * @param index Array of indexed document chunks
 * @param topK Number of results to return
 * @returns Ranked search results
 */
export async function searchDocuments(
    query: string,
    index: DocumentChunk[],
    topK: number = 5
): Promise<SearchResult[]> {
    if (index.length === 0) return []

    const queryEmbedding = await embedQuery(query)

    const scores = index.map(chunk => ({
        docId: chunk.docId,
        chunk: chunk.text,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))

    return scores
        .filter(r => r.score >= SIMILARITY_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
}
