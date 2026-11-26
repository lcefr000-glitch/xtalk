import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ControlService } from './modules/control/control.service';
import { controlMiddleware } from './modules/control/control.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_ACCESS_SECRET ?? '';
  if (isProd && (secret.length < 32 || secret.startsWith('insecure-') || secret.startsWith('GENERATE') || secret.startsWith('change-me'))) {
    throw new Error('Refusing to start: set JWT_ACCESS_SECRET to a random value of at least 32 characters in production.');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind a reverse proxy (Caddy): trust X-Forwarded-* so rate limiting sees real client IPs.
  if (process.env.TRUST_PROXY) app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10) || 1);
  app.use(helmet());
  app.use(controlMiddleware(app.get(ControlService)));
  // Mobile client: allow all origins in dev. Restrict to known origins in production.
  // Optional allow-list: CORS_ORIGINS=https://a.com,https://b.com (the mobile app does not need CORS).
  const origins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins && origins.length ? origins : true, credentials: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('X TaIk API')
    .setDescription('Language exchange & social learning platform - Phase 1')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`X TaIk API listening on http://localhost:${port} (docs: /docs)`);
}
bootstrap();
