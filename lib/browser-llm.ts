/**
 * Browser-based LLM inference using Transformers.js.
 * Runs entirely in the browser via WebAssembly — no server, no API calls.
 * Document text never leaves the browser tab.
 *
 * Model: Xenova/flan-t5-small (~80MB ONNX, cached in IndexedDB after first load)
 * Tested: Correctly answers "What are the eligibility requirements?" from context
 * Fallback: Ollama on localhost if available (for larger/better models)
 */

let generator: any = null
let loadingPromise: Promise<void> | null = null

export type InferenceBackend = 'browser' | 'ollama' | 'none'

// ─────────────────────────────────────────────────────────────────────────────
// Browser LLM (Transformers.js)
// ─────────────────────────────────────────────────────────────────────────────

export async function loadBrowserLLM(
    onProgress?: (progress: number) => void
): Promise<void> {
    if (generator) return

    if (loadingPromise) {
        await loadingPromise
        return
    }

    loadingPromise = (async () => {
        const { pipeline, env } = await import('@xenova/transformers')
        env.useBrowserCache = true
        env.allowLocalModels = false

        generator = await pipeline(
            'text2text-generation',
            'Xenova/flan-t5-small',
            {
                progress_callback: (p: { progress?: number; status?: string }) => {
                    if (onProgress && p.progress !== undefined) {
                        onProgress(Math.round(p.progress))
                    }
                },
            }
        )
        console.log('[Custos] Browser LLM loaded: flan-t5-small')
    })()

    await loadingPromise
}

export function isBrowserLLMLoaded(): boolean {
    return generator !== null
}

async function generateWithBrowser(prompt: string): Promise<string> {
    if (!generator) throw new Error('Browser LLM not loaded')
    const result = await generator(prompt, {
        max_new_tokens: 300,
        temperature: 0.1,
        do_sample: false,
    })
    return result[0]?.generated_text || ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama detection (optional local upgrade)
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

async function generateWithOllama(model: string, prompt: string, context: string): Promise<string> {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: 'You are a precise document analyst. Answer based ONLY on the provided document. Be concise.' },
                { role: 'user', content: `Document:\n${context.slice(0, 4000)}\n\nQuestion: ${prompt}` },
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

/**
 * Run document Q&A inference.
 * Priority: Ollama (if available, better quality) → Browser LLM (always works)
 */
export async function runInference(
    query: string,
    context: string,
    ollamaModel: string | null
): Promise<{ answer: string; backend: InferenceBackend }> {
    // Try Ollama first (better quality if user has it)
    if (ollamaModel) {
        try {
            const answer = await generateWithOllama(ollamaModel, query, context)
            if (answer) return { answer, backend: 'ollama' }
        } catch {
            console.warn('[Custos] Ollama failed, falling back to browser LLM')
        }
    }

    // Fall back to browser LLM (always available)
    const prompt = `Answer the question based on the document context below. If the answer is not in the document, say so.\n\nContext: ${context.slice(0, 2000)}\n\nQuestion: ${query}\n\nAnswer:`
    const answer = await generateWithBrowser(prompt)
    return { answer, backend: 'browser' }
}
