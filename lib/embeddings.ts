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

export async function loadEmbeddingModel(
    onProgress?: (progress: number) => void
): Promise<void> {
    if (embedder) return

    if (loadingPromise) {
        await loadingPromise
        return
    }

    loadingPromise = (async () => {
        const { pipeline, env } = await import('@xenova/transformers')
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

        embedder = pipe as unknown as typeof embedder
    })()

    await loadingPromise
}

export function isModelLoaded(): boolean {
    return embedder !== null
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding
// ─────────────────────────────────────────────────────────────────────────────

async function embedPassage(text: string): Promise<Float32Array> {
    if (!embedder) throw new Error('Embedding model not loaded. Call loadEmbeddingModel() first.')
    const output = await embedder(`passage: ${text}`, { pooling: 'mean', normalize: true })
    return output.data
}

async function embedQuery(text: string): Promise<Float32Array> {
    if (!embedder) throw new Error('Embedding model not loaded. Call loadEmbeddingModel() first.')
    const output = await embedder(`query: ${text}`, { pooling: 'mean', normalize: true })
    return output.data
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure-Aware Chunking
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_CHUNK_SIZE = 300  // chars (~80-100 tokens) — leaves room for query in 512-token limit
const MIN_CHUNK_SIZE = 40

/** Detect if a line is a heading/section title (standalone line, not part of a paragraph) */
function isHeading(line: string): boolean {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > 80) return false
    // Markdown headings
    if (/^#{1,6}\s/.test(trimmed)) return true
    // ALL CAPS lines with at least 2 words (common in legal/formal docs)
    if (trimmed.length > 5 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && !trimmed.includes(': ')) return true
    // Simple labels ending with colon (e.g. "Age:", "Prizes:")
    if (trimmed.endsWith(':') && trimmed.length < 40 && !trimmed.includes('. ') && trimmed.split(/\s+/).length <= 4) return true
    // Title-case short lines without ending punctuation (e.g. "Eligibility Requirements", "Important Dates")
    // Must be 2-6 words, no period at end, at least half the words capitalized
    if (trimmed.length < 60 && !trimmed.endsWith('.') && !trimmed.endsWith(',') && !trimmed.includes(': ')) {
        const words = trimmed.split(/\s+/)
        if (words.length >= 1 && words.length <= 6) {
            const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length
            if (capitalizedWords >= Math.ceil(words.length / 2)) return true
        }
    }
    return false
}

/** Split text on sentence boundaries */
function splitSentences(text: string): string[] {
    // Split on ". " followed by uppercase, "? ", "! ", or newline
    // Preserve the delimiter with the preceding sentence
    const parts = text.split(/(?<=[.!?])\s+(?=[A-Z\n])|(?<=\n)/)
    return parts.map(s => s.trim()).filter(s => s.length > 0)
}

interface RawChunk {
    text: string
    heading: string | null
    position: number
}

/**
 * Split document text into semantically coherent chunks.
 *
 * Strategy (3-tier cascade):
 * 1. Split on paragraph boundaries (double newline)
 * 2. Track headings as metadata for each chunk
 * 3. Merge small paragraphs, split large ones on sentence boundaries
 * 4. Last resort: character split at word boundary
 */
export function chunkText(text: string): RawChunk[] {
    const paragraphs = text.split(/\n\s*\n/)
    const chunks: RawChunk[] = []
    let currentHeading: string | null = null
    let buffer = ''
    let position = 0

    for (const para of paragraphs) {
        const trimmed = para.trim()
        if (!trimmed) continue

        // Check if this paragraph is a heading
        const lines = trimmed.split('\n')
        if (lines.length === 1 && isHeading(trimmed)) {
            // Flush buffer before heading change
            if (buffer.trim().length >= MIN_CHUNK_SIZE) {
                chunks.push({ text: buffer.trim(), heading: currentHeading, position: position++ })
                buffer = ''
            }
            currentHeading = trimmed.replace(/^#+\s*/, '').replace(/:$/, '').trim()
            continue
        }

        // Check if first line of paragraph is a heading
        if (lines.length > 1 && isHeading(lines[0])) {
            if (buffer.trim().length >= MIN_CHUNK_SIZE) {
                chunks.push({ text: buffer.trim(), heading: currentHeading, position: position++ })
                buffer = ''
            }
            currentHeading = lines[0].replace(/^#+\s*/, '').replace(/:$/, '').trim()
            // Rest of paragraph becomes content
            const rest = lines.slice(1).join('\n').trim()
            if (rest) buffer += (buffer ? '\n' : '') + rest
            continue
        }

        // Regular paragraph — add to buffer
        const candidate = buffer ? buffer + '\n' + trimmed : trimmed

        if (candidate.length <= TARGET_CHUNK_SIZE) {
            // Fits in current chunk — keep buffering
            buffer = candidate
        } else if (buffer.length >= MIN_CHUNK_SIZE) {
            // Buffer is big enough — flush it, start new buffer with this paragraph
            chunks.push({ text: buffer.trim(), heading: currentHeading, position: position++ })
            buffer = trimmed

            // If this paragraph alone exceeds target, split it
            if (trimmed.length > TARGET_CHUNK_SIZE) {
                const subChunks = splitLargeText(trimmed, currentHeading, position)
                for (const sc of subChunks) {
                    chunks.push({ ...sc, position: position++ })
                }
                buffer = ''
            }
        } else {
            // Buffer too small — merge and check if we need to split
            if (candidate.length > TARGET_CHUNK_SIZE) {
                const subChunks = splitLargeText(candidate, currentHeading, position)
                for (const sc of subChunks) {
                    chunks.push({ ...sc, position: position++ })
                }
                buffer = ''
            } else {
                buffer = candidate
            }
        }
    }

    // Flush remaining buffer
    if (buffer.trim().length >= MIN_CHUNK_SIZE) {
        chunks.push({ text: buffer.trim(), heading: currentHeading, position: position++ })
    } else if (buffer.trim().length > 0 && chunks.length > 0) {
        // Append tiny remainder to last chunk
        chunks[chunks.length - 1].text += '\n' + buffer.trim()
    }

    // Reindex positions
    return chunks.map((c, i) => ({ ...c, position: i }))
}

/** Split a large text block on sentence boundaries, then word boundaries */
function splitLargeText(text: string, heading: string | null, startPos: number): RawChunk[] {
    const sentences = splitSentences(text)
    const chunks: RawChunk[] = []
    let buffer = ''

    for (const sentence of sentences) {
        const candidate = buffer ? buffer + ' ' + sentence : sentence

        if (candidate.length <= TARGET_CHUNK_SIZE) {
            buffer = candidate
        } else {
            if (buffer.length >= MIN_CHUNK_SIZE) {
                chunks.push({ text: buffer.trim(), heading, position: startPos })
            }

            // If single sentence exceeds target, split at word boundary
            if (sentence.length > TARGET_CHUNK_SIZE) {
                let remaining = sentence
                while (remaining.length > TARGET_CHUNK_SIZE) {
                    const cutPoint = remaining.lastIndexOf(' ', TARGET_CHUNK_SIZE)
                    const cut = cutPoint > MIN_CHUNK_SIZE ? cutPoint : TARGET_CHUNK_SIZE
                    chunks.push({ text: remaining.slice(0, cut).trim(), heading, position: startPos })
                    remaining = remaining.slice(cut).trim()
                }
                buffer = remaining
            } else {
                buffer = sentence
            }
        }
    }

    if (buffer.trim().length >= MIN_CHUNK_SIZE) {
        chunks.push({ text: buffer.trim(), heading, position: startPos })
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
    heading: string | null
    position: number
    embedding: Float32Array
}

export async function indexDocument(
    docId: string,
    documentText: string
): Promise<DocumentChunk[]> {
    const rawChunks = chunkText(documentText)
    const indexed: DocumentChunk[] = []

    console.log(`[Custos] Indexing ${rawChunks.length} chunks (structure-aware)`)

    for (let i = 0; i < rawChunks.length; i++) {
        const rc = rawChunks[i]
        // Prepend heading to embedding text for better semantic matching
        const embeddingText = rc.heading ? `${rc.heading}: ${rc.text}` : rc.text
        const embedding = await embedPassage(embeddingText)
        indexed.push({
            docId,
            chunkIndex: i,
            text: rc.text,
            heading: rc.heading,
            position: rc.position,
            embedding,
        })
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
    chunkIndex: number
    heading: string | null
    position: number
}

const SIMILARITY_THRESHOLD = 0.6

export async function searchDocuments(
    query: string,
    index: DocumentChunk[],
    topK: number = 3
): Promise<SearchResult[]> {
    if (index.length === 0) return []

    const queryEmbedding = await embedQuery(query)

    const scores = index.map(chunk => ({
        docId: chunk.docId,
        chunk: chunk.text,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
        chunkIndex: chunk.chunkIndex,
        heading: chunk.heading,
        position: chunk.position,
    }))

    return scores
        .filter(r => r.score >= SIMILARITY_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble context for the LLM from search results.
 * - Grabs the top result + adjacent chunks for boundary context
 * - Sorts by document position (natural reading order)
 * - Prepends section heading
 * - Truncates to maxChars budget
 */
export function assembleContext(
    results: SearchResult[],
    allChunks: DocumentChunk[],
    maxChars: number = 350
): string {
    if (results.length === 0) return ''

    const top = results[0]

    // Collect: top chunk + adjacent chunks (position ± 1)
    const positions = new Set<number>([top.position])
    if (top.position > 0) positions.add(top.position - 1)
    if (top.position < allChunks.length - 1) positions.add(top.position + 1)

    // Also add other search results if they fit
    for (const r of results.slice(1)) {
        positions.add(r.position)
    }

    // Get chunks sorted by document position
    const selected = allChunks
        .filter(c => positions.has(c.position))
        .sort((a, b) => a.position - b.position)

    // Build context with heading prefix
    let context = ''
    if (top.heading) {
        context = `[${top.heading}]\n`
    }

    for (const chunk of selected) {
        const candidate = context + chunk.text + '\n'
        if (candidate.length <= maxChars) {
            context = candidate
        } else {
            // Add as much of this chunk as fits
            const remaining = maxChars - context.length
            if (remaining > 50) {
                // Cut at last sentence boundary within budget
                const partial = chunk.text.slice(0, remaining)
                const lastPeriod = partial.lastIndexOf('. ')
                context += lastPeriod > 50 ? partial.slice(0, lastPeriod + 1) : partial
            }
            break
        }
    }

    return context.trim()
}
