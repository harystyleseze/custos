# Custos — Wave Plan & Exit Criteria

> What we deliver each wave, how we measure success, and what comes next.
> Custos entered the buildathon at Wave 2.

---

## Pre-Buildathon: Research & Architecture Design

Before joining the buildathon, we completed foundational research:
- Problem analysis: ABA Formal Opinion 512 (Feb 2024) — 1.3M US lawyers cannot use public AI on confidential client matters
- Architecture design: 4-layer privacy model (AES + IPFS + FHE + Browser AI)
- Ecosystem deep dive: CoFHE FHE types, operations, @cofhe/sdk patterns
- Tech stack selection: browser-native LLM inference, multilingual-e5-small (browser WASM embeddings), Pinata IPFS
- Competitive analysis: identified that no existing product encrypts the access control metadata itself

---

## Wave 2: First Submission — Full Build (March 30 - April 6) ✅

### Delivered
- **Smart Contract:** DocumentVault.sol deployed and verified on Ethereum Sepolia
  - Contract: [0xDC756aaAb268610e157Fb11fe81c400E09b8eB8c](https://sepolia.etherscan.io/address/0xDC756aaAb268610e157Fb11fe81c400E09b8eB8c#code)
  - 5 core functions with FHE operations
  - 3 FHE types: `eaddress`, `euint64`, `ebool`
  - FHE arithmetic: `FHE.gt(expiry, block.timestamp)`
  - Correct permission model: `allowThis`, `allow`, `allowSender`
  - Side-channel resistance: `checkAccess` and `logQueryAuth` do not revert on non-existent documents

- **Test Suite:** 14 tests passing on CoFHE v0.4.x mock backend (~1s)
  - Registration (3 tests), Access grants (3), FHE access checks (3), Query audit (2), Read functions (3)

- **Frontend:** Next.js 14 with 3 pages, 4 components
  - Landing page with RainbowKit wallet connect (MetaMask, Coinbase, WalletConnect, etc.)
  - Dashboard with on-chain event indexing, system status indicators
  - Document viewer with FHE access check (real `decryptForView` with permit), AI Q&A, access management

- **Initial AI Layer:** Ollama-based local inference + e5-small WASM semantic search

- **SDK Migration:**
  - Migrated from cofhejs v0.3.x to @cofhe/sdk v0.4.x
  - Dropped @cofhe/react entirely — use @cofhe/sdk directly via `lib/cofhe-context.tsx`
  - Removed 7 unnecessary packages (MUI, emotion, recharts) — dashboard bundle 600KB → 279KB
  - Added RainbowKit for proper wallet UX
  - Added 5M gas limit on all FHE transactions (precompile not in eth_estimateGas)

### Exit Criteria
- [x] Contract deployed and verified on Sepolia (v2: with side-channel resistance)
- [x] All 14 tests passing
- [x] Frontend builds (`pnpm next build` succeeds)
- [x] End-to-end flow works: upload → encrypt → IPFS → FHE register → grant → checkAccess
- [x] No deprecated packages (`cofhejs`, `@cofhe/react`) in codebase
- [x] RainbowKit wallet modal working
- [x] Real `decryptForView` with permit for access check (with fallback for mock)

---

## Wave 3: Browser LLM + AI Pipeline Hardening (April 8 - May 8) — IN PROGRESS

### Goals
- Eliminate server dependency for AI (no Ollama required)
- Fix chunking quality for accurate document Q&A
- Support multiple document formats
- Polish UX for demo readiness

### Completed ✅

**1. Browser-Native LLM — Qwen2.5-1.5B via WebGPU**
- Replaced Ollama/phi-4-mini dependency with `@mlc-ai/web-llm` v0.2.82
- Model: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (1.5B parameters, 4096 token context)
- Runs entirely in browser via WebGPU — no server, no API calls, no local installation
- ~1.1GB download, cached in browser storage after first load
- 20-60 tokens/second on modern GPUs
- OpenAI-compatible chat completions API
- Ollama auto-detected as optional fallback for enhanced quality
- Previous approach (flan-t5-small 80MB + distilbert 260MB) was fundamentally inadequate: 512 token limit, repetition loops, hallucinated answers, fragment extraction instead of understanding

**2. Structure-Aware Adaptive Chunking**
- Replaced fixed 400-char character-based splitting with 3-tier cascade:
  - Paragraph boundaries (`\n\n`) → sentence boundaries (`. ` + uppercase) → word boundaries
- Heading detection: markdown `#`, ALL-CAPS, title-case, colon-terminated labels
- Each chunk carries section heading metadata and document position index
- Embedding text includes heading prefix for better semantic matching: `"passage: Eligibility Requirements: You must be between 18 and 35 years old"`
- Target chunk size: ~300 characters (down from 400)

**3. Improved Semantic Search**
- Similarity threshold raised from 0.5 to 0.6 (reduces noise)
- TopK reduced from 5 to 3 (prevents context overflow)
- SearchResult now includes `chunkIndex`, `heading`, `position` metadata
- New `assembleContext()` function: top chunk + adjacent chunks, sorted by document position, heading prefix, 3000-char budget

**4. Multi-Format Document Rendering**
- File type detection via magic bytes (PDF, PNG, JPEG, GIF, ZIP/DOCX)
- Text files: inline monospace preview
- PDF files: embedded iframe viewer
- Images: inline `<img>` display
- Binary/unknown: download button
- All formats: download decrypted file button

**5. UX Fixes**
- MetaMask popup removed from per-query audit logging (was interrupting every question)
- Audit log capability preserved in code for batch mode in production
- RPC switched from thirdweb (rate-limited, CORS issues) to publicnode
- CID storage fix: full IPFS CID saved to localStorage (bytes32 truncation bug fixed)
- AES key storage fix: removed `toHex()` double-encoding bug
- Step-by-step progress messages during document decryption
- Detailed console logging for debugging

### Remaining Work

**6. UI/UX Polish (Priority: High)**
- Loading states for all async operations with progress indicators
- Responsive design for mobile browsers
- Display real document names from upload metadata
- Show access grant history per document
- Improve document list card design

**7. Browser LLM Download Optimization (Priority: High)**
- Progressive model loading with visual progress bar
- Web Worker inference to prevent UI blocking during generation
- Model preloading option on dashboard (before user opens document)
- Investigate smaller quantization options (q4f32 vs q4f16) for faster initial load

**8. Conversation Memory (Priority: Medium)**
- Pass last 3 Q&A pairs to LLM alongside new context
- Enables follow-up questions: "What's the deadline?" → "And what happens if I miss it?"
- Message history stored in component state per document session

**9. ECDH Key Re-encryption (Priority: Medium)**
- Replace signature-derived key sharing with proper ECDH
- Grantee decrypts documents using their own wallet
- Full multi-user document sharing flow

### Exit Criteria
- [x] AI works without Ollama (browser-only via WebGPU)
- [x] Chunking splits on paragraphs/sentences (not mid-word)
- [x] Multi-format document rendering (text, PDF, images)
- [x] No MetaMask popup per AI query
- [ ] Conversation memory works (follow-up questions maintain context)
- [ ] UI polish: responsive design, loading states, document names
- [ ] LLM download shows progress bar with percentage
- [ ] Demo runs without errors for 3 consecutive attempts

---

## Wave 4: Multi-Format AI + Ecosystem Depth (May 11-20)

### Goals
- AI Q&A works on PDF and DOCX content (not just text files)
- Search across multiple documents
- Persistent vector store
- Advanced FHE features

### Planned Work

**1. PDF Text Extraction (Priority: High)**
- Extract text content from PDF files for AI Q&A (currently PDFs render but AI only sees raw bytes)
- Use `pdf.js` or `pdfjs-dist` to extract text layers from decrypted PDFs
- Structured extraction preserving headings, paragraphs, tables
- Feed extracted text through the existing chunking → embedding → search pipeline

**2. DOCX/DOC Parsing (Priority: High)**
- Parse Word documents using `mammoth.js` (DOCX → HTML → text)
- Extract structured content preserving headings, lists, tables
- Support .doc format via basic text extraction
- Enable AI Q&A on uploaded Word documents

**3. Multi-Document Search (Priority: High)**
- Store embeddings per-document in IndexedDB
- Search across ALL user's documents from a single query
- Use case: lawyer has NDA + MSA + SOW — asks "Do the payment terms conflict?"
- Rank results by document + chunk relevance
- Display which document each answer comes from

**4. IndexedDB Vector Persistence (Priority: Medium)**
- Store document embeddings in IndexedDB keyed by docId
- On document open: check IndexedDB first → skip re-embedding if cached
- Current: embeddings stored in React state, lost on page refresh
- Fix: `indexDocument()` writes to IndexedDB; `ensureIndexed()` reads from IndexedDB first

**5. FHE.select() for Conditional Logic (Priority: Medium)**
- Add `FHE.select()` to contract for zero-information conditional routing
- Example: `FHE.select(docExists, computedResult, defaultFalse)` — observer can't distinguish which branch executed
- Demonstrates advanced FHE pattern beyond basic access control

**6. Encrypted Analytics (Priority: Low)**
- On-chain aggregate statistics using FHE
- "How many documents have been accessed this month?" — computed on encrypted data
- Uses `FHE.add()` to accumulate encrypted counters

### Exit Criteria
- [ ] AI Q&A works on PDF documents (text extracted, chunked, searchable)
- [ ] AI Q&A works on DOCX documents
- [ ] Multi-document search works across 3+ documents
- [ ] Vector embeddings persist in IndexedDB (no re-computation on page refresh)
- [ ] At least one advanced FHE feature (FHE.select or encrypted analytics)
- [ ] Documentation updated with new features

---

## Wave 5: Production + Demo Day (May 23 - June 1)

### Goals
- Production-quality demo showcasing the full AI + privacy pipeline
- Performance optimizations for smooth UX
- Compliance features for enterprise adoption
- Clear path to mainnet

### Planned Work

**1. Streaming AI Responses (Priority: High)**
- Stream tokens from Qwen2.5-1.5B as they're generated (real-time display)
- Currently waits for full response before displaying
- Use web-llm's streaming API: `engine.chat.completions.create({ stream: true })`

**2. Web Worker Inference (Priority: High)**
- Move LLM inference to a Web Worker (non-blocking main thread)
- Prevents UI freezing during model loading and token generation
- Keeps the chat input responsive while the model thinks

**3. Compliance Export (Priority: High)**
- Generate cryptographic proof of access audit logs
- "Prove all AI queries were authorized without revealing query content"
- Export as verifiable JSON report for auditors
- Leverages `logQueryAuth` FHE-encrypted audit trail on-chain

**4. Cross-Encoder Reranker (Priority: Medium)**
- ~30MB MiniLM ONNX model for search result reranking
- Re-scores top-3 chunks with cross-attention (more accurate than bi-encoder cosine similarity)
- Improves answer accuracy for ambiguous queries

**5. Demo Video & Presentation (Priority: High)**
- 5-minute narrated walkthrough showing full pipeline:
  - Upload → encrypt → IPFS → FHE register
  - Grant access → FHE-encrypted expiry → checkAccess → decrypt
  - AI query → e5-small search → Qwen2.5 answer (browser WebGPU)
  - Multi-format rendering (text, PDF, images)
  - Multi-document search (Wave 4 feature)
  - Compliance export
- Show Etherscan transactions in real-time
- Highlight the "impossible without FHE" moment

**6. Mainnet Readiness Assessment (Priority: Medium)**
- Gas cost analysis for all operations
- Security review of FHE permission model
- Performance benchmarks (embedding speed, search latency, inference time)
- Storage cost analysis (IPFS + on-chain per document)

### Exit Criteria
- [ ] Streaming AI responses (tokens appear as generated)
- [ ] Web Worker inference (UI never freezes)
- [ ] Compliance export feature working
- [ ] Demo video produced and published (5 min, narrated)
- [ ] Gas cost documentation complete
- [ ] Mainnet deployment plan documented
- [ ] Full documentation updated (README, ARCHITECTURE, PRODUCT, WAVES)

---

## Beyond Buildathon

- Enterprise pilot with a mid-market law firm
- Advanced document format support: spreadsheets (XLSX), presentations (PPTX), scanned documents (OCR)
- Larger browser LLM options as WebGPU matures (Qwen2.5-7B, Llama 3.2)
- Cross-chain deployment (Arbitrum, Base)
- WASM LLM fallback for browsers without WebGPU (via wllama + GGUF)
- SOC 2 Type I certification pathway
- Mainnet deployment with optimized gas costs
