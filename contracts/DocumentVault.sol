// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title DocumentVault
/// @notice Privacy-native document access control using Fully Homomorphic Encryption.
/// @dev All sensitive metadata (owner identity, access expiry, access results) are
///      stored encrypted on-chain. Document contents are stored off-chain on IPFS
///      (AES-256-GCM encrypted) and are never exposed to any server in plaintext.
///
///      Privacy guarantees:
///      - Document owner identity: eaddress (FHE-encrypted)
///      - Access grant expiry: euint64 (FHE-encrypted)
///      - Access check results: ebool (FHE-encrypted, only caller can decrypt)
///      - AI query audit: ebool (FHE-encrypted, proves authorization without revealing query)
contract DocumentVault {

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct DocRecord {
        euint64 uploadedAt;     // encrypted upload timestamp
        eaddress owner;         // encrypted owner address
        bytes32 ipfsCid;        // IPFS CID of AES-encrypted file blob (public — ciphertext is safe)
        bytes encryptedKey;     // AES-256-GCM key, encrypted for owner's wallet
        bool exists;            // existence flag (public — just bool)
    }

    struct GrantRecord {
        bytes encryptedKey;     // AES key re-encrypted for grantee's wallet
        bool exists;            // whether a key has been provided
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev docId → document record (all sensitive fields encrypted)
    mapping(bytes32 => DocRecord) private _docs;

    /// @dev docId → grantee address → encrypted access expiry (euint64)
    ///      Value 0 = no access. Value > block.timestamp = active access.
    mapping(bytes32 => mapping(address => euint64)) private _accessExpiry;

    /// @dev docId → grantee address → re-encrypted AES key for grantee
    mapping(bytes32 => mapping(address => GrantRecord)) private _grantKeys;

    /// @dev docId → queryHash → encrypted authorization result (ebool)
    ///      Proves an AI query was authorized without revealing query content.
    mapping(bytes32 => mapping(bytes32 => ebool)) private _queryAudit;

    /// @dev docId → user → last access check result (ebool).
    ///      Stored so the result can be read back via view getter after tx commits.
    mapping(bytes32 => mapping(address => ebool)) private _lastAccessResult;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a document is registered. Only docId and CID are public.
    event DocumentRegistered(bytes32 indexed docId, bytes32 ipfsCid);

    /// @notice Emitted when access is granted. Expiry is NOT emitted (encrypted).
    event AccessGranted(bytes32 indexed docId, address indexed grantee);

    /// @notice Emitted when access is revoked.
    event AccessRevoked(bytes32 indexed docId, address indexed grantee);

    /// @notice Emitted when an AI query is logged. Query content is NOT emitted.
    event QueryLogged(bytes32 indexed docId, bytes32 indexed queryHash);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error DocumentAlreadyExists(bytes32 docId);
    error DocumentNotFound(bytes32 docId);
    error NotDocumentOwner();
    error InvalidIpfsCid();
    error InvalidGrantee();

    // ─────────────────────────────────────────────────────────────────────────
    // Document Registration
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register an encrypted document on-chain.
    /// @dev The document file is stored on IPFS (AES-256-GCM encrypted by the client).
    ///      The IPFS CID is safe to store publicly — the blob is ciphertext.
    ///      Owner identity and upload timestamp are stored FHE-encrypted.
    ///
    /// @param docId       Unique document identifier (e.g. keccak256(fileName + userAddress + nonce))
    /// @param encTimestamp FHE-encrypted upload timestamp (InEuint64 from client SDK)
    /// @param encOwner    FHE-encrypted owner address (InEaddress from client SDK)
    /// @param ipfsCid     IPFS CID of the AES-encrypted document blob
    /// @param encryptedKey AES-256-GCM key encrypted for the owner's wallet public key
    function registerDocument(
        bytes32 docId,
        InEuint64 calldata encTimestamp,
        InEaddress calldata encOwner,
        bytes32 ipfsCid,
        bytes calldata encryptedKey
    ) external {
        if (_docs[docId].exists) revert DocumentAlreadyExists(docId);
        if (ipfsCid == bytes32(0)) revert InvalidIpfsCid();

        // Convert client-encrypted inputs to on-chain FHE values
        euint64 uploadedAt = FHE.asEuint64(encTimestamp);
        eaddress owner = FHE.asEaddress(encOwner);

        // Grant the contract and the caller (owner) FHE access to their encrypted values
        FHE.allowThis(uploadedAt);
        FHE.allow(uploadedAt, msg.sender);

        FHE.allowThis(owner);
        FHE.allow(owner, msg.sender);

        _docs[docId] = DocRecord({
            uploadedAt: uploadedAt,
            owner: owner,
            ipfsCid: ipfsCid,
            encryptedKey: encryptedKey,
            exists: true
        });

        emit DocumentRegistered(docId, ipfsCid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Access Grant / Revoke
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Grant time-bounded access to a grantee.
    /// @dev Access expiry is stored FHE-encrypted. Nobody can determine when access expires
    ///      by observing on-chain state — not even the Fhenix team.
    ///      The AES key is re-encrypted for the grantee's wallet and stored separately.
    ///
    /// @param docId        Document identifier
    /// @param grantee      Address to grant access to
    /// @param encExpiry    FHE-encrypted Unix timestamp for when access expires
    /// @param granteeEncKey AES key re-encrypted for grantee's wallet public key
    function grantAccess(
        bytes32 docId,
        address grantee,
        InEuint64 calldata encExpiry,
        bytes calldata granteeEncKey
    ) external {
        if (!_docs[docId].exists) revert DocumentNotFound(docId);
        if (grantee == address(0)) revert InvalidGrantee();

        euint64 expiry = FHE.asEuint64(encExpiry);

        // Contract needs to use this value in future checkAccess calls
        FHE.allowThis(expiry);
        // Grantee can decrypt their own expiry (for UI display)
        FHE.allow(expiry, grantee);

        _accessExpiry[docId][grantee] = expiry;
        _grantKeys[docId][grantee] = GrantRecord({ encryptedKey: granteeEncKey, exists: true });

        emit AccessGranted(docId, grantee);
    }

    /// @notice Revoke access by overwriting expiry with encrypted zero.
    /// @dev FHE.gt(0, block.timestamp) will always return false →
    ///      checkAccess will return encrypted false for revoked grantees.
    ///
    /// @param docId   Document identifier
    /// @param grantee Address whose access is being revoked
    function revokeAccess(bytes32 docId, address grantee) external {
        if (!_docs[docId].exists) revert DocumentNotFound(docId);

        // Overwrite with encrypted 0 — any timestamp > 0, so access is permanently denied
        euint64 zero = FHE.asEuint64(uint64(0));
        FHE.allowThis(zero);
        FHE.allow(zero, grantee);

        _accessExpiry[docId][grantee] = zero;

        // Clear grant key
        delete _grantKeys[docId][grantee];

        emit AccessRevoked(docId, grantee);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Access Check (FHE Computation)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Check if the caller currently has access to a document.
    /// @dev Returns an encrypted boolean (ebool). The result is ONLY decryptable
    ///      by msg.sender — no other address can read whether they have access.
    ///
    ///      The FHE computation: isActive = expiry > block.timestamp
    ///      This runs entirely in encrypted domain — no plaintext expiry revealed.
    ///
    ///      NOTE: FHE operations (asEuint64, gt, allowSender) cannot be view —
    ///      they register ciphertext handles in the CoFHE coprocessor state.
    ///
    /// @param docId Document identifier
    /// @return isActive Encrypted boolean — caller must use cofhe SDK to decrypt
    function checkAccess(bytes32 docId) external returns (ebool) {
        // No revert on non-existent document — side-channel resistance.
        // If document doesn't exist, _accessExpiry defaults to zero euint64.
        // FHE.gt(0, block.timestamp) naturally returns encrypted false.
        // This prevents leaking whether a document ID is registered.

        euint64 expiry = _accessExpiry[docId][msg.sender];
        euint64 now64 = FHE.asEuint64(uint64(block.timestamp));

        // FHE comparison: isActive = expiry > now
        // - If no grant exists: expiry = default euint64 (0), result = false
        // - If revoked: expiry = 0, result = false
        // - If expired: expiry < now, result = false
        // - If active: expiry > now, result = true
        ebool isActive = FHE.gt(expiry, now64);

        // ONLY the requester can decrypt this result; contract stores for getter
        FHE.allowSender(isActive);
        FHE.allowThis(isActive);

        // Store so result can be read back via getLastAccessResult()
        _lastAccessResult[docId][msg.sender] = isActive;

        return isActive;
    }

    /// @notice Get the last stored access check result for a given user.
    /// @dev Read after calling checkAccess() to inspect the committed ebool.
    /// @param docId Document identifier
    /// @param user Address to check
    /// @return ebool ciphertext hash
    function getLastAccessResult(bytes32 docId, address user) external view returns (ebool) {
        return _lastAccessResult[docId][user];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AI Query Audit Log (FHE)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Log that an AI query was made and record encrypted authorization result.
    /// @dev Stores an encrypted boolean proving the query was authorized at query time.
    ///      Auditors can verify the log exists without reading query content or results.
    ///      The queryHash is a keccak256 of (query text + timestamp) — opaque on-chain.
    ///
    /// @param docId     Document the query was made against
    /// @param queryHash keccak256(query + timestamp) — content hidden, uniqueness proven
    /// @return wasAuthorized Encrypted bool — caller can decrypt to confirm authorization
    function logQueryAuth(bytes32 docId, bytes32 queryHash) external returns (ebool) {
        // No revert — side-channel resistance (same pattern as checkAccess)

        // Recompute access check (non-view version for state write)
        euint64 expiry = _accessExpiry[docId][msg.sender];
        euint64 now64 = FHE.asEuint64(uint64(block.timestamp));
        ebool wasAuthorized = FHE.gt(expiry, now64);

        FHE.allowThis(wasAuthorized);
        FHE.allow(wasAuthorized, msg.sender);

        _queryAudit[docId][queryHash] = wasAuthorized;

        emit QueryLogged(docId, queryHash);

        return wasAuthorized;
    }

    /// @notice Get the stored query authorization result.
    /// @dev Read after calling logQueryAuth() to inspect the committed ebool.
    /// @param docId Document identifier
    /// @param queryHash keccak256 hash of the query
    /// @return ebool ciphertext hash of the authorization result
    function getQueryAudit(bytes32 docId, bytes32 queryHash) external view returns (ebool) {
        return _queryAudit[docId][queryHash];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Get public document info (CID only — all sensitive fields remain encrypted).
    /// @param docId Document identifier
    /// @return ipfsCid IPFS CID of the encrypted blob (safe to expose — blob is ciphertext)
    /// @return exists Whether the document exists
    function getDocument(bytes32 docId) external view returns (bytes32 ipfsCid, bool exists) {
        DocRecord storage doc = _docs[docId];
        return (doc.ipfsCid, doc.exists);
    }

    /// @notice Get the encrypted upload timestamp for a document.
    /// @dev Caller must have FHE permit to decrypt. Permitted via FHE.allow() in registerDocument.
    /// @param docId Document identifier
    /// @return Encrypted timestamp (euint64 ciphertext hash)
    function getUploadedAt(bytes32 docId) external view returns (euint64) {
        if (!_docs[docId].exists) revert DocumentNotFound(docId);
        return _docs[docId].uploadedAt;
    }

    /// @notice Get the AES key for a granted document (for grantees).
    /// @dev Returns the AES key re-encrypted for the caller's wallet.
    ///      Returns empty bytes if no grant exists.
    /// @param docId Document identifier
    /// @return encryptedKey AES key encrypted for caller's wallet, or empty bytes
    function getGrantKey(bytes32 docId) external view returns (bytes memory encryptedKey) {
        GrantRecord storage grant = _grantKeys[docId][msg.sender];
        if (!grant.exists) return new bytes(0);
        return grant.encryptedKey;
    }

    /// @notice Get the owner's AES key for their own document.
    /// @param docId Document identifier
    /// @return encryptedKey AES key encrypted for owner's wallet
    function getOwnerKey(bytes32 docId) external view returns (bytes memory encryptedKey) {
        if (!_docs[docId].exists) revert DocumentNotFound(docId);
        return _docs[docId].encryptedKey;
    }

    /// @notice Check if a specific document ID exists.
    /// @param docId Document identifier
    /// @return true if document is registered
    function documentExists(bytes32 docId) external view returns (bool) {
        return _docs[docId].exists;
    }
}
