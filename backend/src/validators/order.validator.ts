import { z } from 'zod';

export const orderRequestSchema = z.object({
  tokenIn: z.string().min(1, 'tokenIn is required'),
  tokenOut: z.string().min(1, 'tokenOut is required'),
  amountIn: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    },
    { message: 'amountIn must be a positive number' }
  ),
  slippageTolerance: z.number().min(0).max(100, 'slippageTolerance must be between 0 and 100'),
  minAmountOut: z.string().optional().refine(
    (val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0;
    },
    { message: 'minAmountOut must be a non-negative number' }
  ),
});

export type ValidatedOrderRequest = z.infer<typeof orderRequestSchema>;

