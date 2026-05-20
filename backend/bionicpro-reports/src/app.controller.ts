import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('reports')
  async downloadReport(@Req() req: Request) {
    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      throw new UnauthorizedException();
    }

    const userId = await this.appService.getUserIdFromSession(sessionId);

    const downloadUrl = await this.appService.getReportDownloadUrl(userId);

    return { downloadUrl };
  }
}
