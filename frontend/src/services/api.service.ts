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

  async getOrder(orderId: string): Promise<ApiResponse<Order>> {
    try {
      const response = await api.get<ApiResponse<Order>>(`/api/orders/${orderId}`);
      return response.data;
    } catch (error: any) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch order',
      };
    }
  },

  async getAllOrders(limit?: number, offset?: number): Promise<{ success: boolean; orders: Order[]; count: number }> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      if (offset) params.append('offset', offset.toString());
      
      const queryString = params.toString();
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

