import { HardhatUserConfig, task } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-ethers'
import '@cofhe/hardhat-plugin'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

// ─────────────────────────────────────────────────────────────────────────────
// Deployment helpers (inlined to avoid module resolution issues)
// ─────────────────────────────────────────────────────────────────────────────

const DEPLOYMENTS_DIR = path.join(__dirname, 'deployments')
if (!fs.existsSync(DEPLOYMENTS_DIR)) fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true })

function saveDeployment(network: string, contractName: string, address: string) {
    const filePath = path.join(DEPLOYMENTS_DIR, `${network}.json`)
    const deployments: Record<string, string> = fs.existsSync(filePath)
        ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
        : {}
    deployments[contractName] = address
    fs.writeFileSync(filePath, JSON.stringify(deployments, null, 2))
    console.log(`Saved to ${filePath}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

task('deploy-vault', 'Deploy DocumentVault to the selected network').setAction(async (_, hre) => {
    const { ethers, network } = hre
    console.log(`\nDeploying DocumentVault to ${network.name}...`)
    const [deployer] = await ethers.getSigners()
    console.log(`Deployer: ${deployer.address}`)
    const bal = await ethers.provider.getBalance(deployer.address)
    console.log(`Balance: ${ethers.formatEther(bal)} ETH`)

    const DocumentVault = await ethers.getContractFactory('DocumentVault')
    const vault = await DocumentVault.deploy()
    await vault.waitForDeployment()
    const addr = await vault.getAddress()

    console.log(`\nDocumentVault deployed to: ${addr}`)
    saveDeployment(network.name, 'DocumentVault', addr)

    console.log(`\nNext: set NEXT_PUBLIC_VAULT_ADDRESS=${addr} in .env`)
    console.log(`Verify: pnpm ${network.name}:verify ${addr}`)
    return addr
})

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.25',
        settings: {
            evmVersion: 'cancun',    // REQUIRED for CoFHE (transient storage opcodes)
            optimizer: { enabled: true, runs: 200 },
        },
    },
    defaultNetwork: 'hardhat',
    networks: {
        'eth-sepolia': {
            url: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com',
            accounts: process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length >= 64 ? [process.env.PRIVATE_KEY] : [],
            chainId: 11155111,
            gasMultiplier: 1.2,
            timeout: 60000,
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || '',
    },
}

export default config
