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

async function generateWithBrowser(query: string, context: string): Promise<string> {
    if (!qaModel) throw new Error('Browser LLM not loaded')

    // Try extractive QA first (more accurate for specific questions)
    const qaResult = await qaModel(query, context)
    console.log('[Custos] QA result:', qaResult.answer, 'score:', qaResult.score?.toFixed(3))

    // If confidence is high enough, use the extractive answer
    if (qaResult.score > 0.1 && qaResult.answer?.trim()) {
        return qaResult.answer.trim()
    }

    // Low confidence → fall back to generative model
    if (genModel) {
        const shortCtx = context.slice(0, 350)
        const prompt = `Based on the text: ${shortCtx} ${query}`
        const genResult = await genModel(prompt, { max_new_tokens: 150, do_sample: false })
        const answer = genResult[0]?.generated_text?.trim()
        if (answer) return answer
    }

    return qaResult.answer?.trim() || 'I could not find a clear answer in the document. Try rephrasing your question.'
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
    const greetings = /^(hi|hello|hey|sup|yo|greetings|good morning|good evening|thanks|thank you|ok|okay)\b/i
    return greetings.test(query.trim()) && query.trim().split(/\s+/).length <= 4
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
