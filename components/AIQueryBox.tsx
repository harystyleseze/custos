'use client'

import { useState, useEffect, KeyboardEvent } from 'react'
import { useWriteContract } from 'wagmi'
import { keccak256, toHex } from 'viem'
import { VAULT_ABI, VAULT_ADDRESS } from '@/lib/vault'
import { searchDocuments, indexDocument, loadEmbeddingModel, type DocumentChunk, isModelLoaded } from '@/lib/embeddings'
import { loadBrowserLLM, isBrowserLLMLoaded, detectOllama, runInference, type InferenceBackend } from '@/lib/browser-llm'

interface Message {
    role: 'user' | 'assistant'
    content: string
    backend?: InferenceBackend
}

interface Props {
    docId: `0x${string}`
    documentText: string
}

export default function AIQueryBox({ docId, documentText }: Props) {
    const { writeContractAsync } = useWriteContract()

    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [docIndex, setDocIndex] = useState<DocumentChunk[] | null>(null)
    const [indexing, setIndexing] = useState(false)

    // Model loading state
    const [embeddingReady, setEmbeddingReady] = useState(isModelLoaded())
    const [llmReady, setLlmReady] = useState(isBrowserLLMLoaded())
    const [loadingStage, setLoadingStage] = useState<'embeddings' | 'llm' | 'done'>('embeddings')
    const [loadProgress, setLoadProgress] = useState(0)
    const [ollamaModel, setOllamaModel] = useState<string | null>(null)

    // Load models on mount
    useEffect(() => {
        let cancelled = false

        async function init() {
            // Step 1: Load embedding model (~117MB, cached)
            if (!isModelLoaded()) {
                setLoadingStage('embeddings')
                try {
                    await loadEmbeddingModel((p) => !cancelled && setLoadProgress(p))
                    if (!cancelled) setEmbeddingReady(true)
                } catch (e) {
                    console.error('[Custos] Embedding model failed:', e)
                }
            } else {
                setEmbeddingReady(true)
            }

            // Step 2: Load browser LLM (~170MB, cached)
            if (!isBrowserLLMLoaded()) {
                if (!cancelled) {
                    setLoadingStage('llm')
                    setLoadProgress(0)
                }
                try {
                    await loadBrowserLLM((p) => !cancelled && setLoadProgress(p))
                    if (!cancelled) setLlmReady(true)
                } catch (e) {
                    console.error('[Custos] Browser LLM failed:', e)
                }
            } else {
                setLlmReady(true)
            }

            if (!cancelled) setLoadingStage('done')

            // Step 3: Check for Ollama (optional, better quality)
            const model = await detectOllama()
            if (!cancelled && model) {
                setOllamaModel(model)
                console.log('[Custos] Ollama detected:', model)
            }
        }

        init()
        return () => { cancelled = true }
    }, [])

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
            // Step 1: Semantic search (browser WASM)
            // Use top 1 result for browser LLM (350 char limit), top 5 for Ollama
            const index = await ensureIndexed()
            const results = await searchDocuments(query, index, 5)
            const context = results.length > 0
                ? results.map(r => r.chunk).join('\n')
                : documentText.slice(0, 400)

            // Step 2: On-chain audit log (non-blocking)
            const queryHash = keccak256(toHex(`${query}:${Date.now()}`))
            writeContractAsync({
                address: VAULT_ADDRESS,
                abi: VAULT_ABI,
                functionName: 'logQueryAuth',
                args: [docId, queryHash],
                gas: 5_000_000n,
            }).catch(() => console.warn('[Custos] Audit log failed (non-blocking)'))

            // Step 3: Inference (Ollama if available, otherwise browser LLM)
            const { answer, backend } = await runInference(query, context, ollamaModel)
            setMessages(prev => [...prev, { role: 'assistant', content: answer, backend }])
        } catch (e) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${e instanceof Error ? e.message : String(e)}`
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

    const isReady = embeddingReady && llmReady
    const isLoading = loadingStage !== 'done'

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600 }}>AI Document Q&A</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <span className={`badge ${isReady ? 'badge-green' : 'badge-dim'}`}>
                        {isReady ? (ollamaModel ? `${ollamaModel} (local)` : 'browser AI') : 'loading...'}
                    </span>
                    <span className="badge badge-purple">e5-small search</span>
                </div>
            </div>

            {/* Status */}
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                {isLoading ? (
                    <>
                        {loadingStage === 'embeddings' && `Loading search model... ${loadProgress > 0 ? `${loadProgress}%` : '(~117MB, cached after first load)'}`}
                        {loadingStage === 'llm' && `Loading AI models... ${loadProgress > 0 ? `${loadProgress}%` : '(~340MB total, cached after first load)'}`}
                    </>
                ) : isReady ? (
                    <>
                        All AI runs in your browser — document text never leaves this tab.
                        {ollamaModel && <span style={{ color: 'var(--accent)' }}> Ollama detected for enhanced quality.</span>}
                    </>
                ) : (
                    <>Failed to load AI models. Refresh to retry.</>
                )}
                {indexing && ' Indexing document...'}
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
                        <span style={{ fontSize: 12 }}>e.g. "What are the key terms?" · "Summarize section 2" · "What is the deadline?"</span>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        gap: 2,
                    }}>
                        <div style={{
                            maxWidth: '85%',
                            padding: '8px 12px',
                            borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                            background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
                            fontSize: 13,
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                        }}>
                            {msg.content}
                        </div>
                        {msg.backend && (
                            <span style={{ fontSize: 10, color: 'var(--text-dim)', padding: '0 4px' }}>
                                via {msg.backend === 'ollama' ? `Ollama (${ollamaModel})` : 'browser LLM'}
                            </span>
                        )}
                    </div>
                ))}
                {loading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ padding: '8px 12px', borderRadius: '12px 12px 12px 4px', background: 'var(--surface-2)', color: 'var(--text-dim)', fontSize: 13 }}>
                            ⏳ {ollamaModel ? `${ollamaModel} thinking...` : 'Browser AI thinking...'}
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
                    placeholder={isLoading ? 'Loading AI models...' : 'Ask a question about this document... (Enter to send)'}
                    rows={2}
                    disabled={loading || !isReady}
                    style={{ flex: 1, resize: 'none' }}
                />
                <button
                    className="btn-primary"
                    onClick={handleSend}
                    disabled={!input.trim() || loading || !isReady}
                    style={{ alignSelf: 'flex-end', padding: '8px 16px' }}
                >
                    Ask
                </button>
            </div>

            {/* Privacy note */}
            <div style={{ fontSize: 11, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                🔒 Zero-server AI: search (e5-small) + QA (distilbert) + generation (flan-t5) all run in your browser · Query hash logged as FHE audit on Sepolia
            </div>
        </div>
    )
}
