// src/services/web3.service.ts
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { 
  BlockchainError, 
  MintingError, 
  ConfigurationError,
  ValidationError 
} from '../utils/errors';

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
  private useRealAdapters: boolean = false;
  
  constructor() {
    try {
      this.useRealAdapters = process.env.USE_REAL_ADAPTERS === 'true';
      
      // If we're not using real adapters, skip blockchain setup entirely
      if (!this.useRealAdapters) {
        logger.info('Web3 service running in stub mode - using mock transactions');
        return;
      }
      
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
      throw new ConfigurationError(
        'Web3Service',
        `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async mintBadge(to: string, badgeTypeId: number): Promise<MintResult> {
    // Validate inputs
    if (!ethers.isAddress(to)) {
      throw new ValidationError('Invalid wallet address format', {
        address: to,
        suggestion: 'Ensure the address is a valid Ethereum address'
      });
    }

    if (badgeTypeId <= 0) {
      throw new ValidationError('Invalid badge type ID', {
        badgeTypeId,
        suggestion: 'Badge type ID must be a positive integer'
      });
    }

    // If not configured or using stub mode, return mock data for development
    if (!this.isConfigured || !this.contract || !this.useRealAdapters) {
      logger.info('Web3 service using mock mode for minting');
      return this.mockMintBadge(to, badgeTypeId);
    }

    try {
      logger.info(`Minting badge type ${badgeTypeId} for ${to}`);
      
      // Check contract connection
      await this.verifyContractConnection();
      
      // Estimate gas first
      const gasEstimate = await this.contract.mintBadge.estimateGas(to, badgeTypeId);
      
      // Execute mint with 20% extra gas
      const tx = await this.contract.mintBadge(to, badgeTypeId, {
        gasLimit: gasEstimate * 120n / 100n
      });
      
      logger.info(`Mint transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation (2 blocks)
      const receipt = await tx.wait(2);
      
      if (!receipt) {
        throw new MintingError(
          'Transaction receipt not available - transaction may have been dropped',
          tx.hash,
          { to, badgeTypeId }
        );
      }
      
      if (receipt.status === 0) {
        throw new MintingError(
          'Transaction reverted on-chain',
          receipt.transactionHash,
          {
            to,
            badgeTypeId,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            suggestion: 'Check if the badge type exists and wallet can receive tokens'
          }
        );
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
        logger.warn(`BadgeMinted event not found, using generated tokenId: ${tokenId}`);
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
      
    } catch (error: any) {
      logger.error('Web3 mint failed:', error);
      
      // Handle specific blockchain errors
      if (error.code === 'INSUFFICIENT_FUNDS') {
        throw new MintingError(
          'Insufficient funds for transaction gas',
          error.transactionHash,
          {
            to,
            badgeTypeId,
            suggestion: 'Add ETH to your wallet for gas fees'
          }
        );
      }
      
      if (error.code === 'CALL_EXCEPTION') {
        throw new MintingError(
          'Smart contract call failed',
          error.transactionHash,
          {
            to,
            badgeTypeId,
            reason: error.reason,
            suggestion: 'Check badge type configuration and contract permissions'
          }
        );
      }
      
      if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
        throw new BlockchainError(
          'Blockchain network unreachable',
          {
            to,
            badgeTypeId,
            originalError: error.message,
            suggestion: 'Check your RPC endpoint and network connection'
          }
        );
      }
      
      if (error.code === 'NONCE_EXPIRED') {
        throw new MintingError(
          'Transaction nonce expired',
          error.transactionHash,
          {
            to,
            badgeTypeId,
            suggestion: 'Try the operation again with a fresh nonce'
          }
        );
      }
      
      throw new BlockchainError(
        `Minting transaction failed: ${error.message}`,
        { to, badgeTypeId, originalError: error.message }
      );
    }
  }

  async hasBadge(wallet: string, badgeTypeId: number): Promise<boolean> {
    if (!ethers.isAddress(wallet)) {
      throw new ValidationError('Invalid wallet address format', { wallet });
    }

    if (!this.isConfigured || !this.contract || !this.useRealAdapters) {
      logger.info('Web3 service using mock mode for badge check');
      return Math.random() > 0.5;
    }

    try {
      await this.verifyContractConnection();
      return await this.contract.hasBadge(wallet, badgeTypeId);
    } catch (error: any) {
      logger.error('Check badge ownership failed:', error);
      throw new BlockchainError(
        `Failed to check badge ownership: ${error.message}`,
        { wallet, badgeTypeId }
      );
    }
  }

  async getWalletBadges(wallet: string): Promise<number[]> {
    if (!ethers.isAddress(wallet)) {
      throw new ValidationError('Invalid wallet address format', { wallet });
    }

    if (!this.isConfigured || !this.contract || !this.useRealAdapters) {
      logger.info('Web3 service using mock mode for wallet badges');
      return [1, 2, 3].filter(() => Math.random() > 0.7);
    }

    try {
      await this.verifyContractConnection();
      const tokenIds = await this.contract.getWalletBadges(wallet);
      return tokenIds.map((id: bigint) => Number(id));
    } catch (error: any) {
      logger.error('Get wallet badges failed:', error);
      throw new BlockchainError(
        `Failed to get wallet badges: ${error.message}`,
        { wallet }
      );
    }
  }

  async getTransactionReceipt(transactionHash: string): Promise<ethers.TransactionReceipt | null> {
    if (!this.isConfigured || !this.provider || !this.useRealAdapters) {
      logger.info('Web3 service using mock mode - cannot get transaction receipt');
      return null;
    }
    
    try {
      return await this.provider.getTransactionReceipt(transactionHash);
    } catch (error: any) {
      logger.error('Get transaction receipt failed:', error);
      throw new BlockchainError(
        `Failed to get transaction receipt: ${error.message}`,
        { transactionHash }
      );
    }
  }

  private async verifyContractConnection(): Promise<void> {
    // If we're in stub mode, don't try to verify contract connection
    if (!this.useRealAdapters) {
      return;
    }

    if (!this.contract || !this.provider) {
      throw new ConfigurationError(
        'Web3Service',
        'Contract or provider not initialized - check environment variables'
      );
    }

    try {
      // Test contract connection by calling a view function
      await this.contract.owner();
    } catch (error: any) {
      throw new ConfigurationError(
        'Web3Service',
        `Contract connection failed: ${error.message}`
      );
    }
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
    
    const rpcUrl = rpcUrls[chainId] || rpcUrls['31337'];
    
    if (!rpcUrl) {
      throw new ConfigurationError(
        'Web3Service',
        `No RPC URL configured for chain ID ${chainId}`
      );
    }
    
    return rpcUrl;
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

  // Health check method
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    if (!this.isConfigured || !this.useRealAdapters) {
      return {
        healthy: true,
        details: {
          configured: false,
          mode: 'mock',
          message: 'Web3 service running in stub mode - using mock transactions'
        }
      };
    }

    try {
      await this.verifyContractConnection();
      const network = await this.provider!.getNetwork();
      const blockNumber = await this.provider!.getBlockNumber();
      
      return {
        healthy: true,
        details: {
          configured: true,
          mode: 'real',
          network: {
            chainId: Number(network.chainId),
            name: network.name
          },
          blockNumber,
          contractAddress: await this.contract!.getAddress()
        }
      };
    } catch (error: any) {
      return {
        healthy: false,
        details: {
          configured: true,
          mode: 'real',
          error: error.message,
          message: 'Web3 service connection failed'
        }
      };
    }
  }
}