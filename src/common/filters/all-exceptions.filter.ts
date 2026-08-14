import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Something went wrong. Please try again.';
    if (isHttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else if (typeof body === 'object' && body && 'message' in body) {
        message = (body as { message: string | string[] }).message;
      }
    }

    if (!isHttpException) {
      // Never leak stack traces / internal details to clients — log server-side only.
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(status).json({
      success: false,
      message,
    });
  }
}
