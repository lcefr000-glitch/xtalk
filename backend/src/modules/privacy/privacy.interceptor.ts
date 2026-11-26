import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrivacyService } from './privacy.service';

/** Removes the country from other people's profile data when they turned "Show my country" off. */
@Injectable()
export class PrivacyInterceptor implements NestInterceptor {
  constructor(private readonly privacy: PrivacyService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const viewerId: string | undefined = ctx.switchToHttp().getRequest()?.user?.id;
    return next.handle().pipe(
      mergeMap(async (data) => {
        try { await this.scrub(data, viewerId); } catch { /* never break a response */ }
        return data;
      }),
    );
  }

  private async scrub(data: unknown, viewerId?: string) {
    const nodes: { node: Record<string, any>; owner: string }[] = [];
    const seen = new Set<unknown>();
    const walk = (v: any, depth: number) => {
      if (!v || typeof v !== 'object' || depth > 8 || seen.has(v)) return;
      if (v instanceof Date || Buffer.isBuffer(v)) return;
      seen.add(v);
      if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
      if (typeof v.id === 'string' && v.profile && typeof v.profile === 'object' && 'country' in v.profile) nodes.push({ node: v.profile, owner: v.id });
      else if (typeof v.userId === 'string' && 'country' in v && 'displayName' in v) nodes.push({ node: v, owner: v.userId });
      for (const k of Object.keys(v)) walk(v[k], depth + 1);
    };
    walk(data, 0);
    const targets = nodes.filter((n) => n.owner !== viewerId && n.node.country);
    if (!targets.length) return;
    const hide = await this.privacy.idsAmong('show_country', false, [...new Set(targets.map((n) => n.owner))]);
    if (!hide.size) return;
    for (const n of targets) if (hide.has(n.owner)) n.node.country = null;
  }
}
