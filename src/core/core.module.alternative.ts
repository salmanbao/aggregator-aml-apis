import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, APP_GUARD } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { ResponseTransformInterceptor } from './interceptors/response-transform.interceptor';
import { CustomValidationPipe } from './pipes/validation.pipe';
import { RateLimitGuard } from './guards/rate-limit.guard';

/**
 * Core module that provides global filters, interceptors, pipes, and guards
 * Alternative implementation without exports (recommended for global providers)
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTransformInterceptor,
    },
    {
      provide: APP_PIPE,
      useClass: CustomValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  // No exports needed for global providers
})
export class CoreModule {}