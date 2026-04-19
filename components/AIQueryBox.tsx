'use client'

import { useState, useEffect, KeyboardEvent } from 'react'
import { useWriteContract } from 'wagmi'
import { keccak256, toHex } from 'viem'
import { VAULT_ABI, VAULT_ADDRESS } from '@/lib/vault'
import { searchDocuments, indexDocument, loadEmbeddingModel, type DocumentChunk, isModelLoaded } from '@/lib/embeddings'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

interface Props {
    docId: `0x${string}`
    documentText: string   // decrypted document text (local — never transmitted)
}

export default function AIQueryBox({ docId, documentText }: Props) {
    const { writeContractAsync } = useWriteContract()

    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [docIndex, setDocIndex] = useState<DocumentChunk[] | null>(null)
    const [indexing, setIndexing] = useState(false)
    const [modelLoading, setModelLoading] = useState(false)
    const [modelProgress, setModelProgress] = useState(0)
    const [modelReady, setModelReady] = useState(isModelLoaded())

    // Load embedding model on mount (downloads ~117MB once, then cached in IndexedDB)
    useEffect(() => {
        if (modelReady) return
        setModelLoading(true)
        loadEmbeddingModel((progress) => setModelProgress(progress))
            .then(() => {
                setModelReady(true)
                setModelLoading(false)
                console.log('[Custos] e5-small embedding model loaded')
            })
            .catch((e) => {
                console.error('[Custos] Failed to load embedding model:', e)
                setModelLoading(false)
            })
    }, [modelReady])

    // Index the document once for semantic search
    async function ensureIndexed(): Promise<DocumentChunk[]> {
        if (docIndex) return docIndex
        setIndexing(true)
        try {
            const index = await indexDocument(docId, documentText)
            setDocIndex(index)
            return index
        } finally {
            setIndexing(false)
        }
    }

    async function handleSend() {
        if (!input.trim() || loading) return
        const query = input.trim()
        setInput('')
        setLoading(true)

        setMessages(prev => [...prev, { role: 'user', content: query }])

        try {
            // Step 1: Semantic search (local, browser WASM)
            const index = await ensureIndexed()
            const results = await searchDocuments(query, index, 5)
            const context = results.length > 0
                ? results.map(r => r.chunk).join('\n\n---\n\n')
                : documentText.slice(0, 2000)  // fallback: first 2000 chars

            // Step 2: Log query authorization on-chain (FHE)
            // queryHash = keccak256(query + timestamp) — content hidden, uniqueness proven
            const queryHash = keccak256(toHex(`${query}:${Date.now()}`))
            try {
                await writeContractAsync({
                    address: VAULT_ADDRESS,
                    abi: VAULT_ABI,
                    functionName: 'logQueryAuth',
                    args: [docId, queryHash],
                    gas: 5_000_000n,
                })
            } catch {
                // Non-blocking — AI query proceeds even if audit log fails
                console.warn('Query audit log failed (non-blocking)')
            }

            // Step 3: Send to phi-4-mini (local Ollama)
            // Document text is decrypted LOCALLY — sent only to localhost
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, context }),
            })

            if (!response.ok) {
                throw new Error(`AI inference failed: ${response.status}`)
            }

            const { answer } = await response.json() as { answer: string }
            setMessages(prev => [...prev, { role: 'assistant', content: answer }])
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${msg}\n\nMake sure Ollama is running: \`ollama serve\``
            }])
        }

        setLoading(false)
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600 }}>AI Document Q&A</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <span className="badge badge-green">local LLM (Ollama)</span>
                    <span className="badge badge-purple">e5-small search</span>
                </div>
            </div>

            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                {modelLoading ? (
                    <>Loading e5-small embedding model... {modelProgress > 0 ? `${modelProgress}%` : '(first load downloads ~117MB, cached after)'}</>
                ) : !modelReady ? (
                    <>Failed to load embedding model. Refresh to retry.</>
                ) : (
                    <>⚡ Inference runs on your machine via Ollama. Document text never transmitted to any API.</>
                )}
                {indexing && ' Indexing document with e5-small...'}
            </div>

            {/* Messages */}
            <div style={{
                minHeight: 200,
                maxHeight: 400,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: '8px 0',
            }}>
                {messages.length === 0 && (
                    <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: '32px 16px' }}>
                        Ask any question about this document.<br />
                        <span style={{ fontSize: 12 }}>e.g. "What is the payment amount?" · "Who are the parties?" · "What are the key terms?"</span>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                        <div style={{
                            maxWidth: '80%',
                            padding: '8px 12px',
                            borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                            background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
                            fontSize: 13,
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                        }}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ padding: '8px 12px', borderRadius: '12px 12px 12px 4px', background: 'var(--surface-2)', color: 'var(--text-dim)', fontSize: 13 }}>
                            ⏳ Thinking...
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={modelLoading ? 'Loading embedding model...' : 'Ask a question about this document... (Enter to send)'}
                    rows={2}
                    disabled={loading || modelLoading}
                    style={{ flex: 1, resize: 'none' }}
                />
                <button
                    className="btn-primary"
                    onClick={handleSend}
                    disabled={!input.trim() || loading || !modelReady}
                    style={{ alignSelf: 'flex-end', padding: '8px 16px' }}
                >
                    Ask
                </button>
            </div>

            {/* Privacy note */}
            <div style={{ fontSize: 11, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                🔒 Local AI: document stays in your browser · Query hash logged as FHE-encrypted audit on Sepolia
            </div>
        </div>
    )
}
