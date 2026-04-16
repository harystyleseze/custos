# Custos — Product Document

> The first AI document tool where even WHO has access is encrypted on-chain.
> Built on Fhenix CoFHE. Entered the Privacy-by-Design dApp Buildathon at Wave 2.

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Who Hurts](#who-hurts)
3. [Why Every Current Solution Fails](#why-every-current-solution-fails)
4. [What Custos Does](#what-custos-does)
5. [Why FHE Is the Only Answer](#why-fhe-is-the-only-answer)
6. [How the 4-Layer Privacy Model Works](#how-the-4-layer-privacy-model-works)
7. [How the AI Pipeline Works](#how-the-ai-pipeline-works)
8. [The On-Chain Audit Trail](#the-on-chain-audit-trail)
9. [Competitive Positioning](#competitive-positioning)
10. [Market Opportunity](#market-opportunity)
11. [Product Principles](#product-principles)
12. [Current State & Honest Limitations](#current-state--honest-limitations)
13. [Roadmap](#roadmap)

---

## The Problem

**Professionals with confidentiality obligations cannot use AI on their most important documents.**

Every document AI tool today requires sending document content to a third-party server. For lawyers, doctors, and financial advisors, this isn't a preference issue — it's a **legal prohibition**.

But the problem goes deeper than file content. Even if you encrypt the files, standard blockchains expose the **access control metadata**: who shared what with whom, when access was granted, and whether it's still active. On a transparent chain, if "wallet 0xLawFirm granted wallet 0xAcquirer access to document 0xDealTerms," that reveals an M&A relationship — a trading signal worth millions.

**Three layers of leakage in current tools:**

```
Layer 1: FILE CONTENT
  → ChatGPT, Notion AI, Box Shield all see your plaintext
  → AI providers may use your data for training
  → Law enforcement can subpoena cloud data

Layer 2: ACCESS METADATA  
  → Transparent blockchains show who shares what with whom
  → mapping(address => bool) is readable by anyone
  → Business relationships are visible on Etherscan

Layer 3: AI QUERY LOGS
  → API providers log what questions were asked about which documents
  → "What are the termination clauses?" reveals due diligence activity
  → Query patterns can signal deal timing
```

**Custos eliminates all three layers of leakage. Not through privacy policies — through architecture.**

---

## Who Hurts

### Lawyers — The Acute Crisis

**1.3 million US lawyers** are directly affected by ABA Formal Opinion 512 (February 2024).

The ABA explicitly warns: using public AI tools on confidential client matters without understanding data handling violates the Model Rules of Professional Conduct. This isn't guidance — it's an ethics obligation.

The practical impact:
- Attorney-client privilege is **waived** the moment document content reaches a third-party server. Uploading a client's merger agreement to ChatGPT = waiving privilege over that agreement.
- Legal document review costs **$1,000–$10,000 per hour** when done manually
- AI could reduce review time by **70–80%**, but lawyers can't use it safely
- **M&A deals have failed** when confidential documents were exposed during due diligence. The access pattern itself — who is reviewing what — is a trading signal
- The lawyer's malpractice insurer won't cover losses from unauthorized AI disclosure

**The impossible choice:** Do 40-hour manual document reviews (at $500/hour), or risk your license by using AI that leaks.

### Healthcare Professionals — HIPAA at Stake

- **HIPAA Technical Safeguards** prohibit sending protected health information (PHI) to AI APIs without a Business Associate Agreement (BAA)
- OpenAI's BAA is only available on enterprise tier ($$$) — and even then, the data still reaches OpenAI's servers
- Fine exposure: **$100–$50,000 per violation**, $1.9M annual cap per violation category
- A single patient record uploaded to a cloud AI = potential HIPAA violation
- Doctors need AI for diagnostic support, research synthesis, and clinical documentation — but can't risk patient data

### Finance Teams — Insider Trading Risk

- M&A advisors handle deal documents under strict NDAs and information barriers
- Sharing confidential deal terms with an AI provider = transmitting material non-public information (MNPI)
- SEC Rule 10b-5: using MNPI for trading decisions is a federal crime
- Even the **access pattern** is sensitive — if it's visible that Law Firm X is reviewing documents for Company Y, that signals a deal
- Investment banks spend **$17.4M per year** on insider threat mitigation (Ponemon Institute)

---

## Why Every Current Solution Fails

| Solution | File Content | Access Metadata | AI Queries | Why It Fails |
|---|---|---|---|---|
| **ChatGPT / Claude / Gemini** | Exposed to AI provider | N/A | Logged by provider | Plaintext sent to third party; may train on your data |
| **Google Docs / Dropbox** | Exposed to cloud provider | Exposed to provider | N/A (no AI) | Provider has everything; warranted by law enforcement |
| **Self-hosted LLMs** | Local (safe) | No sharing mechanism | Local (safe) | No multi-party document sharing; no audit trail; expensive compute |
| **Lit Protocol** | Client-side encrypted | **Conditions are public** | No AI | Access conditions visible on-chain; no computation on encrypted data |
| **Standard blockchain DApps** | Can be encrypted | **Fully public** | No AI | `mapping(address => bool)` readable by anyone on Etherscan |
| **Box Shield / Virtru** | Server-side encrypted | Centralized logs | Cloud AI (exposed) | Company holds keys; single point of trust failure |
| **Custos** | **AES-256-GCM (browser)** | **FHE encrypted** | **Local only** | **Architecture prevents leakage — not policy** |

**The critical gap:** Every solution except Custos exposes either file content, access metadata, or AI query logs. Lit Protocol and standard DApps come closest on file encryption — but their access control is transparent. The WHO-shared-WHAT-with-WHOM is visible. **This is the gap that FHE fills.**

---

## What Custos Does

Custos is a document intelligence platform with four properties that don't exist together in any other product:

1. **Encrypted document storage** — Files AES-256-GCM encrypted in the browser before any upload. Pinata IPFS stores only ciphertext. No server ever sees plaintext.

2. **FHE-encrypted access control** — Document ownership (`eaddress`), access expiry (`euint64`), and access check results (`ebool`) are all stored as ciphertexts on Ethereum Sepolia via Fhenix CoFHE. The blockchain cannot answer "who owns document X?" or "does wallet Y have access?" without FHE decryption by the authorized party.

3. **Local AI analysis** — phi-4-mini (3.8B parameters) runs on the user's machine via Ollama. Semantic search uses multilingual-e5-small running as WebAssembly in the browser. No document content ever reaches an external API.

4. **Encrypted audit trail** — Every AI query produces an on-chain keccak256 hash + an FHE-encrypted boolean proving the query was authorized at query time. Auditors can verify compliance without reading query content or document text.

### The User Experience

```
Upload:   Select file → browser encrypts → IPFS stores ciphertext → FHE registers on-chain
Share:    Enter address + expiry → FHE encrypts expiry → grantee gets time-bounded access
Query:    Ask a question → browser searches semantically → local LLM answers → audit hash on-chain
Revoke:   Click revoke → expiry overwritten with encrypted zero → access permanently denied
```

The user sees: upload, share, ask questions, revoke. They don't see: AES encryption, FHE operations, IPFS storage, wallet key wrapping, vector embeddings, cosine similarity, on-chain audit transactions. **The complexity is invisible.**

---

## Why FHE Is the Only Answer

This is not a "nice to have FHE" project. **The core functionality is impossible without FHE.**

### What FHE does that nothing else can:

```
Standard encryption:
  Encrypt → Store → DECRYPT → Compute → Result
  ↑ You must decrypt before computing. The system sees plaintext.

FHE:
  Encrypt → Store → Compute on ciphertext → Encrypted result → Decrypt
  ↑ Computation happens WITHOUT decryption. The system NEVER sees plaintext.
```

### Applied to Custos:

**The access check `FHE.gt(expiry, now)`:**
1. `expiry` is stored as `euint64` — an encrypted 64-bit timestamp. Nobody knows the value.
2. `block.timestamp` is wrapped as `euint64` via `FHE.asEuint64()`.
3. `FHE.gt(expiry, now)` compares two encrypted values **without decrypting either one**.
4. The result is an `ebool` — an encrypted boolean. Nobody knows if it's true or false.
5. `FHE.allowSender(isActive)` grants ONLY the requester permission to decrypt their own result.
6. The requester decrypts locally via the CoFHE SDK with a signed permit.

**Result:** The blockchain performed a computation (is access still valid?) without ever seeing the inputs (when does access expire?) or the output (yes or no?). Only the requester knows their own access status.

### Why alternatives don't work:

| Technology | Can it encrypt data? | Can it compute on encrypted data? | Can it produce new encrypted results? |
|---|---|---|---|
| **AES / Standard encryption** | Yes | No — must decrypt first | No |
| **ZK-proofs** | N/A | Can prove statements | No — proves existing facts, can't compute new values |
| **Commit-reveal** | Temporarily | No | No — reveals at reveal phase |
| **TEE (Trusted Execution)** | Inside enclave | Inside enclave (trusted hardware) | Yes — but requires trusting hardware manufacturer |
| **FHE (Fhenix)** | Yes | **Yes — on ciphertext directly** | **Yes — result is encrypted** |

ZK-proofs can prove "I have access" but **cannot compute** "is access still valid?" on two encrypted timestamps. There is no ZK equivalent to `FHE.gt(expiry, now)`. Commit-reveal leaks at the reveal phase. TEE requires trusting Intel/AMD hardware. **FHE is the only technology that enables this.**

---

## How the 4-Layer Privacy Model Works

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 1: FILE CONTENT — AES-256-GCM (Browser)                   │
│  File encrypted in browser before upload. Pinata IPFS stores     │
│  only ciphertext. AES key wrapped with wallet signature.         │
│  → Pinata sees: random bytes. Knows: nothing.                    │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 2: ACCESS CONTROL — Fhenix CoFHE (Ethereum Sepolia)       │
│  Owner identity: eaddress (encrypted). Expiry: euint64           │
│  (encrypted). Access result: ebool (encrypted).                  │
│  → Blockchain sees: ciphertext hashes. Knows: nothing.           │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 3: AI ANALYSIS — Local Inference (Browser + Ollama)        │
│  e5-small embeddings computed in browser WASM (never transmitted).│
│  phi-4-mini runs on localhost via Ollama (never transmitted).     │
│  → External servers see: nothing. Document stays local.          │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 4: AUDIT TRAIL — FHE-Encrypted On-Chain Proof              │
│  keccak256(query + timestamp) stored on-chain.                    │
│  FHE-encrypted ebool proves query was authorized at query time.  │
│  → Auditors see: proof exists. Content: hidden.                  │
└──────────────────────────────────────────────────────────────────┘
```

### What each party sees:

| Party | File Content | Who Has Access | When Access Expires | AI Queries | Authorization |
|---|---|---|---|---|---|
| **Pinata (IPFS)** | AES ciphertext | Nothing | Nothing | Nothing | Nothing |
| **Ethereum validators** | Nothing | eaddress cipher | euint64 cipher | Hash only | ebool cipher |
| **Other wallets** | Nothing | eaddress cipher | euint64 cipher | Hash only | ebool cipher |
| **Ollama (local AI)** | Plaintext (local only) | Nothing | Nothing | Plaintext (local) | Nothing |
| **Document owner** | Plaintext (after decrypt) | Their own identity | Their own grants | Their own queries | Their own results |
| **Grantee** | Plaintext (if granted) | Nothing about others | Their own expiry | Their own queries | Their own results |

---

## How the AI Pipeline Works

Custos runs a complete RAG (Retrieval-Augmented Generation) pipeline where every step is either in the browser or on localhost. No document content ever reaches an external server.

### Step 1: Document Chunking

When a user opens a decrypted document, the browser splits the text into overlapping chunks:
- **Chunk size:** 400 characters (~100-120 tokens)
- **Overlap:** 50 characters between adjacent chunks (maintains context at boundaries)
- **Fragments < 20 chars are skipped** (prevents indexing whitespace/artifacts)
- A 10-page document (~5,000 chars) produces approximately 14 chunks

This happens in `lib/embeddings.ts` → `chunkText()`. No network call.

### Step 2: Vector Embedding

Each chunk is converted into a 384-dimensional numerical vector using **multilingual-e5-small**:
- **Model:** `intfloat/multilingual-e5-small` (117MB)
- **Runtime:** `@xenova/transformers` — runs as WebAssembly in the browser
- **Caching:** model downloaded once, cached in IndexedDB for subsequent sessions
- **Prefixes:** documents use `"passage: "` prefix, queries use `"query: "` prefix (required by e5 architecture)
- **Output:** `Float32Array` of 384 dimensions per chunk

This happens entirely in the browser tab. The embedding model runs in WASM — no server, no API, no network call. 100+ languages supported.

### Step 3: Semantic Search

When the user asks a question:
1. The question is embedded with the same model: `embedQuery("query: " + question)` → 384-dim vector
2. **Cosine similarity** is computed between the query vector and every chunk vector
3. Chunks scoring above **0.5 threshold** are kept
4. **Top 5 chunks** are returned, ranked by relevance score

This is a brute-force search over ~14 vectors — takes <10ms. No vector database needed at this scale.

### Step 4: Context Assembly

The top-5 relevant chunks are joined into a context string:
- If semantic search found results: chunks joined with `---` separators
- If no chunks passed the 0.5 threshold: fallback to the first 2,000 characters of the document
- Total context is **capped at 4,000 characters** to stay within the LLM's useful context window

### Step 5: Local LLM Inference

The assembled context + user question are sent to **phi-4-mini** (3.8B parameters):
- **Runtime:** Ollama running on `localhost:11434`
- **System prompt:** "You are a precise document analyst. Answer questions based ONLY on the provided document excerpt. If the answer is not in the document, say so. Be concise and accurate."
- **Temperature:** 0.1 (factual, grounded — minimizes hallucination)
- **Max tokens:** 512 (concise responses)

The request goes to `localhost` — the LLM runs on the user's machine. No document content ever reaches an external API.

### Step 6: On-Chain Query Audit

After generating the answer, Custos records an encrypted audit proof:
1. `queryHash = keccak256(query text + timestamp)` — the query content is hidden; only its hash is on-chain
2. `logQueryAuth(docId, queryHash)` is called on `DocumentVault.sol`
3. The contract computes `FHE.gt(expiry, block.timestamp)` to check if the user was authorized at query time
4. The result (`ebool wasAuthorized`) is stored encrypted on-chain
5. `QueryLogged` event is emitted with `docId` and `queryHash`

**What auditors can verify:** "A query was made against document X at time T, and the user was authorized."
**What auditors cannot see:** What the query asked, what the document contained, or what the answer was.

This is the **only document AI tool with an on-chain authorization audit trail** that preserves content privacy.

---

## The On-Chain Audit Trail

The audit trail is Custos's most unique feature — no competitor has this.

### Why it matters:

Law firms must prove to clients and regulators that document access was controlled. Currently, this means centralized access logs in systems like iManage or NetDocuments — logs that the firm itself controls and can modify.

Custos replaces trust-based logging with **cryptographic proof**:

| Question | How Custos Answers | What's Revealed |
|---|---|---|
| "Was this query authorized?" | `ebool wasAuthorized` on-chain (FHE-encrypted) | Yes/No — only the querier can decrypt |
| "When was the query made?" | `block.timestamp` of the `QueryLogged` event | Timestamp (public) |
| "Against which document?" | `docId` in the event | Document ID hash (public, but meaningless without context) |
| "What was asked?" | `queryHash = keccak256(text + timestamp)` | Hash only — content completely hidden |
| "What was the answer?" | Not stored anywhere | Nothing — answer exists only in user's browser memory |

**The proof is on Ethereum Sepolia — immutable, verifiable, and private.** A compliance officer can verify that all AI queries in a given period were authorized without reading a single query or document.

---

## Competitive Positioning

### The 2×2 Matrix

```
                        No AI Integration ←→ Deep AI Integration
                        
  Surface Privacy       │ Lit Protocol        │ Notion AI
  (encryption only,     │ Standard DApps      │ ChatGPT
  metadata exposed)     │                     │ Box Shield
                        │                     │
  ─────────────────────────────────────────────────────────────
                        │                     │
  Deep FHE Privacy      │ Obolos (data rooms) │ Custos ★
  (access control       │                     │ (FHE access control
  itself encrypted)     │                     │  + local AI + audit)
```

**Custos is the only product in the top-right quadrant:** deep FHE privacy AND deep AI integration.

Obolos (scored 47/50 in Wave 1) is architecturally similar — hybrid FHE + AES for data rooms. But Obolos has **no AI integration** and **no audit trail**. Those are Custos's unique differentiators.

### Feature Comparison

| Feature | Dropbox | Notion AI | Lit Protocol | Obolos | **Custos** |
|---|---|---|---|---|---|
| File encryption | Server-side | No | Client-side | AES + FHE keys | **AES-256-GCM (browser)** |
| AI document Q&A | ChatGPT (exposed) | Cloud (exposed) | No | No | **phi-4-mini (local)** |
| Semantic search | No | Cloud | No | No | **e5-small (browser WASM)** |
| Access metadata private | No | No | No | Yes (FHE room keys) | **Yes (eaddress + euint64 + ebool)** |
| Time-bounded access | No | No | On-chain conditions | No | **FHE.gt(expiry, now) → ebool** |
| On-chain audit trail | No | No | No | No | **FHE-encrypted authorization proof** |
| Side-channel resistant | N/A | N/A | No | Unknown | **Yes (no reverts leak doc existence)** |

---

## Market Opportunity

### Primary Market: Legal AI

| Metric | Value | Source |
|---|---|---|
| US lawyers affected by ABA 512 | 1.3 million | ABA membership |
| Legal AI market (2024) | $1.4 billion | Grand View Research |
| Legal AI market (2030) | $24 billion | Grand View Research |
| CAGR | 61% | — |
| Manual document review cost | $1,000–$10,000/hour | ALM Legal Intelligence |
| AI time savings potential | 70–80% | McKinsey Legal |

**Serviceable addressable market:** 500,000 US lawyers who regularly handle confidential documents × $500/year = **$250M/year** in legal alone.

### Secondary Markets

| Market | Size (2024) | Size (2030) | Custos Fit |
|---|---|---|---|
| Healthcare AI | $45B | $187B | HIPAA-compliant document analysis |
| Confidential Computing | $5.3B | $54B | Underlying technology category |
| Document Management | $6.7B | $16B | Encrypted document workflows |
| Compliance & RegTech | $12B | $35B | Audit trail + selective disclosure |

### The Regulatory Tailwind

Privacy regulation is accelerating:
- **ABA Formal Opinion 512** (Feb 2024) — prohibits public AI on client matters
- **HIPAA** — prohibits PHI transmission without BAA
- **GDPR Article 25** — requires "data protection by design and by default"
- **EU AI Act** (2024) — high-risk AI on health data requires conformity assessment
- **Washington My Health My Data Act** (2024) — private right of action for health data misuse

Every new regulation makes cloud-based document AI harder to deploy and privacy-native alternatives more valuable. **Custos is structurally compliant by architecture — not by policy.**

---

## Product Principles

### 1. Privacy by Architecture, Not by Policy

Data can't leak because it never exists in plaintext outside the user's browser. This is a physical guarantee, not a legal promise. There is no privacy policy to violate because there is no data to expose.

### 2. AI Without Compromise

phi-4-mini runs locally via Ollama. multilingual-e5-small runs in the browser as WebAssembly. No document content ever reaches an external server. The user gets AI-powered document analysis without any privacy trade-off.

### 3. Audit Without Exposure

On-chain FHE-encrypted proofs that queries were authorized. Auditors can verify compliance without accessing document content, query text, or AI responses. The proof is immutable (Ethereum) and private (FHE).

### 4. Impossible Without FHE

Custos is not "a document tool that happens to use FHE." The core value proposition — encrypted access checks with dynamic time-bounded expiry — **cannot exist** without Fully Homomorphic Encryption. ZK-proofs can't compute `FHE.gt(expiry, now)`. Commit-reveal leaks at reveal. Standard encryption can't compute on ciphertext. FHE is the only technology that makes this possible.

### 5. Simplicity Despite Complexity

Users see: upload, share, ask questions, revoke. They don't see: AES-256-GCM encryption, FHE operations on the CoFHE coprocessor, IPFS content-addressed storage, wallet signature-derived key wrapping, 384-dimensional vector embeddings, cosine similarity search, or on-chain audit transactions. The cryptographic complexity is entirely invisible.

---

## Current State & Honest Limitations

### What Works Today

| Feature | Status | Detail |
|---|---|---|
| Document upload + encryption | ✅ Working | AES-256-GCM in browser → Pinata IPFS |
| FHE access control | ✅ Working | eaddress, euint64, ebool — 6 FHE operations |
| Time-bounded grants | ✅ Working | FHE.gt(expiry, now) → encrypted boolean |
| Access revocation | ✅ Working | Overwrite with encrypted zero → permanent denial |
| Semantic search | ✅ Working | e5-small WASM, 384-dim, cosine similarity, top-5 |
| Local AI Q&A | ✅ Working | phi-4-mini via Ollama, T=0.1, 512 max tokens |
| On-chain audit | ✅ Working | keccak256 hash + FHE ebool authorization proof |
| Side-channel resistance | ✅ Working | No reverts leak document existence |
| Contract | ✅ Deployed | Ethereum Sepolia, verified on Etherscan |
| Tests | ✅ 14 passing | CoFHE v0.4.0 mock backend |
| SDK | ✅ Current | @cofhe/sdk v0.4.0 direct (no deprecated cofhejs) |

### What's Honestly Limited

| Limitation | Why | When It Gets Fixed |
|---|---|---|
| Embeddings recompute on page refresh | Stored in React state, not IndexedDB | Wave 3 |
| No conversation memory | Each question independent, no follow-up context | Wave 3 |
| Fixed-size chunking | Can split mid-sentence at 400-char boundary | Wave 3 |
| Simplified key re-encryption | Signature-derived (not full ECDH) | Wave 3 |
| Single-document search only | Can't query across multiple documents | Wave 4 |
| No reranking | Raw cosine similarity, no cross-encoder | Wave 5 |
| Ollama dependency for AI | Must install locally, ~2GB model download | Future |

These limitations are documented, not hidden. They're the roadmap.

---

## Roadmap

> Custos entered the buildathon at Wave 2.

**Wave 2 (Current — First Submission):** Full build. Contract deployed. 14 tests. Full RAG pipeline. RainbowKit. Side-channel resistance. @cofhe/sdk v0.4.0.

**Wave 3 (April 8 - May 8):** AI pipeline hardening (IndexedDB vectors, conversation memory, paragraph-aware chunking). ECDH key re-encryption for real multi-user sharing. ReineiraOS IConditionResolver for paid document access.

**Wave 4 (May 11-20):** Multi-document AI search. FHE.select() for zero-information branching. Encrypted on-chain analytics via FHE.add(). Cross-chain deployment. Compliance export.

**Wave 5 (May 23 - June 1):** Cross-encoder reranker. Streaming AI responses. 5-minute demo video. Mainnet readiness assessment.

**Beyond Buildathon:** Enterprise pilot with a mid-market law firm. Containerized AI inference (no Ollama dependency). Mainnet deployment. SOC 2 Type I certification pathway.
