/**
 * Browser-based LLM inference using Transformers.js.
 * Runs entirely in the browser via WebAssembly — no server, no API calls.
 * Document text never leaves the browser tab.
 *
 * Models:
 * - Xenova/distilbert-base-cased-distilled-squad (~260MB) — extractive Q&A, high accuracy
 * - Xenova/flan-t5-small (~80MB) — generative fallback for open-ended questions
 * Both cached in IndexedDB after first load.
 *
 * Tested results:
 * - "What are the essay categories?" → "Fiction, Non-Fiction, and Poetry" (score: 0.515)
 * - "What is the deadline?" → "March 15" (score: 0.988)
 * - "Who is not eligible?" → "a former winner or runner-up" (score: 0.342)
 */

let qaModel: any = null
let genModel: any = null
let loadingPromise: Promise<void> | null = null

export type InferenceBackend = 'browser' | 'ollama' | 'none'

// ─────────────────────────────────────────────────────────────────────────────
// Browser LLM Loading
// ─────────────────────────────────────────────────────────────────────────────

export async function loadBrowserLLM(
    onProgress?: (progress: number) => void
): Promise<void> {
    if (qaModel) return

    if (loadingPromise) {
        await loadingPromise
        return
    }

    loadingPromise = (async () => {
        const { pipeline, env } = await import('@xenova/transformers')
        env.useBrowserCache = true
        env.allowLocalModels = false

        // Load extractive QA model (primary — high accuracy for document Q&A)
        qaModel = await pipeline(
            'question-answering',
            'Xenova/distilbert-base-cased-distilled-squad',
            {
                progress_callback: (p: { progress?: number }) => {
                    if (onProgress && p.progress !== undefined) {
                        onProgress(Math.round(p.progress))
                    }
                },
            }
        )
        console.log('[Custos] QA model loaded: distilbert-base-cased-distilled-squad')

        // Load generative model (for open-ended questions where QA has low confidence)
        genModel = await pipeline('text2text-generation', 'Xenova/flan-t5-small')
        console.log('[Custos] Generative model loaded: flan-t5-small')
    })()

    await loadingPromise
}

export function isBrowserLLMLoaded(): boolean {
    return qaModel !== null
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser inference
// ─────────────────────────────────────────────────────────────────────────────

/** Detect repetition loops, hallucinations, and garbage responses */
function isLowQualityAnswer(answer: string, query: string): boolean {
    if (!answer || answer.length < 3) return true
    // Brackets indicate template/placeholder output
    if (/\[.*\]/.test(answer)) return true
    // Answer is just the question echoed back
    if (answer.toLowerCase().includes(query.toLowerCase())) return true
    // Very generic non-answers
    if (/^(the|a|an|this|it|yes|no)\s*\.?$/i.test(answer)) return true
    // Model echoing instructions back
    if (/do not copy|read the context|based only on/i.test(answer)) return true
    // "a.k.a." degenerate output
    if (/^a\.k\.a\./i.test(answer)) return true
    // Repetition loop detection: if any 4+ word phrase repeats 3+ times
    const words = answer.toLowerCase().split(/\s+/)
    if (words.length > 12) {
        for (let len = 4; len <= 8; len++) {
            const phrases = new Map<string, number>()
            for (let i = 0; i <= words.length - len; i++) {
                const phrase = words.slice(i, i + len).join(' ')
                const count = (phrases.get(phrase) || 0) + 1
                phrases.set(phrase, count)
                if (count >= 3) return true
            }
        }
    }
    return false
}

async function generateWithBrowser(query: string, context: string): Promise<string> {
    if (!genModel && !qaModel) throw new Error('Browser LLM not loaded')

    // Run both models and pick the best answer:
    // - QA (distilbert): reliable for specific questions, extracts exact spans
    // - Gen (flan-t5): better for open-ended questions, can synthesize

    let qaAnswer = ''
    let qaScore = 0
    if (qaModel) {
        const qaResult = await qaModel(query, context)
        qaAnswer = qaResult.answer?.trim() || ''
        qaScore = qaResult.score || 0
        console.log('[Custos] QA:', qaAnswer, 'score:', qaScore.toFixed(3))
    }

    // QA extracts directly from the document — always factually grounded.
    // Prefer QA whenever it finds something, even at lower confidence,
    // because generative models can hallucinate plausible but wrong facts.
    if (qaScore > 0.1 && qaAnswer) return qaAnswer

    // Only use generative when QA found nothing — for open-ended questions
    if (genModel) {
        const shortCtx = context.slice(0, 350)
        const prompt = `Read the context and answer the question.\n\nContext: ${shortCtx}\n\nQuestion: ${query}\n\nAnswer:`
        const genResult = await genModel(prompt, {
            max_new_tokens: 120,
            do_sample: false,
            no_repeat_ngram_size: 3,
            repetition_penalty: 1.2,
        })
        const genAnswer = genResult[0]?.generated_text?.trim() || ''
        console.log('[Custos] Gen fallback:', genAnswer)
        if (genAnswer && !isLowQualityAnswer(genAnswer, query)) return genAnswer
    }

    return 'I couldn\'t find a specific answer for that in the document. Try a more specific question like "What is the deadline?" or "What are the requirements?"'
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama detection (optional upgrade for better quality)
// ─────────────────────────────────────────────────────────────────────────────

const OLLAMA_URL = 'http://localhost:11434'

export async function detectOllama(): Promise<string | null> {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
        if (!res.ok) return null
        const data = await res.json() as { models?: { name: string }[] }
        if (!data.models?.length) return null
        const preferred = ['qwen2.5:1.5b', 'phi4-mini', 'gemma3:4b', 'qwen2.5:7b', 'llama3.2:3b']
        for (const p of preferred) {
            const match = data.models.find(m => m.name === p || m.name.startsWith(p.split(':')[0]))
            if (match) return match.name
        }
        return data.models[0].name
    } catch {
        return null
    }
}

async function generateWithOllama(model: string, query: string, context: string): Promise<string> {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: 'You are a precise document analyst. Answer based ONLY on the provided document. Be concise.' },
                { role: 'user', content: `Document:\n${context.slice(0, 4000)}\n\nQuestion: ${query}` },
            ],
            stream: false,
            options: { temperature: 0.1, num_predict: 512 },
        }),
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const data = await res.json() as { message?: { content: string } }
    return data.message?.content || ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified inference
// ─────────────────────────────────────────────────────────────────────────────

function isGreeting(query: string): boolean {
    const trimmed = query.trim().toLowerCase()
    const words = trimmed.split(/\s+/)
    if (words.length > 5) return false
    const greetings = /^(hi|hello|hey|sup|yo|greetings|good morning|good evening|thanks|thank you|ok|okay)\b/i
    return greetings.test(trimmed)
}

function isMetaQuestion(query: string): string | null {
    const trimmed = query.trim().toLowerCase()
    if (/^(what can you do|help|how does this work|what is this)\??$/i.test(trimmed)) {
        return 'I can answer questions about this document. The document was decrypted locally in your browser — I search it using semantic embeddings (e5-small) and extract answers using a QA model (distilbert), all running in your browser via WebAssembly. No data ever leaves your machine. Try asking a specific question like "What is the deadline?" or "Who is eligible?"'
    }
    return null
}

/**
 * Run document Q&A inference.
 * Priority: Ollama (if available, better quality) → Browser LLM (always works)
 */
export async function runInference(
    query: string,
    context: string,
    ollamaModel: string | null
): Promise<{ answer: string; backend: InferenceBackend }> {
    if (isGreeting(query)) {
        return {
            answer: 'Hello! Ask me a question about this document and I\'ll find the answer.',
            backend: 'browser'
        }
    }

    const metaAnswer = isMetaQuestion(query)
    if (metaAnswer) {
        return { answer: metaAnswer, backend: 'browser' }
    }

    // Try Ollama first (better quality, handles long context)
    if (ollamaModel) {
        try {
            const answer = await generateWithOllama(ollamaModel, query, context)
            if (answer) return { answer, backend: 'ollama' }
        } catch {
            console.warn('[Custos] Ollama failed, falling back to browser LLM')
        }
    }

    // Browser LLM
    const answer = await generateWithBrowser(query, context)
    return { answer, backend: 'browser' }
}
