export enum OrderStatus {
  PENDING = 'pending',
  ROUTING = 'routing',
  BUILDING = 'building',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed'
}

export enum DexType {
  RAYDIUM = 'raydium',
  METEORA = 'meteora'
}

export interface OrderRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageTolerance: number; // e.g., 0.5 for 0.5%
  minAmountOut?: string;
}

export interface Order {
  orderId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageTolerance: number;
  minAmountOut?: string;
  status: OrderStatus;
  dexType?: DexType;
  executedPrice?: string;
  txHash?: string;
  errorReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DexQuote {
  dex: DexType;
  quotePrice: string;
  effectivePrice: string; // After fees
  fee: string;
  amountOut: string;
  latency: number; // ms
  poolAddress?: string; // Pool address for transaction building
  poolInfo?: any; // Additional pool information for transaction building
}

export interface OrderUpdate {
  orderId: string;
  status: OrderStatus;
  dexType?: DexType;
  executedPrice?: string;
  txHash?: string;
  errorReason?: string;
  timestamp: Date;
}

