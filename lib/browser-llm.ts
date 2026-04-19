/**
 * Browser-based LLM inference for document Q&A.
 * Runs entirely in the browser — no server, no API calls.
 * Document text never leaves the browser tab.
 *
 * Primary: @mlc-ai/web-llm with Qwen2.5-1.5B-Instruct (WebGPU)
 *   - 1.5B parameters, 4096 token context window
 *   - ~1.1GB download, cached in browser after first load
 *   - 20-60 tokens/second on modern GPUs
 *   - Real language understanding — can synthesize, reason, explain
 *
 * Fallback: Ollama on localhost (if available)
 *
 * Previous approach (flan-t5-small + distilbert) was fundamentally inadequate:
 *   - 512 token limit, couldn't fit document context
 *   - Extracted text fragments instead of understanding
 *   - Repetition loops, hallucinated dates, echoed instructions
 */

export type InferenceBackend = 'browser' | 'ollama' | 'none'

let engine: any = null
let loadingPromise: Promise<void> | null = null
let webllmAvailable = true

// ─────────────────────────────────────────────────────────────────────────────
// WebGPU Detection
// ─────────────────────────────────────────────────────────────────────────────

async function hasWebGPU(): Promise<boolean> {
    try {
        if (typeof navigator === 'undefined') return false
        if (!('gpu' in navigator)) return false
        const gpu = (navigator as any).gpu
        if (!gpu) return false
        const adapter = await gpu.requestAdapter()
        return adapter !== null
    } catch {
        return false
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser LLM (web-llm with Qwen2.5-1.5B)
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

export async function loadBrowserLLM(
    onProgress?: (progress: number) => void
): Promise<void> {
    if (engine) return
    if (!webllmAvailable) return

    if (loadingPromise) {
        await loadingPromise
        return
    }

    loadingPromise = (async () => {
        // Check WebGPU support
        const gpuOk = await hasWebGPU()
        if (!gpuOk) {
            console.warn('[Custos] WebGPU not available — browser LLM disabled')
            webllmAvailable = false
            return
        }

        try {
            const webllm = await import('@mlc-ai/web-llm')

            engine = await webllm.CreateMLCEngine(MODEL_ID, {
                initProgressCallback: (report: { progress: number; text: string }) => {
                    console.log('[Custos] Loading:', report.text)
                    if (onProgress) {
                        onProgress(Math.round(report.progress * 100))
                    }
                },
            })

            console.log('[Custos] Browser LLM loaded:', MODEL_ID)
        } catch (e) {
            console.error('[Custos] Failed to load browser LLM:', e)
            webllmAvailable = false
            engine = null
        }
    })()

    await loadingPromise
}

export function isBrowserLLMLoaded(): boolean {
    return engine !== null
}

export function isWebGPUAvailable(): boolean {
    return webllmAvailable
}

async function generateWithBrowser(query: string, context: string): Promise<string> {
    if (!engine) throw new Error('Browser LLM not loaded')

    const response = await engine.chat.completions.create({
        messages: [
            {
                role: 'system',
                content: 'You are a document analyst. Answer questions based ONLY on the provided document context. Be clear, accurate, and concise. If the answer is not in the context, say so.'
            },
            {
                role: 'user',
                content: `Document context:\n${context}\n\n---\nQuestion: ${query}`
            }
        ],
        temperature: 0.1,
        max_tokens: 300,
    })

    return response.choices[0]?.message?.content?.trim() || 'No answer generated.'
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama (optional local upgrade)
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
                { role: 'system', content: 'You are a document analyst. Answer based ONLY on the provided document. Be concise and accurate.' },
                { role: 'user', content: `Document:\n${context}\n\nQuestion: ${query}` },
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
    if (trimmed.split(/\s+/).length > 5) return false
    return /^(hi|hello|hey|sup|yo|greetings|good morning|good evening|thanks|thank you|ok|okay)\b/i.test(trimmed)
}

function isMetaQuestion(query: string): string | null {
    const trimmed = query.trim().toLowerCase()
    if (/^(what can you do|help|how does this work|what is this)\??$/i.test(trimmed)) {
        return 'I can answer questions about this document. Ask me anything — "What is the deadline?", "Who is eligible?", "What are the submission requirements?", etc. Everything runs privately in your browser.'
    }
    return null
}

export async function runInference(
    query: string,
    context: string,
    ollamaModel: string | null
): Promise<{ answer: string; backend: InferenceBackend }> {
    if (isGreeting(query)) {
        return {
            answer: 'Hello! Ask me any question about this document and I\'ll find the answer.',
            backend: 'browser'
        }
    }

    const metaAnswer = isMetaQuestion(query)
    if (metaAnswer) return { answer: metaAnswer, backend: 'browser' }

    // Try Ollama first if available (potentially larger model)
    if (ollamaModel) {
        try {
            const answer = await generateWithOllama(ollamaModel, query, context)
            if (answer) return { answer, backend: 'ollama' }
        } catch {
            console.warn('[Custos] Ollama failed, using browser LLM')
        }
    }

    // Browser LLM (Qwen2.5-1.5B via WebGPU)
    if (engine) {
        const answer = await generateWithBrowser(query, context)
        return { answer, backend: 'browser' }
    }

    return {
        answer: 'AI models are still loading. Please wait a moment and try again.',
        backend: 'none'
    }
}
