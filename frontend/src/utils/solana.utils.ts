export const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK || 'devnet';

export function getSolanaExplorerUrl(txHash: string, network: string = SOLANA_NETWORK): string {
  const cluster = network === 'mainnet' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${txHash}${cluster}`;
}

export function formatTxHash(txHash: string, length: number = 8): string {
  if (!txHash) return '';
  if (txHash.length <= length * 2) return txHash;
  return `${txHash.slice(0, length)}...${txHash.slice(-length)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

export function getNetworkDisplayName(network: string = SOLANA_NETWORK): string {
  switch (network.toLowerCase()) {
    case 'mainnet':
      return 'Mainnet';
    case 'devnet':
      return 'Devnet';
    case 'testnet':
      return 'Testnet';
    default:
      return network;
  }
}
