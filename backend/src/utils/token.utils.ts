import { PublicKey } from '@solana/web3.js';

export const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BTC: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
  ETH: '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk',
};

export function getTokenMint(symbol: string): PublicKey {
  const mintAddress = TOKEN_MINTS[symbol.toUpperCase()];
  if (!mintAddress) {
    throw new Error(`Unknown token symbol: ${symbol}. Supported tokens: ${Object.keys(TOKEN_MINTS).join(', ')}`);
  }
  return new PublicKey(mintAddress);
}

export function isNativeSOL(symbol: string): boolean {
  return symbol.toUpperCase() === 'SOL';
}

export function parseTokenAmount(amount: string, decimals: number = 9): bigint {
  const amountFloat = parseFloat(amount);
  return BigInt(Math.floor(amountFloat * Math.pow(10, decimals)));
}

export function formatTokenAmount(amount: bigint, decimals: number = 9): string {
  return (Number(amount) / Math.pow(10, decimals)).toFixed(decimals);
}
