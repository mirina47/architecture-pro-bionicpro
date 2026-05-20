import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('auth/login')
  login(@Res() res: Response) {
    const { state, url } = this.appService.login();
    console.log('LOGIN STATE:', state);
    return res.redirect(url);
  }

  @Post('auth/exchange')
  async exchange(@Body('code') code: string, @Body('state') state: string, @Res() res: Response) {
    if (!code || !state) {
      throw new UnauthorizedException('Missing code/state');
    }
    const session = await this.appService.exchangeCode(code, state);
    const sessionId = this.appService.createSession(session);
    this.setSessionCookie(res, sessionId);
    return res.json({ ok: true });
  }

  @Get('auth/me')
  async me(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session_id;
    const { newId } = await this.appService.validateAndRotateSession(sessionId);
    this.setSessionCookie(res, newId);
    return res.json({ ok: true });
  }

  @Get('auth/check')
  async checkSession(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session_id;
    if (!sessionId) {
      return res.status(401).json({ error: 'No session' });
    }
    try {
      const { payload } = await this.appService.verifySession(sessionId);
      const keycloakUserId = payload.sub;
      const userId = await this.appService.getUserId(keycloakUserId);
      if (!userId) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({ userId });
    } catch {
      return res.status(401).json({ error: 'Invalid session' });
    }
  }

  private setSessionCookie(res: Response, sessionId: string) {
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: false, // true for HTTPS production
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60,
    });
  }
}
