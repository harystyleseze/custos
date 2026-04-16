import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`

// Minimal ABI for read functions only
const READ_ABI = [
    {
        name: 'getOwnerKey',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [{ name: 'encryptedKey', type: 'bytes' }],
    },
    {
        name: 'getGrantKey',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [{ name: 'encryptedKey', type: 'bytes' }],
    },
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
        name: 'documentExists',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'docId', type: 'bytes32' }],
        outputs: [{ type: 'bool' }],
    },
] as const

const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com'),
})

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const fn = searchParams.get('fn')
    const docId = searchParams.get('docId') as `0x${string}`

    if (!fn || !docId) {
        return NextResponse.json({ error: 'Missing fn or docId' }, { status: 400 })
    }

    try {
        if (fn === 'getOwnerKey') {
            const key = await client.readContract({
                address: VAULT_ADDRESS,
                abi: READ_ABI,
                functionName: 'getOwnerKey',
                args: [docId],
            })
            return NextResponse.json({ key: key as string })
        }

        if (fn === 'getGrantKey') {
            // Note: getGrantKey uses msg.sender on-chain, so this server-side call
            // won't work for checking a specific user's grant key.
            // For the demo, we return the owner key as fallback.
            const key = await client.readContract({
                address: VAULT_ADDRESS,
                abi: READ_ABI,
                functionName: 'getOwnerKey',
                args: [docId],
            })
            return NextResponse.json({ key: key as string })
        }

        if (fn === 'getDocument') {
            const [ipfsCid, exists] = await client.readContract({
                address: VAULT_ADDRESS,
                abi: READ_ABI,
                functionName: 'getDocument',
                args: [docId],
            })
            return NextResponse.json({ ipfsCid, exists })
        }

        if (fn === 'documentExists') {
            const exists = await client.readContract({
                address: VAULT_ADDRESS,
                abi: READ_ABI,
                functionName: 'documentExists',
                args: [docId],
            })
            return NextResponse.json({ exists })
        }

        return NextResponse.json({ error: `Unknown function: ${fn}` }, { status: 400 })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
}
