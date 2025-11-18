import { ethers } from 'ethers';
import { logger } from '../utils/logger';

// ABI for the BadgeSBT contract
const BADGE_SBT_ABI = [
  "function mintBadge(address to, uint256 badgeTypeId) external returns (uint256)",
  "function batchMintBadges(address[] calldata recipients, uint256 badgeTypeId) external",
  "function hasBadge(address wallet, uint256 badgeTypeId) external view returns (bool)",
  "function getWalletBadges(address wallet) external view returns (uint256[] memory)",
  "function tokenURI(uint256 tokenId) external view returns (string memory)",
  "function owner() external view returns (address)",
  "event BadgeMinted(uint256 indexed tokenId, uint256 indexed badgeTypeId, address indexed to, address mintedBy)"
];

interface MintResult {
  tokenId: number;
  transactionHash: string;
  blockNumber: number;
  contractAddress: string;
  gasUsed: bigint;
}

export class Web3Service {
  private provider?: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private contract?: ethers.Contract;
  private isConfigured: boolean = false;
  
  constructor() {
    try {
      const rpcUrl = this.getRpcUrl();
      const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
      const contractAddress = process.env.CONTRACT_ADDRESS;
      
      if (!rpcUrl || !privateKey || !contractAddress) {
        logger.warn('Web3 configuration incomplete - using mock mode');
        return;
      }
      
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.contract = new ethers.Contract(contractAddress, BADGE_SBT_ABI, this.wallet);
      this.isConfigured = true;
      
      logger.info(`Web3 service initialized for contract: ${contractAddress}`);
    } catch (error) {
      logger.error('Web3 service initialization failed:', error);
    }
  }

  async mintBadge(to: string, badgeTypeId: number): Promise<MintResult> {
    // If not configured, return mock data for development
    if (!this.isConfigured || !this.contract) {
      return this.mockMintBadge(to, badgeTypeId);
    }

    try {
      logger.info(`Minting badge type ${badgeTypeId} for ${to}`);
      
      // Estimate gas first
      const gasEstimate = await this.contract.mintBadge.estimateGas(to, badgeTypeId);
      
      // Execute mint with 20% extra gas
      const tx = await this.contract.mintBadge(to, badgeTypeId, {
        gasLimit: gasEstimate * 120n / 100n
      });
      
      logger.info(`Mint transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (!receipt) {
        throw new Error('Transaction receipt not available');
      }
      
      // Find the BadgeMinted event to get tokenId
      const event = receipt.logs.find((log: any) => {
        try {
          const parsedLog = this.contract!.interface.parseLog(log);
          return parsedLog?.name === 'BadgeMinted';
        } catch {
          return false;
        }
      });
      
      let tokenId: number;
      if (event) {
        const parsedEvent = this.contract!.interface.parseLog(event);
        tokenId = Number(parsedEvent?.args.tokenId);
      } else {
        // Fallback: use a generated token ID
        tokenId = Date.now() % 1000000;
      }
      
      const result: MintResult = {
        tokenId,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        contractAddress: await this.contract.getAddress(),
        gasUsed: receipt.gasUsed
      };
      
      logger.info(`Badge minted successfully: Token ${tokenId} for ${to}`);
      return result;
      
    } catch (error) {
      logger.error('Web3 mint failed:', error);
      throw new Error(`Blockchain operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async hasBadge(wallet: string, badgeTypeId: number): Promise<boolean> {
    if (!this.isConfigured || !this.contract) {
      // Mock response for development
      return Math.random() > 0.5;
    }

    try {
      return await this.contract.hasBadge(wallet, badgeTypeId);
    } catch (error) {
      logger.error('Check badge ownership failed:', error);
      return false;
    }
  }

  async getWalletBadges(wallet: string): Promise<number[]> {
    if (!this.isConfigured || !this.contract) {
      // Mock response for development
      return [1, 2, 3].filter(() => Math.random() > 0.7);
    }

    try {
      const tokenIds = await this.contract.getWalletBadges(wallet);
      return tokenIds.map((id: bigint) => Number(id));
    } catch (error) {
      logger.error('Get wallet badges failed:', error);
      return [];
    }
  }

  async getTransactionReceipt(transactionHash: string): Promise<ethers.TransactionReceipt | null> {
    if (!this.isConfigured || !this.provider) return null;
    
    return this.provider.getTransactionReceipt(transactionHash);
  }

  private getRpcUrl(): string {
    const chainId = process.env.DEFAULT_CHAIN_ID || '31337';
    const rpcUrls: { [key: string]: string } = {
      '1': process.env.ETHEREUM_RPC_URL || '',
      '11155111': process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.public.blastapi.io',
      '137': process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
      '80001': process.env.MUMBAI_RPC_URL || 'https://rpc-mumbai.maticvigil.com',
      '31337': 'http://localhost:8545' // Hardhat local network
    };
    
    return rpcUrls[chainId] || rpcUrls['31337'];
  }

  private mockMintBadge(to: string, badgeTypeId: number): MintResult {
    logger.info(`Mock minting badge type ${badgeTypeId} for ${to}`);
    
    // Generate deterministic mock data based on input
    const mockTokenId = Math.abs(
      to.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0)
    ) % 1000000 + 1;
    
    return {
      tokenId: mockTokenId,
      transactionHash: '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join(''),
      blockNumber: Math.floor(Math.random() * 10000) + 1,
      contractAddress: process.env.CONTRACT_ADDRESS || '0xMockContractAddress',
      gasUsed: BigInt(50000 + Math.floor(Math.random() * 100000))
    };
  }
}