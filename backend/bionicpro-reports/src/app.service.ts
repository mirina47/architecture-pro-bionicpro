import { createClient } from '@clickhouse/client';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

import { S3Service } from './s3.service';

@Injectable()
export class AppService {
  private readonly clickhouse = createClient({
    host: process.env.CLICKHOUSE_HOST || 'http://clickhouse:8123',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || 'default',
  });

  constructor(private readonly s3Service: S3Service) {}

  private getReportKey(userId: number): string {
    return `user_${userId}.csv`;
  }

  private getCdnUrl(userId: number): string {
    const base = process.env.CDN_BASE_URL || 'http://localhost:8082/reports';
    return `${base}/${this.getReportKey(userId)}`;
  }

  async getReportDownloadUrl(userId: number): Promise<string> {
    const key = this.getReportKey(userId);
    const exists = await this.s3Service.fileExists(key);
    if (exists) {
      console.log(`Report for user ${userId} found in S3, returning CDN URL`);
      return this.getCdnUrl(userId);
    }

    console.log(`Generating report for user ${userId} from ClickHouse`);
    const reports = await this.getReports(userId);
    const csv = await this.generateReportCsv(reports);
    await this.s3Service.uploadCsv(key, csv);
    return this.getCdnUrl(userId);
  }

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

  async generateReportCsv(reports: any[]): Promise<string> {
    console.log('generateReportCsv');
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
