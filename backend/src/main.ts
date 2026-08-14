import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

const logger = new Logger('Process');

/**
 * Multi-tenant safety net. whatsapp-web.js drives Puppeteer/Chromium internally
 * with its own fire-and-forget async event handlers (page reloads, CDP calls on
 * reconnect, etc.) that sit outside any try/catch we control — a real incident
 * confirmed one client's Chromium session hitting a CDP protocol timeout
 * ("Runtime.callFunctionOn timed out") as an unhandled rejection that crashed
 * the entire process, taking down every other client's connection with it.
 * Node's default advice is to let uncaught exceptions crash the process since
 * app state is "undefined" afterward, but for an isolated per-session Puppeteer
 * failure that doesn't touch shared DB/HTTP state, killing the whole server for
 * every tenant over one flaky WhatsApp session is strictly worse. Log and carry on.
 */
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception (process kept alive): ${err.message}`, err.stack);
});
process.on('unhandledRejection', (reason: any) => {
  logger.error(`Unhandled rejection (process kept alive): ${reason?.message ?? reason}`, reason?.stack);
});

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set — refusing to start with no/weak token signing key.');
  }

  // rawBody: true keeps req.rawBody available (needed to verify the Razorpay
  // webhook's HMAC signature) without disabling normal JSON parsing elsewhere.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
  // Fail toward restrictive: an unset FRONTEND_URL should not silently widen
  // CORS to reflect-and-allow any origin (which `origin: true` would do).
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
