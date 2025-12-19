export interface QuoteCalculationParams {
  reserveA: number;
  reserveB: number;
  amountIn: bigint;
  isReserveAIn: boolean;
  feeRate: number;
}

export interface QuoteResult {
  price: number;
  effectivePrice: number;
  fee: number;
  amountOut: string;
}

export function calculateConstantProductQuote(params: QuoteCalculationParams): QuoteResult {
  const { reserveA, reserveB, amountIn, isReserveAIn, feeRate } = params;

  if (reserveA === 0 || reserveB === 0) {
    throw new Error('Pool has zero liquidity');
  }

  const amountInFloat = Number(amountIn) / 1e9;

  let amountOutFloat: number;
  if (isReserveAIn) {
    const newReserveA = reserveA + amountInFloat;
    const newReserveB = (reserveA * reserveB) / newReserveA;
    amountOutFloat = reserveB - newReserveB;
  } else {
    const newReserveB = reserveB + amountInFloat;
    const newReserveA = (reserveA * reserveB) / newReserveB;
    amountOutFloat = reserveA - newReserveA;
  }

  const fee = amountOutFloat * feeRate;
  const amountOutAfterFee = amountOutFloat - fee;

  const price = amountOutFloat / amountInFloat;
  const effectivePrice = amountOutAfterFee / amountInFloat;

  return {
    price,
    effectivePrice,
    fee,
    amountOut: (amountOutAfterFee * 1e9).toString(),
  };
}
