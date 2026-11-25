export interface AppConfig {
  nodeEnv: string;
  port: number;
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
  minAge: number;
  devExposeTokens: boolean;
}

export const configuration = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  jwtAccessSecret:
    process.env.JWT_ACCESS_SECRET ?? 'insecure-dev-secret-change-me-0123456789abcdef',
  jwtAccessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS ?? '900', 10),
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? '30', 10),
  minAge: parseInt(process.env.MIN_AGE ?? '13', 10),
  devExposeTokens: (process.env.DEV_EXPOSE_TOKENS ?? 'false') === 'true',
});
