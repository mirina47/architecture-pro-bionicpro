import { createClient } from '@clickhouse/client';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AppService {
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
      console.log('rows', rows);
      return rows;
    } catch (err) {
      console.error(`ClickHouse error: ${err.message}`);
      throw new Error('Failed to fetch reports');
    }
  }

  async generateReportCsv(userId: number): Promise<string> {
    console.log('generateReportCsv', userId);
    const reports = await this.getReports(userId);

    const headers = [
      'Дата',
      'Email',
      'Имя',
      'Действий',
      'Ср. отклик (ms)',
      'Макс. отклик (ms)',
      'Ср. батарея (%)',
      'Аномалии',
    ];

    const rows = reports.map((r: any) => [
      r.report_date,
      r.email,
      r.name,
      r.total_actions,
      r.avg_response_ms,
      r.max_response_ms,
      r.battery_avg_level,
      r.anomaly_count,
    ]);

    const csv = [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');

    return '\uFEFF' + csv;
  }

  async getUserIdFromSession(sessionId: string): Promise<number> {
    console.log('getUserIdFromSession', sessionId);
    const response = await axios.get('http://auth:8000/auth/check', {
      headers: { Cookie: `session_id=${sessionId}` },
    });
    return response.data.userId;
  }
}
