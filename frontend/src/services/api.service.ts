import axios from 'axios';
import { API_CONFIG } from '../config/api.config';
import { OrderRequest, Order, ApiResponse } from '../types/order.types';

const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  async createOrder(orderRequest: OrderRequest): Promise<ApiResponse<Order>> {
    try {
      const response = await api.post<ApiResponse<Order>>('/api/orders/execute', orderRequest);
      return response.data;
    } catch (error: any) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to create order',
        details: error.response?.data?.details || [],
      };
    }
  },

  async getOrder(orderId: string, retries: number = 5, initialDelay: number = 300): Promise<ApiResponse<Order>> {
    let lastError: any;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await api.get<ApiResponse<Order>>(`/api/orders/${orderId}`);
        return response.data;
      } catch (error: any) {
        lastError = error;
        // If it's a 404 and we have retries left, wait and retry with exponential backoff
        if (error.response?.status === 404 && attempt < retries - 1) {
          // Exponential backoff: 300ms, 600ms, 1200ms, 2400ms
          const delay = initialDelay * Math.pow(2, attempt);
          console.log(`[API Service] Order ${orderId} not found, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // For other errors or last attempt, throw
        throw {
          success: false,
          error: error.response?.data?.error || 'Failed to fetch order',
        };
      }
    }
    
    // If we exhausted all retries
    throw {
      success: false,
      error: lastError?.response?.data?.error || 'Failed to fetch order after retries',
    };
  },

  async getAllOrders(limit?: number, offset?: number): Promise<{ success: boolean; orders: Order[]; count: number }> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      if (offset) params.append('offset', offset.toString());
      
      const queryString = params.toString();
      // Ensure no trailing slash - use /api/orders (not /api/orders/)
      const url = `/api/orders${queryString ? `?${queryString}` : ''}`;
      const response = await api.get<{ success: boolean; orders: Order[]; count: number }>(url);
      return response.data;
    } catch (error: any) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch orders',
        orders: [],
        count: 0,
      };
    }
  },

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      throw new Error('Health check failed');
    }
  },
};

