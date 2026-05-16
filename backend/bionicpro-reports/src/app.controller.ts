import { Controller, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('reports')
  async downloadReport(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      throw new UnauthorizedException();
    }

    const userId = await this.appService.getUserIdFromSession(sessionId);

    const csv = await this.appService.generateReportCsv(userId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');

    res.send(csv);
  }
}
