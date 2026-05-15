import { createClient } from '@clickhouse/client';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly clickhouse = createClient({
    host: process.env.CLICKHOUSE_HOST || 'http://clickhouse:8123',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || 'default',
  });

  async getReports(userId: number) {
    console.log('getReports', userId);
    // Запрос к ClickHouse (витрина reports_mart)
    try {
      const resultSet = await this.clickhouse.query({
        query: `
          SELECT 
            user_id,
            email,
            name,
            report_date,
            total_actions,
            avg_response_ms,
            max_response_ms,
            battery_avg_level,
            anomaly_count,
            etl_updated_at
          FROM reports_mart
          WHERE user_id = {userId:String}
          ORDER BY report_date DESC
        `,
        format: 'JSONEachRow',
        query_params: { userId },
      });
      const rows = await resultSet.json();
      console.log(rows);
      return rows;
    } catch (err) {
      this.logger.error(`ClickHouse error: ${err.message}`);
      throw new Error('Failed to fetch reports');
    }
  }

  async getUserIdFromSession(sessionId: string): Promise<number> {
    console.log('getUserIdFromSession', sessionId);
    const response = await axios.get('http://auth:8000/auth/check', {
      headers: { Cookie: `session_id=${sessionId}` },
    });
    return response.data.userId;
  }
}
