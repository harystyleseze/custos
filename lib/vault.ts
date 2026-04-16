/**
 * DocumentVault contract bindings.
 * Typed interface for all contract interactions.
 */

export const VAULT_ABI = [
    // Document Registration
    {
        name: 'registerDocument',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'docId', type: 'bytes32' },
            { name: 'encTimestamp', type: 'tuple', components: [
                { name: 'ctHash', type: 'uint256' },
                { name: 'securityZone', type: 'uint8' },
                { name: 'utype', type: 'uint8' },
                { name: 'signature', type: 'bytes' },
            ]},
            { name: 'encOwner', type: 'tuple', components: [
                { name: 'ctHash', type: 'uint256' },
                { name: 'securityZone', type: 'uint8' },
                { name: 'utype', type: 'uint8' },
                { name: 'signature', type: 'bytes' },
            ]},
            { name: 'ipfsCid', type: 'bytes32' },
            { name: 'encryptedKey', type: 'bytes' },
        ],
        outputs: [],
    },
    // Grant Access
    {
        name: 'grantAccess',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'docId', type: 'bytes32' },
            { name: 'grantee', type: 'address' },
            { name: 'encExpiry', type: 'tuple', components: [
                { name: 'ctHash', type: 'uint256' },
                { name: 'securityZone', type: 'uint8' },
                { name: 'utype', type: 'uint8' },
                { name: 'signature', type: 'bytes' },
            ]},
            { name: 'granteeEncKey', type: 'bytes' },
        ],
        outputs: [],
    },
    // Revoke Access
    {
        name: 'revokeAccess',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'docId', type: 'bytes32' },
            { name: 'grantee', type: 'address' },
        ],
        outputs: [],
    },
    // Check Access (returns ebool ciphertext hash)
    {
        name: 'checkAccess',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [{ name: 'isActive', type: 'uint256' }],  // ebool is represented as ctHash (uint256)
    },
    // Log AI Query
    {
        name: 'logQueryAuth',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'docId', type: 'bytes32' },
            { name: 'queryHash', type: 'bytes32' },
        ],
        outputs: [{ name: 'wasAuthorized', type: 'uint256' }],
    },
    // Read Functions
    {
        name: 'getDocument',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [
            { name: 'ipfsCid', type: 'bytes32' },
            { name: 'exists', type: 'bool' },
        ],
    },
    {
        name: 'getUploadedAt',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [{ name: '', type: 'uint256' }],  // euint64 ctHash
    },
    {
        name: 'getGrantKey',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [{ name: 'encryptedKey', type: 'bytes' }],
    },
    {
        name: 'getOwnerKey',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [{ name: 'encryptedKey', type: 'bytes' }],
    },
    {
        name: 'documentExists',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [{ name: '', type: 'bool' }],
    },
    // Events
    {
        name: 'DocumentRegistered',
        type: 'event',
        inputs: [
            { name: 'docId', type: 'bytes32', indexed: true },
            { name: 'ipfsCid', type: 'bytes32', indexed: false },
        ],
    },
    {
        name: 'AccessGranted',
        type: 'event',
        inputs: [
            { name: 'docId', type: 'bytes32', indexed: true },
            { name: 'grantee', type: 'address', indexed: true },
        ],
    },
    {
        name: 'AccessRevoked',
        type: 'event',
        inputs: [
            { name: 'docId', type: 'bytes32', indexed: true },
            { name: 'grantee', type: 'address', indexed: true },
        ],
    },
    {
        name: 'QueryLogged',
        type: 'event',
        inputs: [
            { name: 'docId', type: 'bytes32', indexed: true },
            { name: 'queryHash', type: 'bytes32', indexed: true },
        ],
    },
] as const

export const VAULT_ADDRESS = (
    process.env.NEXT_PUBLIC_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000'
) as `0x${string}`

export const SEPOLIA_CHAIN_ID = 11155111
