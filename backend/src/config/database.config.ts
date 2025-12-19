import { Pool, PoolConfig } from 'pg';

export class Database {
  private static instance: Database;
  private pool: Pool;

  private constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    
    let config: PoolConfig;
      config = {
        connectionString: databaseUrl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };

    this.pool = new Pool(config);
    this.setupErrorHandlers();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private setupErrorHandlers(): void {
    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

