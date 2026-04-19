/**
 * phi-4-mini inference endpoint via local Ollama.
 *
 * Document context arrives from the client AFTER being:
 * 1. Decrypted locally in browser (AES-256-GCM)
 * 2. Semantically filtered by e5-small (top relevant chunks only)
 *
 * This endpoint calls localhost:11434 — inference never goes to external APIs.
 * No document content is logged or stored.
 */

import { NextRequest, NextResponse } from 'next/server'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b'

interface RequestBody {
    query: string
    context: string   // top-k relevant document chunks from e5-small search
}

export async function POST(req: NextRequest) {
    let body: RequestBody
    try {
        body = await req.json() as RequestBody
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { query, context } = body
    if (!query || !context) {
        return NextResponse.json({ error: 'query and context required' }, { status: 400 })
    }

    // Limit context to prevent token overflow
    const trimmedContext = context.slice(0, 4000)

    const systemPrompt = `You are a precise document analyst.
Answer questions based ONLY on the provided document excerpt.
If the answer is not in the document, say "I cannot find that in the document."
Be concise and accurate. Quote relevant passages when helpful.`

    const userMessage = `Document excerpt:\n\`\`\`\n${trimmedContext}\n\`\`\`\n\nQuestion: ${query}`

    try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                stream: false,
                options: {
                    temperature: 0.1,    // low temp for factual document Q&A
                    num_predict: 512,    // keep responses concise
                },
            }),
        })

        if (!response.ok) {
            const err = await response.text()
            throw new Error(`Ollama error ${response.status}: ${err}`)
        }

        const result = await response.json() as {
            message?: { content: string }
            error?: string
        }

        if (result.error) throw new Error(result.error)
        if (!result.message?.content) throw new Error('Empty response from model')

        return NextResponse.json({ answer: result.message.content })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)

        // Friendly error for "Ollama not running" case
        if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
            return NextResponse.json({
                error: 'Ollama not running',
                hint: 'Start Ollama: `ollama serve` then `ollama pull phi4-mini`'
            }, { status: 503 })
        }

        return NextResponse.json({ error: message }, { status: 500 })
    }
}
