import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { saveDeployment } from './utils'

task('deploy-vault', 'Deploy DocumentVault to the selected network').setAction(
    async (_, hre: HardhatRuntimeEnvironment) => {
        const { ethers, network } = hre

        console.log(`\nDeploying DocumentVault to ${network.name}...`)

        const [deployer] = await ethers.getSigners()
        console.log(`Deployer: ${deployer.address}`)

        const balance = await ethers.provider.getBalance(deployer.address)
        console.log(`Balance: ${ethers.formatEther(balance)} ETH`)

        const DocumentVault = await ethers.getContractFactory('DocumentVault')
        const vault = await DocumentVault.deploy()
        await vault.waitForDeployment()

        const vaultAddress = await vault.getAddress()
        console.log(`\nDocumentVault deployed to: ${vaultAddress}`)
        console.log(`Network: ${network.name} (chainId: ${network.config.chainId})`)

        saveDeployment(network.name, 'DocumentVault', vaultAddress)

        console.log(`\nNext steps:`)
        console.log(`1. Add to .env: NEXT_PUBLIC_VAULT_ADDRESS=${vaultAddress}`)
        console.log(`2. Verify: npx hardhat verify --network ${network.name} ${vaultAddress}`)
        console.log(`3. View on Etherscan: https://sepolia.etherscan.io/address/${vaultAddress}`)

        return vaultAddress
    }
)
