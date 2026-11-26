import type { NextFunction, Request, Response } from 'express';
import { ControlService } from './control.service';

/** Paths that stay reachable in lockdown so the owner can recover and the app can read why it is locked. */
const OPEN = ['/api/v1/admin', '/api/v1/app/status', '/api/v1/health'];

export function controlMiddleware(control: ControlService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const p = req.path;
    if (!(p.startsWith('/api') || p.startsWith('/socket.io')) || OPEN.some((o) => p.startsWith(o))) return next();
    const s = await control.state();
    if (s.lockdown) {
      return res.status(503).json({ statusCode: 503, code: 'LOCKED', message: s.message || 'The service is temporarily unavailable.' });
    }
    if (s.minVersionCode > 0) {
      const v = parseInt(String(req.headers['x-app-version'] ?? ''), 10);
      if (!Number.isFinite(v) || v < s.minVersionCode) {
        return res.status(426).json({ statusCode: 426, code: 'UPDATE_REQUIRED', message: s.message || 'Please update the app.', minVersionCode: s.minVersionCode });
      }
    }
    next();
  };
}
