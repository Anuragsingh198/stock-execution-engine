import { Database } from '../config/database.config';
import { Order, OrderStatus, DexType } from '../types/order.types';

export class OrderModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
    this.initTable();
  }

  private async initTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(255) PRIMARY KEY,
        token_in VARCHAR(255) NOT NULL,
        token_out VARCHAR(255) NOT NULL,
        amount_in VARCHAR(255) NOT NULL,
        slippage_tolerance DECIMAL(10, 4) NOT NULL,
        min_amount_out VARCHAR(255),
        status VARCHAR(50) NOT NULL,
        dex_type VARCHAR(50),
        executed_price VARCHAR(255),
        tx_hash VARCHAR(255),
        error_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    `;

    try {
      await this.db.query(createTableQuery);
      console.log('Orders table initialized');
    } catch (error) {
      console.error('Error initializing orders table:', error);
    }
  }

  public async create(order: Order): Promise<void> {
    const query = `
      INSERT INTO orders (
        order_id, token_in, token_out, amount_in, slippage_tolerance,
        min_amount_out, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.db.query(query, [
      order.orderId,
      order.tokenIn,
      order.tokenOut,
      order.amountIn,
      order.slippageTolerance,
      order.minAmountOut || null,
      order.status,
      order.createdAt,
      order.updatedAt,
    ]);
  }

  public async updateStatus(
    orderId: string,
    status: OrderStatus,
    updates?: Partial<Order>
  ): Promise<void> {
    const fields: string[] = ['status = $1', 'updated_at = $2'];
    const values: any[] = [status, new Date()];
    let paramIndex = 3;

    if (updates?.dexType) {
      fields.push(`dex_type = $${paramIndex}`);
      values.push(updates.dexType);
      paramIndex++;
    }

    if (updates?.executedPrice) {
      fields.push(`executed_price = $${paramIndex}`);
      values.push(updates.executedPrice);
      paramIndex++;
    }

    if (updates?.txHash) {
      fields.push(`tx_hash = $${paramIndex}`);
      values.push(updates.txHash);
      paramIndex++;
    }

    if (updates?.errorReason) {
      fields.push(`error_reason = $${paramIndex}`);
      values.push(updates.errorReason);
      paramIndex++;
    }

    const query = `UPDATE orders SET ${fields.join(', ')} WHERE order_id = $${paramIndex}`;
    values.push(orderId);

    await this.db.query(query, values);
  }

  public async findById(orderId: string): Promise<Order | null> {
    const query = `SELECT * FROM orders WHERE order_id = $1`;
    const result = await this.db.query(query, [orderId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOrder(result.rows[0]);
  }

  public async findAll(limit: number = 100, offset: number = 0): Promise<Order[]> {
    const query = `SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    const result = await this.db.query(query, [limit, offset]);

    return result.rows.map((row) => this.mapRowToOrder(row));
  }

  private mapRowToOrder(row: any): Order {
    return {
      orderId: row.order_id,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amountIn: row.amount_in,
      slippageTolerance: parseFloat(row.slippage_tolerance),
      minAmountOut: row.min_amount_out,
      status: row.status as OrderStatus,
      dexType: row.dex_type as DexType | undefined,
      executedPrice: row.executed_price,
      txHash: row.tx_hash,
      errorReason: row.error_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

