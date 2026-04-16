import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import { Encryptable, FheTypes } from '@cofhe/sdk'
import { ethers } from 'hardhat'

const TASK_COFHE_MOCKS_DEPLOY = 'task:cofhe-mocks:deploy'

// Helper to create a docId from a string
const makeDocId = (name: string): string => ethers.keccak256(ethers.toUtf8Bytes(name))

// Sample IPFS CID (as bytes32 — 32-byte hash)
const SAMPLE_CID = ethers.keccak256(ethers.toUtf8Bytes('QmSampleIpfsCid'))

// Sample encrypted AES key (64 bytes placeholder)
const SAMPLE_ENC_KEY = ethers.hexlify(ethers.randomBytes(64))

// 24 hours in seconds
const ONE_DAY = 86400n

describe('DocumentVault', function () {
    // ─────────────────────────────────────────────────────────────
    // Fixture — deploy contract + init CoFHE client (v0.4.x API)
    // ─────────────────────────────────────────────────────────────

    async function deployVaultFixture() {
        // Deploy CoFHE mock contracts (required in v0.4.x)
        await hre.run(TASK_COFHE_MOCKS_DEPLOY)

        const [deployer, alice, bob, charlie] = await hre.ethers.getSigners()

        const DocumentVault = await hre.ethers.getContractFactory('DocumentVault')
        const vault = await DocumentVault.connect(deployer).deploy()
        await vault.waitForDeployment()

        // Create CoFHE client with batteries (v0.4.x API)
        const client = await hre.cofhe.createClientWithBatteries(alice)

        return { vault, deployer, alice, bob, charlie, client }
    }

    // ─────────────────────────────────────────────────────────────
    // Document Registration
    // ─────────────────────────────────────────────────────────────

    describe('registerDocument', function () {
        it('should register a document with FHE-encrypted metadata', async function () {
            const { vault, alice, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('alice-contract-001')
            const now = BigInt(Math.floor(Date.now() / 1000))

            // Encrypt timestamp and owner address (v0.4.x: client.encryptInputs().execute())
            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()

            // Register document
            await vault.connect(alice).registerDocument(
                docId,
                encTimestamp,
                encOwner,
                SAMPLE_CID,
                SAMPLE_ENC_KEY
            )

            // Document should now exist
            const [returnedCid, exists] = await vault.getDocument(docId)
            expect(exists).to.equal(true)
            expect(returnedCid).to.equal(SAMPLE_CID)
        })

        it('should revert if document already exists', async function () {
            const { vault, alice, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('alice-duplicate')
            const now = BigInt(Math.floor(Date.now() / 1000))

            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()

            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            // Second registration should revert
            const [encTimestamp2, encOwner2] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()

            await expect(
                vault.connect(alice).registerDocument(docId, encTimestamp2, encOwner2, SAMPLE_CID, SAMPLE_ENC_KEY)
            ).to.be.revertedWithCustomError(vault, 'DocumentAlreadyExists')
        })

        it('should revert if IPFS CID is zero', async function () {
            const { vault, alice, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('alice-zero-cid')
            const now = BigInt(Math.floor(Date.now() / 1000))

            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()

            await expect(
                vault.connect(alice).registerDocument(
                    docId,
                    encTimestamp,
                    encOwner,
                    ethers.ZeroHash,
                    SAMPLE_ENC_KEY
                )
            ).to.be.revertedWithCustomError(vault, 'InvalidIpfsCid')
        })
    })

    // ─────────────────────────────────────────────────────────────
    // Access Grant
    // ─────────────────────────────────────────────────────────────

    describe('grantAccess', function () {
        it('should grant encrypted time-bounded access to a grantee', async function () {
            const { vault, alice, bob, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('alice-nda')
            const now = BigInt(Math.floor(Date.now() / 1000))
            const expiry = now + ONE_DAY

            // Register document as alice
            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            // Grant access to bob with encrypted expiry
            const [encExpiry] = await client
                .encryptInputs([Encryptable.uint64(expiry)])
                .execute()

            await vault.connect(alice).grantAccess(docId, bob.address, encExpiry, SAMPLE_ENC_KEY)

            // Verify grant key is stored for bob
            const grantKey = await vault.connect(bob).getGrantKey(docId)
            expect(grantKey).to.equal(SAMPLE_ENC_KEY)
        })

        it('should revert if document does not exist', async function () {
            const { vault, alice, bob, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('nonexistent')
            const expiry = BigInt(Math.floor(Date.now() / 1000)) + ONE_DAY

            const [encExpiry] = await client
                .encryptInputs([Encryptable.uint64(expiry)])
                .execute()

            await expect(
                vault.connect(alice).grantAccess(docId, bob.address, encExpiry, SAMPLE_ENC_KEY)
            ).to.be.revertedWithCustomError(vault, 'DocumentNotFound')
        })

        it('should revert if grantee is zero address', async function () {
            const { vault, alice, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('alice-nda-2')
            const now = BigInt(Math.floor(Date.now() / 1000))
            const expiry = now + ONE_DAY

            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            const [encExpiry] = await client
                .encryptInputs([Encryptable.uint64(expiry)])
                .execute()

            await expect(
                vault.connect(alice).grantAccess(docId, ethers.ZeroAddress, encExpiry, SAMPLE_ENC_KEY)
            ).to.be.revertedWithCustomError(vault, 'InvalidGrantee')
        })
    })

    // ─────────────────────────────────────────────────────────────
    // Access Check (Core FHE Logic)
    // ─────────────────────────────────────────────────────────────

    describe('checkAccess — FHE gt() comparison', function () {
        it('should return encrypted false for address with no grant', async function () {
            const { vault, alice, charlie, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('access-check-no-grant')
            const now = BigInt(Math.floor(Date.now() / 1000))

            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            // Charlie has no grant — checkAccess should return encrypted false
            await vault.connect(charlie).checkAccess(docId)
            const isActiveHash = await vault.getLastAccessResult(docId, charlie.address)

            // In mock environment, verify the plaintext is 0 (false)
            await hre.cofhe.mocks.expectPlaintext(isActiveHash, 0n)
        })

        it('should return encrypted true for address with active grant', async function () {
            const { vault, alice, bob, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('access-check-active-grant')
            const now = BigInt(Math.floor(Date.now() / 1000))
            const expiry = now + BigInt(365 * 24 * 3600)  // 1 year

            // Register
            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            // Grant bob access for 1 year
            const [encExpiry] = await client
                .encryptInputs([Encryptable.uint64(expiry)])
                .execute()
            await vault.connect(alice).grantAccess(docId, bob.address, encExpiry, SAMPLE_ENC_KEY)

            // Bob checks access — should return encrypted true
            await vault.connect(bob).checkAccess(docId)
            const isActiveHash = await vault.getLastAccessResult(docId, bob.address)
            await hre.cofhe.mocks.expectPlaintext(isActiveHash, 1n)
        })

        it('should return encrypted false after revocation', async function () {
            const { vault, alice, bob, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('access-check-revoked')
            const now = BigInt(Math.floor(Date.now() / 1000))
            const expiry = now + BigInt(365 * 24 * 3600)

            // Register
            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            // Grant
            const [encExpiry] = await client
                .encryptInputs([Encryptable.uint64(expiry)])
                .execute()
            await vault.connect(alice).grantAccess(docId, bob.address, encExpiry, SAMPLE_ENC_KEY)

            // Confirm active
            await vault.connect(bob).checkAccess(docId)
            const isActiveBefore = await vault.getLastAccessResult(docId, bob.address)
            await hre.cofhe.mocks.expectPlaintext(isActiveBefore, 1n)

            // Revoke
            await vault.connect(alice).revokeAccess(docId, bob.address)

            // Confirm revoked
            await vault.connect(bob).checkAccess(docId)
            const isActiveAfter = await vault.getLastAccessResult(docId, bob.address)
            await hre.cofhe.mocks.expectPlaintext(isActiveAfter, 0n)

            // Grant key should be gone
            const grantKey = await vault.connect(bob).getGrantKey(docId)
            expect(grantKey).to.equal('0x')
        })
    })

    // ─────────────────────────────────────────────────────────────
    // AI Query Audit
    // ─────────────────────────────────────────────────────────────

    describe('logQueryAuth', function () {
        it('should log encrypted authorization for an AI query by authorized user', async function () {
            const { vault, alice, bob, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('ai-query-test')
            const now = BigInt(Math.floor(Date.now() / 1000))
            const expiry = now + BigInt(365 * 24 * 3600)

            // Register + grant
            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            const [encExpiry] = await client
                .encryptInputs([Encryptable.uint64(expiry)])
                .execute()
            await vault.connect(alice).grantAccess(docId, bob.address, encExpiry, SAMPLE_ENC_KEY)

            // Bob logs an AI query
            const queryHash = ethers.keccak256(ethers.toUtf8Bytes('what is the payment amount?' + Date.now()))
            await vault.connect(bob).logQueryAuth(docId, queryHash)
            const wasAuthorizedHash = await vault.getQueryAudit(docId, queryHash)

            // Should be authorized (encrypted true)
            await hre.cofhe.mocks.expectPlaintext(wasAuthorizedHash, 1n)
        })

        it('should log encrypted false for AI query by unauthorized user', async function () {
            const { vault, alice, charlie, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('ai-query-unauth')
            const now = BigInt(Math.floor(Date.now() / 1000))

            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            // Charlie is NOT granted access
            const queryHash = ethers.keccak256(ethers.toUtf8Bytes('unauthorized query'))
            await vault.connect(charlie).logQueryAuth(docId, queryHash)
            const wasAuthorizedHash = await vault.getQueryAudit(docId, queryHash)

            // Should be unauthorized (encrypted false)
            await hre.cofhe.mocks.expectPlaintext(wasAuthorizedHash, 0n)
        })
    })

    // ─────────────────────────────────────────────────────────────
    // Read Functions
    // ─────────────────────────────────────────────────────────────

    describe('Read functions', function () {
        it('should return public CID and existence flag', async function () {
            const { vault, alice, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('read-test')
            const now = BigInt(Math.floor(Date.now() / 1000))

            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            const [cid, exists] = await vault.getDocument(docId)
            expect(cid).to.equal(SAMPLE_CID)
            expect(exists).to.equal(true)
        })

        it('should return owner key for the uploader', async function () {
            const { vault, alice, client } = await loadFixture(deployVaultFixture)

            const docId = makeDocId('owner-key-test')
            const now = BigInt(Math.floor(Date.now() / 1000))

            const [encTimestamp, encOwner] = await client
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(alice.address),
                ])
                .execute()
            await vault.connect(alice).registerDocument(docId, encTimestamp, encOwner, SAMPLE_CID, SAMPLE_ENC_KEY)

            const ownerKey = await vault.connect(alice).getOwnerKey(docId)
            expect(ownerKey).to.equal(SAMPLE_ENC_KEY)
        })

        it('should return false for documentExists on non-existent doc', async function () {
            const { vault } = await loadFixture(deployVaultFixture)
            const docId = makeDocId('does-not-exist')
            expect(await vault.documentExists(docId)).to.equal(false)
        })
    })
})
