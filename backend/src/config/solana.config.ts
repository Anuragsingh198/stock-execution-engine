import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

export class SolanaConfig {
  private static instance: SolanaConfig;
  private connection: Connection;
  private wallet: Keypair | null = null;

  private constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });

    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (privateKey) {
      try {
        const privateKeyBytes = bs58.decode(privateKey);
        this.wallet = Keypair.fromSecretKey(privateKeyBytes);
      } catch (error) {
        console.error('[Solana Config] Failed to initialize wallet from private key:', error);
      }
    } else {
      this.wallet = Keypair.generate();
    }
  }

  public static getInstance(): SolanaConfig {
    if (!SolanaConfig.instance) {
      SolanaConfig.instance = new SolanaConfig();
    }
    return SolanaConfig.instance;
  }

  public getConnection(): Connection {
    return this.connection;
  }

  public getWallet(): Keypair {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please set SOLANA_PRIVATE_KEY in environment variables.');
    }
    return this.wallet;
  }

  public getWalletPublicKey(): PublicKey {
    return this.getWallet().publicKey;
  }

  public async getBalance(): Promise<number> {
    const publicKey = this.getWalletPublicKey();
    const balance = await this.connection.getBalance(publicKey);
    return balance / 1e9;
  }

  public async hasSufficientBalance(requiredSol: number = 0.01): Promise<boolean> {
    const balance = await this.getBalance();
    return balance >= requiredSol;
  }
}
