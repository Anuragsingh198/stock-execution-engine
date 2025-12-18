import { Order, OrderStatus, DexType } from '../types/order.types';

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  WS_BASE_URL: import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3000',
};

export const DUMMY_STOCKS = [
  { symbol: 'SOL', name: 'Solana', price: 98.50, change: 2.5 },
  { symbol: 'USDC', name: 'USD Coin', price: 1.00, change: 0.0 },
  { symbol: 'BTC', name: 'Bitcoin', price: 42500.00, change: 1.2 },
  { symbol: 'ETH', name: 'Ethereum', price: 2450.00, change: -0.8 },
  { symbol: 'USDT', name: 'Tether', price: 1.00, change: 0.0 },
  { symbol: 'BNB', name: 'Binance Coin', price: 315.00, change: 3.1 },
];

export const DUMMY_ORDERS: Order[] = [
  {
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    tokenIn: 'SOL',
    tokenOut: 'USDC',
    amountIn: '100.5',
    slippageTolerance: 0.5,
    minAmountOut: '95.0',
    status: OrderStatus.CONFIRMED,
    dexType: DexType.RAYDIUM,
    executedPrice: '0.95',
    txHash: '5j7s8K9L2mN3pQ4rT5vW6xY7zA8bC9dE0fG1hI2jK3lM4n',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3595000).toISOString(),
  },
  {
    orderId: '660e8400-e29b-41d4-a716-446655440001',
    tokenIn: 'BTC',
    tokenOut: 'USDT',
    amountIn: '0.5',
    slippageTolerance: 1.0,
    status: OrderStatus.ROUTING,
    createdAt: new Date(Date.now() - 60000).toISOString(),
    updatedAt: new Date(Date.now() - 55000).toISOString(),
  },
  {
    orderId: '770e8400-e29b-41d4-a716-446655440002',
    tokenIn: 'ETH',
    tokenOut: 'USDC',
    amountIn: '10.0',
    slippageTolerance: 0.5,
    status: OrderStatus.FAILED,
    errorReason: 'Insufficient liquidity',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 7195000).toISOString(),
  },
];

