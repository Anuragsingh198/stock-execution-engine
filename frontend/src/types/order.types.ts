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
  slippageTolerance: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface OrderUpdate {
  orderId: string;
  status: OrderStatus;
  dexType?: DexType;
  executedPrice?: string;
  txHash?: string;
  errorReason?: string;
  timestamp: string;
}

export interface SocketMessage {
  type: 'connected' | 'pong' | 'update';
  orderId?: string;
  timestamp?: string;
  status?: OrderStatus;
  dexType?: DexType;
  executedPrice?: string;
  txHash?: string;
  errorReason?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  orderId?: string;
  status?: OrderStatus;
  message?: string;
  order?: T;
  error?: string;
  details?: any[];
}

