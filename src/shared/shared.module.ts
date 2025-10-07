import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CustomHttpService } from './services/http.service';

/**
 * Shared module that provides common utilities and services
 */
@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  providers: [CustomHttpService],
  exports: [CustomHttpService],
})
export class SharedModule {}
