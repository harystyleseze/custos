# Custos — Wave Plan & Exit Criteria

> What we deliver each wave, how we measure success, and what comes next.
> Custos entered the buildathon at Wave 2.

---

## Pre-Buildathon: Research & Architecture Design

Before joining the buildathon, we completed foundational research:
- Problem analysis: ABA Formal Opinion 512 (Feb 2024) — 1.3M US lawyers cannot use public AI on confidential client matters
- Architecture design: 4-layer privacy model (AES + IPFS + FHE + Local AI)
- Ecosystem deep dive: CoFHE FHE types, operations, @cofhe/sdk patterns
- Tech stack selection: phi-4-mini (local LLM), multilingual-e5-small (browser WASM embeddings), Pinata IPFS
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

- **AI Layer:** phi-4-mini local inference + e5-small WASM semantic search

- **SDK Migration:** 
  - Migrated from cofhejs v0.3.x to @cofhe/sdk v0.4.x
  - Dropped @cofhe/react entirely — use @cofhe/sdk directly via `lib/cofhe-context.tsx`
  - Removed 7 unnecessary packages (MUI, emotion, recharts) — dashboard bundle 600KB → 279KB
  - Added RainbowKit for proper wallet UX
  - Added 5M gas limit on all FHE transactions (precompile not in eth_estimateGas)

### Exit Criteria
- [x] Contract deployed and verified on Sepolia (v2: with side-channel resistance)
- [x] All 14 tests passing
- [x] Frontend builds (`pnpm next build` succeeds) — no `ignoreBuildErrors` workaround needed
- [x] End-to-end flow works: upload → encrypt → IPFS → FHE register → grant → checkAccess
- [x] No placeholder/dummy data in contract interactions
- [x] Document list persists via on-chain event queries
- [x] No deprecated packages (`cofhejs`, `@cofhe/react`) in codebase
- [x] RainbowKit wallet modal working
- [x] System status indicators (wallet, network, contract, documents)
- [x] Real `decryptForView` with permit for access check (with fallback for mock)

---

## Wave 3: AI Pipeline + Production Hardening (April 8 - May 8)

### Goals
- Fix AI pipeline gaps (memory, persistence, chunking)
- Eliminate remaining placeholders (ECDH key re-encryption)
- Add ReineiraOS ecosystem integration
- Make the demo bulletproof for judges

### Planned Work

**1. Persistent Vector Store (High Priority — AI)**
- Store document embeddings in IndexedDB keyed by docId
- On document open: check IndexedDB first → skip re-embedding if cached
- Current problem: embeddings stored in React state, lost on page refresh, re-computed every time (~6s for 30 chunks)
- Fix: `indexDocument()` writes to IndexedDB; `ensureIndexed()` reads from IndexedDB first

**2. Conversation Memory (High Priority — AI)**
- Pass previous Q&A messages to phi-4-mini alongside context chunks
- Current problem: each question is independent — "What's the payment?" → "When is it due?" loses context ("it" = payment)
- Fix: include last 3 Q&A pairs in Ollama `messages[]` array
- Keeps conversation grounded while maintaining context window budget

**3. Paragraph-Aware Chunking (Medium Priority — AI)**
- Current: fixed 400-char split (can break mid-sentence, mid-word)
- Fix: split on `\n\n` (paragraph) first, then `. ` (sentence), then char count as fallback
- Preserves semantic units — "The payment amount is $50,000" stays in one chunk

**4. ECDH Key Re-encryption (High Priority — Crypto)**
- Replace signature-derived key sharing with proper ECDH
- Grantee can decrypt documents using their own wallet
- Full multi-user document sharing flow working end-to-end

**5. ReineiraOS Integration (High Priority — Ecosystem)**
- Implement `IConditionResolver` for paid document access
- "Pay 10 USDC to access this document for 30 days"
- Escrow holds payment, releases when FHE access check passes
- Shows ecosystem depth (Fhenix + Privara working together)

**6. UI/UX Polish**
- Loading states for all async operations
- Error recovery with retry buttons
- Responsive design for mobile
- Display real document names from upload metadata
- Show access grant history per document

### Exit Criteria
- [ ] Embeddings persisted in IndexedDB (no re-computation on page refresh)
- [ ] Conversation memory works (follow-up questions maintain context)
- [ ] Chunking splits on paragraphs/sentences (not mid-word)
- [ ] Grantee can decrypt documents from their own wallet
- [ ] IConditionResolver deployed and verified
- [ ] Demo runs without errors for 3 consecutive attempts

---

## Wave 4: Multi-Document AI + Ecosystem Depth (May 11-20)

### Goals
- Multi-document search across all user's documents
- Advanced FHE features
- Cross-chain deployment

### Planned Work

**1. Multi-Document Search (High Priority — AI)**
- Store embeddings per-document in IndexedDB
- Search across ALL user's documents from a single query
- Use case: lawyer has NDA + MSA + SOW — asks "Do the payment terms conflict?"
- Rank results by document + chunk relevance
- Display which document each answer comes from

**2. FHE.select() for Conditional Logic (Medium Priority — Contract)**
- Add `FHE.select()` to contract for zero-information conditional routing
- Example: `return FHE.select(docExists, computedResult, defaultFalse)` — observer can't distinguish which branch executed
- Demonstrates advanced FHE pattern (used by BATNA, Blank, OBSCURA in this buildathon)

**3. Multi-Party Threshold Decryption**
- Explore requiring N-of-M signatures to decrypt a document
- Use case: corporate board documents requiring quorum

**4. Encrypted Analytics**
- On-chain aggregate statistics using FHE
- "How many documents have been accessed this month?" — computed on encrypted data
- Uses `FHE.add()` to accumulate encrypted counters

**5. Cross-Chain Deployment**
- Deploy DocumentVault on Arbitrum Sepolia and Base Sepolia
- Same contract, different networks — demonstrates portability

### Exit Criteria
- [ ] Multi-document search works across 3+ documents
- [ ] At least one advanced FHE feature beyond access control (FHE.select or encrypted analytics)
- [ ] Cross-chain deployment on 2+ testnets
- [ ] Documentation updated with new features

---

## Wave 5: Demo Day + Production Readiness (May 23 - June 1)

### Goals
- Production-quality demo showcasing the full AI + privacy pipeline
- Clear path to mainnet
- Compliance features for enterprise adoption

### Planned Work

**1. Compliance Export (High Priority — Enterprise)**
- Generate cryptographic proof of access audit logs
- "Prove all AI queries were authorized without revealing query content"
- Export as verifiable PDF/JSON report for auditors
- Leverages `logQueryAuth` FHE-encrypted audit trail already on-chain

**2. AI Pipeline Hardening**
- Cross-encoder reranker (~30MB MiniLM ONNX) for search accuracy
- Query suggestion / auto-complete based on document structure
- Streaming responses from phi-4-mini (real-time token display)
- Graceful Ollama fallback: "AI unavailable" mode with semantic search still working

**3. Demo Video & Presentation**
- 5-minute narrated walkthrough showing full pipeline:
  - Upload → encrypt → IPFS → FHE register
  - Grant access → FHE-encrypted expiry → checkAccess → decrypt
  - AI query → e5-small search → phi-4-mini answer → on-chain audit
  - Multi-document search (Wave 4 feature)
  - Compliance export
- Show Etherscan transactions in real-time
- Highlight the "impossible without FHE" moment

**4. Mainnet Readiness Assessment**
- Gas cost analysis for all operations
- Security review of FHE permission model
- Performance benchmarks (embedding speed, search latency, inference time)
- Storage cost analysis (IPFS + on-chain per document)

### Exit Criteria
- [ ] Demo video produced and published (5 min, narrated)
- [ ] Compliance export feature working
- [ ] Streaming AI responses
- [ ] Gas cost documentation complete
- [ ] Mainnet deployment plan documented
- [ ] Full documentation updated (README, ARCHITECTURE, PRODUCT, WAVES)
