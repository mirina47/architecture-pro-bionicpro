import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { User } from './user.entity';

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  private sessions = new Map<string, Session>();
  private pkceStore = new Map<string, string>();

  // config
  private readonly realm = process.env.REACT_APP_KEYCLOAK_REALM!;
  private readonly clientId = process.env.REACT_APP_KEYCLOAK_CLIENT_ID!;
  private readonly keycloakPublicUrl = process.env.REACT_APP_KEYCLOAK_URL!;
  private readonly keycloakInternalUrl = process.env.REACT_APP_KEYCLOAK_DOCKER_URL!;
  private readonly redirectUri = `${process.env.REACT_APP_FRONTEND_URL}/`;

  // login
  login() {
    const state = randomUUID();
    const { codeVerifier, codeChallenge } = this.generatePkce();
    this.savePkce(state, codeVerifier);
    const url = this.createAuthUrl(state, codeChallenge);
    return { state, url };
  }

  // pkce
  generatePkce() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  savePkce(state: string, verifier: string) {
    this.pkceStore.set(state, verifier);
  }

  getPkce(state: string) {
    return this.pkceStore.get(state);
  }

  deletePkce(state: string) {
    this.pkceStore.delete(state);
  }

  // auth
  createAuthUrl(state: string, codeChallenge: string) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      response_type: 'code',
      scope: 'openid',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${this.keycloakPublicUrl}/realms/${this.realm}/protocol/openid-connect/auth?${params}`;
  }

  // exchange

  async exchangeCode(code: string, state: string): Promise<Session> {
    console.log('EXCHANGE STATE:', state);
    const codeVerifier = this.getPkce(state);
    if (!codeVerifier) {
      throw new UnauthorizedException('PKCE verifier not found');
    }
    const tokens = await this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      code_verifier: codeVerifier,
    });
    this.deletePkce(state);
    return this.buildSession(tokens);
  }

  // refresh
  async refreshSession(session: Session): Promise<Session> {
    if (Date.now() <= session.expiresAt) {
      return session;
    }
    console.log('Refreshing access token');
    const tokens = await this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    });
    return this.buildSession(tokens);
  }

  // token request
  private async requestToken(params: Record<string, string>) {
    const body = new URLSearchParams({
      client_id: this.clientId,
      ...params,
    });
    try {
      const { data } = await axios.post(
        `${this.keycloakInternalUrl}/realms/${this.realm}/protocol/openid-connect/token`,
        body.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      return data;
    } catch (error: any) {
      console.error('Keycloak token request failed:', error?.response?.data || error.message);
      throw new UnauthorizedException('Keycloak token request failed');
    }
  }

  // session
  createSession(session: Session) {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId: string): Session {
    if (!sessionId) {
      throw new UnauthorizedException();
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException();
    }
    return session;
  }

  deleteSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  rotateSession(oldSessionId: string, session: Session) {
    const newSessionId = randomUUID();
    this.sessions.delete(oldSessionId);
    this.sessions.set(newSessionId, session);
    return newSessionId;
  }

  async validateAndRotateSession(sessionId: string) {
    try {
      let session = this.getSession(sessionId);
      session = await this.refreshSession(session);
      console.log('access token:', session.accessToken);
      const payload = JSON.parse(Buffer.from(session.accessToken.split('.')[1], 'base64').toString());
      await this.saveUserFromPayload(payload);
      const newId = this.rotateSession(sessionId, session);
      return { session, newId };
    } catch (error) {
      if (sessionId) {
        this.deleteSession(sessionId);
      }
      throw new UnauthorizedException();
    }
  }

  async verifySession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }
    // Обновляем токены, если истекли (но не меняем session_id)
    const refreshed = await this.refreshSession(session);
    if (refreshed !== session) {
      this.sessions.set(sessionId, refreshed);
    }
    const payload = JSON.parse(Buffer.from(refreshed.accessToken.split('.')[1], 'base64').toString());
    return { payload, session: refreshed };
  }

  buildSession(tokens: any): Session {
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
  }

  async saveUserFromPayload(payload: any) {
    console.log('saveUserFromPayload', payload);

    const keycloakUserId = payload.sub;
    if (!keycloakUserId) return;

    const email = payload.email || payload.preferred_username;
    const name = payload.name || payload.preferred_username;

    let user = await this.userRepository.findOne({ where: { keycloakUserId } });
    if (!user) {
      user = this.userRepository.create({
        keycloakUserId,
        email,
        name,
      });
    } else {
      user.email = email;
      user.name = name;
    }
    await this.userRepository.save(user);
    console.log('User saved/updated:', user);
  }

  async getUserId(keycloakUserId: string): Promise<number | null> {
    console.log('getUserId', keycloakUserId);
    const user = await this.userRepository.findOne({
      where: { keycloakUserId },
      select: ['id'],
    });
    return user?.id || null;
  }
}
