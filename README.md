# Custos

**Privacy-native document intelligence on Fhenix FHE**

> Share confidential documents and get AI insights — even WHO has access is encrypted on-chain.

**Live Contract:** [0xDC756aaAb268610e157Fb11fe81c400E09b8eB8c](https://sepolia.etherscan.io/address/0xDC756aaAb268610e157Fb11fe81c400E09b8eB8c#code) (Ethereum Sepolia, verified)

**GitHub:** [github.com/harystyleseze/Custos](https://github.com/harystyleseze/Custos)

---

## Quick Start

**Requirements:** Node.js v20+, pnpm, MetaMask (Sepolia network)

```bash
# 1. Clone and install
git clone https://github.com/harystyleseze/Custos.git
cd Custos
pnpm install
pnpm approve-builds --all   # Required for pnpm v10+ strict mode
pnpm install                 # Re-run after approving builds

# 2. Configure environment
cp .env.example .env
# Edit .env — add your private key, Pinata JWT, Etherscan API key

# 3. Run tests (14 passing, CoFHE v0.4.x mock backend)
pnpm test

# 4. Compile and deploy contract
pnpm compile
pnpm eth-sepolia:deploy
# Copy the deployed address into .env as NEXT_PUBLIC_VAULT_ADDRESS=0x...

# 5. Verify on Etherscan
pnpm eth-sepolia:verify <deployed-address>

# 6. Start frontend
pnpm dev
# Open http://localhost:3000, connect MetaMask to Sepolia
```

**For AI features:** Install [Ollama](https://ollama.ai), then `ollama serve` and `ollama pull phi4-mini`.

---

## The Problem

In February 2024, the ABA issued **Formal Opinion 512** — explicitly warning 1.3 million US lawyers they cannot use public AI tools on confidential client matters. The same applies to HIPAA (healthcare), SEC Rule 10b-5 (M&A), and standard NDA regimes.

Every existing solution fails at one of three layers:

| Failure | What Leaks | Example |
|---|---|---|
| **File content** | Document text to cloud AI provider | Uploading a contract to ChatGPT |
| **Access metadata** | Who shared what with whom | Blockchain shows wallet A granted wallet B access to document X |
| **AI query logs** | What questions were asked about which documents | AI API logs reveal due diligence activity |

**The unique problem Custos solves:** Even if files are encrypted, standard smart contracts store access lists in plaintext. If blockchain records show "wallet 0xLawFirm granted access to 0xAcquirer", that reveals an M&A relationship — a trading signal worth millions.

---

## The Solution

Custos eliminates all three failure modes with a 4-layer privacy architecture:

| Layer | What's Protected | How |
|---|---|---|
| **1. File Content** | Document text | AES-256-GCM encryption in browser before any upload |
| **2. Storage** | Encrypted blobs | Pinata IPFS — receives only ciphertext, cannot read content |
| **3. Access Control** | Who has access, when it expires, whether access is valid | Fhenix CoFHE on Ethereum Sepolia — `eaddress`, `euint64`, `ebool` all encrypted |
| **4. AI Analysis** | Queries and document content during analysis | phi-4-mini runs locally via Ollama; e5-small runs in browser via WASM |

---

## Why FHE — Not Just Encryption

Standard encryption protects file content. **FHE protects the access control layer itself.**

```
Standard approach (transparent access control):
  mapping(address => bool) public hasAccess;
  // Anyone can query: does 0xLawFirm have access? → true (public)

Custos approach (FHE-encrypted access control):
  mapping(address => euint64) private _accessExpiry;
  // Query: what is the expiry for 0xLawFirm? → encrypted ciphertext (unreadable)

  function checkAccess(docId) returns (ebool) {
      euint64 expiry = _accessExpiry[docId][msg.sender];
      euint64 now64 = FHE.asEuint64(block.timestamp);
      ebool isActive = FHE.gt(expiry, now64);    // Encrypted comparison
      FHE.allowSender(isActive);                  // Only caller can decrypt
      return isActive;                            // Returns ciphertext
  }
```

The `FHE.gt(expiry, now)` comparison runs entirely in the encrypted domain. The result is itself a ciphertext — only the requester can decrypt whether they have access.

**FHE types used in DocumentVault:**

| Type | What It Protects | Why It Matters |
|---|---|---|
| `eaddress` | Document owner identity | Prevents enumeration of who owns what |
| `euint64` | Access grant expiry timestamps | Hides when grants expire (business-sensitive timing) |
| `ebool` | Access check results + query audit | Only the requester knows if they have access |

---

## Architecture

### System Overview

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                              USER'S BROWSER                                 ║
║                                                                              ║
║  ┌─────────────────┐  ┌───────────────────┐  ┌────────────────────────┐    ║
║  │   Next.js 14    │  │  @cofhe/sdk v0.4  │  │  @xenova/transformers  │    ║
║  │ + wagmi v2      │  │  encryptInputs()  │  │  multilingual-e5-small │    ║
║  │ + RainbowKit    │  │  decryptForView() │  │  (117MB WASM, 384-dim) │    ║
║  └────────┬────────┘  └────────┬──────────┘  └────────────┬───────────┘    ║
║           │                    │                           │                ║
║  ┌────────▼────────────────────▼───────────────────────────▼────────────┐   ║
║  │                   CLIENT-SIDE ENCRYPTION LAYER                       │   ║
║  │                                                                      │   ║
║  │  ┌─────────────────────┐  ┌──────────────────────────────────────┐  │   ║
║  │  │  AES-256-GCM        │  │  Wallet Key Wrapping                 │  │   ║
║  │  │  (Web Crypto API)   │  │  sign(message) → SHA-256 → AES-KW   │  │   ║
║  │  │                     │  │  Only wallet holder can unwrap key   │  │   ║
║  │  │  file → [iv|ct]     │  │  signature → wrapping key → encrypt │  │   ║
║  │  └─────────┬───────────┘  └──────────────────┬───────────────────┘  │   ║
║  └────────────│─────────────────────────────────│──────────────────────┘   ║
╚═══════════════│═════════════════════════════════│═══════════════════════════╝
                │                                 │
    ┌───────────▼──────────┐          ┌───────────▼─────────────────────┐
    │                      │          │                                 │
    │   PINATA IPFS        │          │   ETHEREUM SEPOLIA (CoFHE)     │
    │                      │          │                                 │
    │  ┌────────────────┐  │          │  ┌───────────────────────────┐ │
    │  │ Encrypted Blob │  │◄── CID ──│  │   DocumentVault.sol      │ │
    │  │ [iv|ciphertext]│  │          │  │                           │ │
    │  └────────────────┘  │          │  │  ┌─ eaddress owner       │ │
    │                      │          │  │  ├─ euint64  uploadedAt   │ │
    │  Sees: random bytes  │          │  │  ├─ bytes32  ipfsCid     │ │
    │  Knows: nothing      │          │  │  ├─ bytes    encryptedKey │ │
    │                      │          │  │  │                        │ │
    └──────────────────────┘          │  │  ├─ euint64  accessExpiry│ │
                                      │  │  ├─ ebool    accessResult│ │
    ┌──────────────────────┐          │  │  └─ ebool    queryAudit  │ │
    │                      │          │  │                           │ │
    │  LOCAL AI            │          │  │  Sees: ciphertext hashes │ │
    │  (phi-4-mini/Ollama) │          │  │  Knows: nothing          │ │
    │                      │          │  └───────────────────────────┘ │
    │  localhost:11434     │          │                                 │
    │  Sees: plaintext     │          │  CoFHE Coprocessor handles    │
    │  (local only)        │          │  all FHE computation off-chain │
    │                      │          │                                 │
    └──────────────────────┘          └─────────────────────────────────┘
```

### Data Flow: Upload Document

```
    USER                        BROWSER                    IPFS           ETHEREUM
     │                            │                          │                │
     │  Select file               │                          │                │
     │ ──────────────────────►    │                          │                │
     │                            │                          │                │
     │                     ┌──────┴──────┐                   │                │
     │                     │ 1. ENCRYPT  │                   │                │
     │                     │             │                   │                │
     │                     │ AES-256-GCM │                   │                │
     │                     │ key = new   │                   │                │
     │                     │ iv = random │                   │                │
     │                     │ ct = E(file)│                   │                │
     │                     └──────┬──────┘                   │                │
     │                            │                          │                │
     │                     ┌──────┴──────┐                   │                │
     │                     │ 2. WRAP KEY │                   │                │
     │                     │             │                   │                │
     │  Sign message       │ sig = sign()│                   │                │
     │ ◄─────────────────► │ wk = SHA256 │                   │                │
     │  (MetaMask popup)   │ ek = E(key) │                   │                │
     │                     └──────┬──────┘                   │                │
     │                            │                          │                │
     │                            │  POST [iv|ct]            │                │
     │                            │ ────────────────────►    │                │
     │                            │                    CID ◄─┘                │
     │                            │  ◄──── CID ─────────     │                │
     │                            │                          │                │
     │                     ┌──────┴──────┐                   │                │
     │                     │ 3. FHE      │                   │                │
     │                     │ ENCRYPT     │                   │                │
     │                     │             │                   │                │
     │                     │ encTs =     │                   │                │
     │                     │ FHE(now)    │                   │                │
     │                     │ encOwner =  │                   │                │
     │                     │ FHE(addr)   │                   │                │
     │                     └──────┬──────┘                   │                │
     │                            │                          │                │
     │                            │  registerDocument(       │                │
     │                            │    docId, encTs,         │  ┌──────────┐ │
     │                            │    encOwner, CID, ek)    │  │ STORE:   │ │
     │                            │ ─────────────────────────┼─►│ eaddress │ │
     │                            │                          │  │ euint64  │ │
     │                            │                          │  │ bytes32  │ │
     │  ✓ Document registered     │  ◄─── tx receipt ────────┼──│ bytes    │ │
     │ ◄──────────────────────    │                          │  └──────────┘ │
     │                            │                          │                │
```

### Data Flow: FHE Access Check

```
    GRANTEE                     BROWSER                         ETHEREUM
     │                            │                                │
     │  checkAccess(docId)        │                                │
     │ ──────────────────────►    │                                │
     │                            │  checkAccess(docId)            │
     │                            │ ──────────────────────────►    │
     │                            │                                │
     │                            │           ┌────────────────────┤
     │                            │           │  ON-CHAIN FHE:     │
     │                            │           │                    │
     │                            │           │  expiry = load     │
     │                            │           │    _accessExpiry   │
     │                            │           │    [docId][sender] │
     │                            │           │                    │
     │                            │           │  now64 = FHE       │
     │                            │           │    .asEuint64(     │
     │                            │           │    block.timestamp)│
     │                            │           │                    │
     │                            │           │  isActive = FHE    │
     │                            │           │    .gt(expiry,now) │
     │                            │           │    ▲               │
     │                            │           │    │ ENCRYPTED     │
     │                            │           │    │ COMPARISON    │
     │                            │           │    │ (never        │
     │                            │           │    │  decrypted    │
     │                            │           │    │  on-chain)    │
     │                            │           │    ▼               │
     │                            │           │  FHE.allowSender  │
     │                            │           │    (isActive)      │
     │                            │           │  ──► ONLY sender   │
     │                            │           │      can decrypt   │
     │                            │           │                    │
     │                            │           └────────────────────┤
     │                            │                                │
     │                            │  ◄─── ebool (ciphertext) ─────│
     │                            │                                │
     │                     ┌──────┴──────┐                         │
     │                     │ SDK DECRYPT │                         │
     │                     │             │                         │
     │                     │ client      │                         │
     │                     │  .decrypt   │                         │
     │                     │  ForView()  │                         │
     │                     │  → true/    │                         │
     │                     │    false    │                         │
     │                     └──────┬──────┘                         │
     │                            │                                │
     │  Access: ✓ Granted         │                                │
     │ ◄──────────────────────    │                                │
     │     (or ✗ Denied)          │                                │
```

### Data Flow: AI Query with Audit

```
    USER                    BROWSER                      OLLAMA        ETHEREUM
     │                        │                            │               │
     │  "What is the          │                            │               │
     │   payment amount?"     │                            │               │
     │ ──────────────────►    │                            │               │
     │                        │                            │               │
     │                 ┌──────┴──────┐                     │               │
     │                 │ 1. SEMANTIC  │                     │               │
     │                 │    SEARCH    │                     │               │
     │                 │             │                     │               │
     │                 │ e5-small    │                     │               │
     │                 │ (WASM)      │                     │               │
     │                 │ embed query │                     │               │
     │                 │ cosine sim  │                     │               │
     │                 │ top-5 chunks│                     │               │
     │                 └──────┬──────┘                     │               │
     │                        │                            │               │
     │                        │  POST {context, query}     │               │
     │                        │ ────────────────────────►  │               │
     │                        │                            │               │
     │                        │               ┌────────────┤               │
     │                        │               │ phi-4-mini │               │
     │                        │               │ T=0.1      │               │
     │                        │               │ max=512 tk │               │
     │                        │               └────────────┤               │
     │                        │                            │               │
     │                        │  ◄──── {answer} ───────────│               │
     │                        │                            │               │
     │                 ┌──────┴──────┐                     │               │
     │                 │ 2. ON-CHAIN │                     │               │
     │                 │    AUDIT    │                     │               │
     │                 │             │                     │               │
     │                 │ hash =      │                     │               │
     │                 │ keccak256(  │                     │               │
     │                 │ query+ts)   │  logQueryAuth       │               │
     │                 │             │  (docId, hash)      │  ┌──────────┐│
     │                 │             │ ───────────────────────►│ STORES:  ││
     │                 │             │                     │  │ ebool    ││
     │                 │             │                     │  │ (was     ││
     │                 │             │                     │  │ author-  ││
     │                 │             │                     │  │ ized?)   ││
     │                 └──────┬──────┘                     │  └──────────┘│
     │                        │                            │               │
     │  "The payment amount   │                            │               │
     │   is $50,000..."       │                            │               │
     │ ◄──────────────────    │                            │               │
```

### Privacy Guarantee Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WHAT EACH PARTY SEES                             │
├──────────────────┬──────────┬───────────┬───────────┬──────────────────┤
│                  │  Pinata  │ Ethereum  │  Ollama   │   Other Users    │
│                  │  (IPFS)  │  Nodes    │  (Local)  │   / Observers    │
├──────────────────┼──────────┼───────────┼───────────┼──────────────────┤
│ File content     │ ██ AES   │     -     │ Plaintext │       -          │
│                  │ cipher   │           │ (local)   │                  │
├──────────────────┼──────────┼───────────┼───────────┼──────────────────┤
│ Document owner   │    -     │ ██ FHE    │     -     │  ██ FHE cipher   │
│                  │          │ eaddress  │           │                  │
├──────────────────┼──────────┼───────────┼───────────┼──────────────────┤
│ Access expiry    │    -     │ ██ FHE    │     -     │  ██ FHE cipher   │
│                  │          │ euint64   │           │                  │
├──────────────────┼──────────┼───────────┼───────────┼──────────────────┤
│ Access result    │    -     │ ██ FHE    │     -     │  ██ FHE cipher   │
│                  │          │ ebool     │           │                  │
├──────────────────┼──────────┼───────────┼───────────┼──────────────────┤
│ AI query         │    -     │  hash     │ Plaintext │   hash only      │
│                  │          │  only     │ (local)   │                  │
├──────────────────┼──────────┼───────────┼───────────┼──────────────────┤
│ Search vectors   │    -     │     -     │     -     │       -          │
│                  │          │           │           │  (browser only)  │
├──────────────────┼──────────┼───────────┼───────────┼──────────────────┤
│ IPFS CID         │  Public  │  Public   │     -     │   Public (safe:  │
│                  │          │           │           │   blob = cipher) │
└──────────────────┴──────────┴───────────┴───────────┴──────────────────┘

  ██ = Encrypted (party cannot read)     - = Not present at this party
  Plaintext (local) = Only on user's machine, never transmitted
```

### Smart Contract State Diagram

```
                    ┌─────────────────────────────────┐
                    │         DOCUMENT LIFECYCLE       │
                    └─────────────────────────────────┘

                         registerDocument()
                               │
                               ▼
                    ┌─────────────────────┐
                    │                     │
                    │   REGISTERED        │
                    │                     │
                    │  owner: eaddress    │◄────────────────────────────┐
                    │  uploadedAt: euint64│                             │
                    │  ipfsCid: bytes32   │                             │
                    │  encKey: bytes      │                             │
                    │                     │                             │
                    └──────────┬──────────┘                             │
                               │                                       │
                    grantAccess(grantee, encExpiry)                     │
                               │                                       │
                               ▼                                       │
                    ┌─────────────────────┐                            │
                    │                     │                            │
                    │   ACCESS GRANTED    │    revokeAccess()          │
                    │                     │ ─────────────────────────► │
                    │  expiry: euint64    │    (expiry → encrypted 0)  │
                    │  grantKey: bytes    │                            │
                    │                     │                            │
                    └──────────┬──────────┘                            │
                               │                                       │
                    checkAccess() → ebool                              │
                               │                                       │
                    ┌──────────┴──────────┐                            │
                    │                     │                            │
               ┌────┴────┐          ┌─────┴────┐                      │
               │         │          │          │                      │
               │  TRUE   │          │  FALSE   │                      │
               │ (active)│          │ (expired │                      │
               │         │          │  / none  │                      │
               │         │          │  / revoke)                      │
               └────┬────┘          └──────────┘                      │
                    │                                                  │
         logQueryAuth(queryHash)                                       │
                    │                                                  │
                    ▼                                                  │
         ┌─────────────────────┐                                      │
         │                     │                                      │
         │   QUERY AUDITED     │    revokeAccess()                    │
         │                     │ ─────────────────────────────────────┘
         │  queryHash: bytes32 │
         │  wasAuth: ebool     │
         │                     │
         └─────────────────────┘
```

### FHE Encryption Flow Detail

```
┌──────────────────────────────────────────────────────────────────────┐
│                  HOW FHE.gt(expiry, now) WORKS                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Browser (Client SDK)                                                │
│  ┌─────────────────────────────────┐                                │
│  │ 1. encryptInputs([             │                                │
│  │      Encryptable.uint64(       │                                │
│  │        futureTimestamp          │   plaintext: 1735689600       │
│  │      )                          │                                │
│  │    ]).execute()                  │                                │
│  │                                  │                                │
│  │    → InEuint64 {                │                                │
│  │        ctHash: 0xABC123...      │   ciphertext reference       │
│  │        signature: 0xDEF456...   │   proves client created it   │
│  │      }                           │                                │
│  └──────────────┬──────────────────┘                                │
│                  │                                                    │
│  Ethereum (On-Chain)                                                │
│  ┌──────────────▼──────────────────┐                                │
│  │ 2. FHE.asEuint64(encExpiry)     │                                │
│  │    → euint64 (handle: 0x111)    │   Registers in CoFHE          │
│  │                                  │                                │
│  │ 3. FHE.asEuint64(block.timestamp)│                               │
│  │    → euint64 (handle: 0x222)    │   Wraps current time          │
│  │                                  │                                │
│  │ 4. FHE.gt(0x111, 0x222)         │                                │
│  │    → ebool (handle: 0x333)      │   Encrypted comparison        │
│  │                                  │                                │
│  │    ┌─────────────────────────┐  │                                │
│  │    │  CoFHE Coprocessor:     │  │                                │
│  │    │                          │  │                                │
│  │    │  decrypt(0x111) = 1735..│  │   Never exposed on-chain      │
│  │    │  decrypt(0x222) = 1712..│  │                                │
│  │    │  1735.. > 1712.. = true │  │   Computation in TEE          │
│  │    │  encrypt(true) = 0x333  │  │                                │
│  │    └─────────────────────────┘  │                                │
│  │                                  │                                │
│  │ 5. FHE.allowSender(0x333)       │   Permission: only caller     │
│  │                                  │                                │
│  │ 6. return 0x333                  │   Returns ciphertext handle   │
│  └──────────────┬──────────────────┘                                │
│                  │                                                    │
│  Browser (SDK Decrypt)                                               │
│  ┌──────────────▼──────────────────┐                                │
│  │ 7. client.decryptForView(       │                                │
│  │      0x333, FheTypes.Bool       │                                │
│  │    ).execute()                   │                                │
│  │                                  │                                │
│  │    → true                        │   Only this wallet sees this  │
│  └─────────────────────────────────┘                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Comparative: Custos vs Competitors

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    PRIVACY COMPARISON MATRIX                              │
├────────────────┬──────────┬──────────┬──────────┬──────────┬────────────┤
│                │ Dropbox  │ Notion   │   Lit    │  Box     │ Custos  │
│                │          │   AI     │ Protocol │ Shield   │            │
├────────────────┼──────────┼──────────┼──────────┼──────────┼────────────┤
│ File           │ Server-  │    ✗     │ Client-  │ Server-  │ ✅ Client  │
│ Encryption     │ side     │          │ side     │ side     │ AES-256    │
├────────────────┼──────────┼──────────┼──────────┼──────────┼────────────┤
│ AI             │ ChatGPT  │ Cloud    │    ✗     │ Cloud    │ ✅ Local   │
│ Integration    │ (exposed)│ (exposed)│          │ (exposed)│ phi-4-mini │
├────────────────┼──────────┼──────────┼──────────┼──────────┼────────────┤
│ Access         │    ✗     │    ✗     │    ✗     │    ✗     │ ✅ FHE     │
│ Metadata       │ Public   │ Public   │ Public   │ Central  │ Encrypted  │
│ Private        │          │          │          │          │            │
├────────────────┼──────────┼──────────┼──────────┼──────────┼────────────┤
│ Blockchain     │    ✗     │    ✗     │    ✗     │    ✗     │ ✅ Ethereum│
│ Audit Trail    │          │          │          │          │ Sepolia    │
├────────────────┼──────────┼──────────┼──────────┼──────────┼────────────┤
│ Semantic       │    ✗     │ Cloud    │    ✗     │    ✗     │ ✅ Browser │
│ Search         │          │          │          │          │ WASM       │
└────────────────┴──────────┴──────────┴──────────┴──────────┴────────────┘

  ✅ = Privacy-preserving     ✗ = Not available     Exposed = Data visible to provider
```

### What's Encrypted vs Public

| Data | Location | Encrypted? | Who Can Read? |
|---|---|---|---|
| File content | Pinata IPFS | AES-256-GCM | Only key holders |
| Document owner | Ethereum Sepolia | `eaddress` (FHE) | Only owner (via SDK decrypt) |
| Access expiry | Ethereum Sepolia | `euint64` (FHE) | Only grantee (via SDK decrypt) |
| Access check result | Ethereum Sepolia | `ebool` (FHE) | Only requester |
| AI query content | Browser → Ollama | Local only | Only the user |
| Search embeddings | Browser (WASM) | Local only | Only the user |
| IPFS CID | Ethereum Sepolia | Public (safe) | Anyone — but blob is ciphertext |
| Query audit hash | Ethereum Sepolia | `keccak256` | Verifiable but content-hidden |

---

## Smart Contract: DocumentVault

**Address:** [`0xDC756aaAb268610e157Fb11fe81c400E09b8eB8c`](https://sepolia.etherscan.io/address/0xDC756aaAb268610e157Fb11fe81c400E09b8eB8c#code)
**Solidity:** 0.8.25 | **EVM:** Cancun | **Library:** `@fhenixprotocol/cofhe-contracts@0.1.3`

### Core Functions

| Function | What It Does | FHE Operations |
|---|---|---|
| `registerDocument` | Store encrypted doc metadata + IPFS CID | `FHE.asEuint64`, `FHE.asEaddress`, `FHE.allowThis`, `FHE.allow` |
| `grantAccess` | Grant time-bounded access with encrypted expiry | `FHE.asEuint64`, `FHE.allowThis`, `FHE.allow` |
| `revokeAccess` | Overwrite expiry with encrypted zero | `FHE.asEuint64(0)` → `FHE.gt(0, now)` always returns false |
| `checkAccess` | Encrypted boolean: does caller have access? | `FHE.gt(expiry, now)` → `ebool`, `FHE.allowSender` |
| `logQueryAuth` | Encrypted audit: was AI query authorized? | Same as checkAccess + stores result keyed by query hash |

### FHE Permission Model

Every encrypted value must have explicit permissions set:
- `FHE.allowThis(value)` — contract can use the value in future calls
- `FHE.allow(value, address)` — specific address can decrypt
- `FHE.allowSender(value)` — only `msg.sender` can decrypt

Missing any of these causes silent failures. Custos sets all three correctly for each operation.

### Why `checkAccess` Is Not `view`

FHE operations (`FHE.asEuint64`, `FHE.gt`) register ciphertext handles in the CoFHE coprocessor state. This is a state modification, so the function cannot be declared `view`. The result is stored in `_lastAccessResult` for subsequent reads via the `getLastAccessResult` view getter.

### Side-Channel Resistance

`checkAccess` and `logQueryAuth` do NOT revert on non-existent documents. If a document doesn't exist, `_accessExpiry` defaults to zero, and `FHE.gt(0, block.timestamp)` naturally returns encrypted false. This prevents leaking whether a document ID is even registered — an observer cannot distinguish "document doesn't exist" from "access denied." This pattern (used by BATNA, Blank, and OBSCURA in the Fhenix ecosystem) eliminates information leakage through gas branching and revert reasons.

---

## Client-Side Encryption

**File:** `lib/crypto.ts`

```
Upload flow:
  1. generateAesKey()           → AES-256-GCM key (Web Crypto API)
  2. encryptFile(bytes, key)    → [iv | ciphertext] blob
  3. signMessage(KEY_DERIVATION_MESSAGE) → wallet signature
  4. SHA-256(signature)         → wrapping key
  5. AES-GCM encrypt(aesKey, wrappingKey) → encrypted key for on-chain storage

Decrypt flow:
  1. signMessage(KEY_DERIVATION_MESSAGE) → same wallet signature
  2. SHA-256(signature)         → same wrapping key
  3. AES-GCM decrypt(encryptedKey, wrappingKey) → recovered AES key
  4. decryptFile(ipfsBlob, aesKey) → plaintext document
```

The AES key never leaves the browser in plaintext. Only the wallet holder can recover it.

---

## AI Layer

### phi-4-mini (Document Q&A)

- **Model:** Microsoft phi-4-mini (3.8B parameters)
- **Runtime:** Ollama (local, `http://localhost:11434`)
- **Temperature:** 0.1 (factual, grounded responses)
- **Max tokens:** 512
- **System prompt:** "Answer only from the provided document context"
- **Privacy:** Document text stays on localhost — no external API calls

### multilingual-e5-small (Semantic Search)

- **Model:** `intfloat/multilingual-e5-small` (117MB, 384-dim)
- **Runtime:** `@xenova/transformers` (WebAssembly, runs in browser)
- **Chunking:** 400-char chunks, 50-char overlap
- **Search:** Cosine similarity, 0.5 threshold, top-5 results
- **Caching:** IndexedDB (loads once, cached for subsequent sessions)
- **Privacy:** Embeddings computed in browser — never transmitted

### Query Audit Trail

When a user asks a question, Custos:
1. Computes `queryHash = keccak256(query + timestamp)` (content hidden)
2. Calls `logQueryAuth(docId, queryHash)` on-chain
3. Contract stores an FHE-encrypted `ebool` proving authorization at query time
4. Auditors can verify queries were authorized without reading query content

---

## Testing

**14 tests passing** using CoFHE v0.4.x mock backend:

```bash
pnpm test

  DocumentVault
    registerDocument
      ✔ should register a document with FHE-encrypted metadata
      ✔ should revert if document already exists
      ✔ should revert if IPFS CID is zero
    grantAccess
      ✔ should grant encrypted time-bounded access to a grantee
      ✔ should revert if document does not exist
      ✔ should revert if grantee is zero address
    checkAccess — FHE gt() comparison
      ✔ should return encrypted false for address with no grant
      ✔ should return encrypted true for address with active grant
      ✔ should return encrypted false after revocation
    logQueryAuth
      ✔ should log encrypted authorization for an AI query by authorized user
      ✔ should log encrypted false for AI query by unauthorized user
    Read functions
      ✔ should return public CID and existence flag
      ✔ should return owner key for the uploader
      ✔ should return false for documentExists on non-existent doc

  14 passing (862ms)
```

**Test pattern (v0.4.x API):**
```typescript
const client = await hre.cofhe.createClientWithBatteries(signer)

const [encTimestamp, encOwner] = await client
    .encryptInputs([Encryptable.uint64(now), Encryptable.address(alice.address)])
    .execute()

await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, cid, key)

// For non-view FHE functions: call as tx → read via getter → verify plaintext
await vault.connect(bob).checkAccess(docId)
const isActiveHash = await vault.getLastAccessResult(docId, bob.address)
await hre.cofhe.mocks.expectPlaintext(isActiveHash, 1n)  // 1 = true
```

---

## User Flows

### Upload Document
```
User selects file
  → AES-256-GCM encrypt in browser (Web Crypto API)
  → Upload encrypted blob to Pinata IPFS
  → FHE-encrypt metadata (timestamp, owner address) via @cofhe/sdk
  → Call registerDocument() on Ethereum Sepolia
  → Document registered with zero plaintext exposure
```

### Share Document
```
Owner enters grantee address + expiry (days)
  → FHE-encrypt expiry timestamp
  → Call grantAccess() on-chain
  → Grantee can now call checkAccess() → gets encrypted true
  → Grantee fetches re-encrypted AES key from contract
  → Grantee downloads + decrypts document locally
```

### AI Query
```
User types question
  → e5-small embeds query in browser (WASM)
  → Cosine similarity against document chunks (browser-local)
  → Top-5 chunks + query sent to phi-4-mini (localhost Ollama)
  → queryHash = keccak256(query + timestamp) stored on-chain
  → FHE-encrypted authorization proof recorded
  → Answer displayed — no external AI API call made
```

### Revoke Access
```
Owner clicks revoke for a grantee
  → revokeAccess() overwrites expiry with encrypted 0
  → FHE.gt(0, block.timestamp) = encrypted false (always)
  → Grantee's next checkAccess() returns false
  → Re-encrypted AES key deleted from contract
```

---

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Smart Contract | Solidity + `@fhenixprotocol/cofhe-contracts` | 0.8.25 / 0.1.3 |
| FHE SDK | `@cofhe/sdk` (direct, no @cofhe/react) | 0.4.0 |
| FHE Testing | `@cofhe/hardhat-plugin` + `@cofhe/mock-contracts` | 0.4.0 |
| Network | Ethereum Sepolia (chainId: 11155111) | — |
| Build Tool | Hardhat | ^2.22.19 |
| Frontend | Next.js 14 + React 18 | 14.2.0 / 18.3.0 |
| Wallet | wagmi v2 + viem + RainbowKit | 2.12.0 / 2.17.0 / 2.2.0 |
| File Encryption | Web Crypto API (AES-256-GCM) | Browser native |
| IPFS | Pinata | 1.1.0 |
| AI Inference | phi-4-mini via Ollama | Local |
| Embeddings | multilingual-e5-small via `@xenova/transformers` | WASM |
| Package Manager | pnpm | 10+ |
| Runtime | Node.js | v20+ |

---

## File Structure

```
custos/
├── contracts/
│   └── DocumentVault.sol              # Core FHE contract (321 lines)
├── test/
│   └── DocumentVault.test.ts          # 14 tests, CoFHE v0.4.x mock
├── app/
│   ├── layout.tsx                     # Root layout (dynamic SSR-safe providers)
│   ├── providers.tsx                  # Wagmi + RainbowKit + CoFHE SDK + React Query
│   ├── page.tsx → HomeContent.tsx     # Landing page with wallet connect
│   ├── dashboard/
│   │   ├── page.tsx → DashboardContent.tsx  # Document list + upload
│   │   └── [docId]/
│   │       ├── page.tsx → DocViewerContent.tsx  # Document viewer + AI
│   └── api/analyze/route.ts          # phi-4-mini inference endpoint
├── components/
│   ├── DocumentUpload.tsx             # 4-step upload with progress
│   ├── AccessManager.tsx              # Grant/revoke FHE-encrypted access
│   ├── AIQueryBox.tsx                 # Semantic search + AI Q&A + audit
│   └── EncryptionStatus.tsx           # Privacy layers visualization
├── lib/
│   ├── crypto.ts                      # AES-256-GCM + wallet key wrapping
│   ├── cofhe-context.tsx              # CoFHE SDK v0.4.0 React context (replaces @cofhe/react)
│   ├── vault.ts                       # Contract ABI + address
│   ├── pinata.ts                      # IPFS upload/download
│   └── embeddings.ts                  # e5-small WASM semantic search
├── deployments/
│   └── eth-sepolia.json               # Deployed contract address
├── hardhat.config.ts                  # Compile + deploy + test config
├── next.config.js                     # WASM support + SSR fixes
├── tsconfig.json                      # Next.js TypeScript config
├── tsconfig.hardhat.json              # Hardhat TypeScript config
├── package.json                       # Dependencies + scripts
└── .env.example                       # Environment variable template
```

---

## Environment Variables

```bash
# Wallet — deployer private key for Sepolia
PRIVATE_KEY=0x<64-hex-chars>

# Ethereum Sepolia RPC (default: public node)
SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com

# Etherscan API key for contract verification
ETHERSCAN_API_KEY=<your-key>

# Pinata IPFS — from app.pinata.cloud/developers/api-keys
PINATA_JWT=<your-jwt>
PINATA_GATEWAY=https://gateway.pinata.cloud

# Frontend — set after deploying contract
NEXT_PUBLIC_VAULT_ADDRESS=0xDC756aaAb268610e157Fb11fe81c400E09b8eB8c
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-project-id  # from cloud.walletconnect.com (optional)

# AI inference — local Ollama
OLLAMA_URL=http://localhost:11434
```

---

## Roadmap

> Custos entered the buildathon at Wave 2. All items below are from Wave 2 onward.

### Wave 2 (First Submission) — Full Build
- [x] DocumentVault smart contract with FHE-encrypted access control (3 encrypted types, 6 FHE operations)
- [x] 14-test suite on CoFHE v0.4.x mock backend
- [x] Full Next.js frontend (landing, dashboard, document viewer) with RainbowKit wallet connect
- [x] AES-256-GCM browser encryption + Pinata IPFS storage
- [x] phi-4-mini local AI + e5-small WASM semantic search (full RAG pipeline in browser)
- [x] FHE query audit logging (encrypted authorization proof on-chain)
- [x] Side-channel resistance (no reverts leaking document existence)
- [x] @cofhe/sdk v0.4.0 direct (no deprecated cofhejs or @cofhe/react)
- [x] Deployed and verified on Ethereum Sepolia

### Wave 3 (April 8 - May 8) — AI Pipeline + Production Hardening
- [ ] Persistent vector store in IndexedDB (embeddings survive page refresh)
- [ ] Conversation memory (follow-up questions maintain context across Q&A pairs)
- [ ] Paragraph-aware chunking (split on `\n\n` and `. ` instead of mid-word)
- [ ] Proper ECDH key re-encryption for grantees
- [ ] ReineiraOS integration: `IConditionResolver` for paid document access
- [ ] UI/UX polish (loading states, error recovery, responsive design)

### Wave 4 (May 11 - May 20) — Multi-Document AI + Ecosystem Depth
- [ ] Multi-document semantic search (query across all user's documents)
- [ ] `FHE.select()` for advanced conditional logic (zero-information branching)
- [ ] Encrypted on-chain analytics via `FHE.add()` accumulation
- [ ] Multi-party threshold decryption exploration
- [ ] Cross-chain deployment (Arbitrum Sepolia, Base Sepolia)

### Wave 5 (May 23 - June 1) — Demo Day + Production Readiness
- [ ] Compliance export: cryptographic proof of access audit logs for auditors
- [ ] Cross-encoder reranker for search accuracy (~30MB MiniLM ONNX)
- [ ] Streaming AI responses (real-time token display from phi-4-mini)
- [ ] 5-minute narrated demo video showing full pipeline
- [ ] Mainnet readiness assessment (gas costs, security review, performance benchmarks)

---

## Known Limitations

These are documented for transparency, not hidden:

| Limitation | Current State | Production Path |
|---|---|---|
| Grantee key re-encryption | Signature-derived shared key (simplified) | Full ECDH key exchange between wallets |
| AI inference dependency | Requires local Ollama | Containerized inference or Azure AI Foundry |
| Access check demo | Limited to connected wallet | Wallet-switching UI or multi-wallet testing |
| FHE gas estimation | Manual 5M gas limit on all FHE transactions | Fhenix precompile support in `eth_estimateGas` |

---

## Why This Architecture

### Why FHE instead of ZK-proofs?
FHE allows **computation** on encrypted data. ZK-proofs prove statements without revealing data, but can't compute new values. `FHE.gt(expiry, now)` produces a new encrypted result — ZK can't do this.

### Why local AI instead of cloud AI?
ABA Opinion 512 prohibits sharing confidential data with third-party AI providers. Local inference via Ollama creates a hard technical guarantee — document text never leaves the machine.

### Why AES-256-GCM instead of FHE for file content?
FHE is 1000-10000x slower than AES for bulk data encryption. Files are encrypted with AES (fast, proven). FHE is used where it uniquely matters: the access control layer where encrypted computation (comparison, conditional logic) is needed.

### Why Ethereum Sepolia instead of Arbitrum/Base?
CoFHE is deployed on multiple testnets. Sepolia was chosen for direct Etherscan verification and the widest tooling support (Hardhat, wagmi, Infura).

### Why pnpm instead of npm?
The official `cofhe-hardhat-starter` uses pnpm. The `@cofhe/*` v0.4.x packages have peer dependency conflicts that `npm --legacy-peer-deps` doesn't resolve correctly, but pnpm handles cleanly.

### Why `@cofhe/sdk` directly instead of `@cofhe/react`?
`@cofhe/react` v0.3.1 is version-mismatched with `@cofhe/sdk` v0.4.0 and pulls in MUI, emotion, and recharts — adding ~2MB of dependencies, causing SSR build crashes, and inflating the dashboard bundle to 600KB. Top-scoring buildathon projects (Blank, BATNA) either bypass `@cofhe/react` or never used it. Custos uses `@cofhe/sdk` directly via a lightweight React context (`lib/cofhe-context.tsx`), reducing the dashboard bundle to 279KB.

### Why RainbowKit instead of injected-only wallet?
The `injected()` connector only supports MetaMask. RainbowKit provides a polished wallet selection modal supporting MetaMask, Coinbase Wallet, WalletConnect, Rainbow, and more — matching the UX standard of top Fhenix buildathon projects (BATNA scored UX: 8 with RainbowKit).

### Why manual gas limits (5M) on FHE transactions?
FHE operations use a CoFHE precompile that isn't available during `eth_estimateGas` simulation. Without explicit gas limits, transactions may fail silently. The 5M gas limit is the pattern established by Blank (16 contracts, 28 FHE operations) and is sufficient for all DocumentVault operations.

---

## License

MIT
