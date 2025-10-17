import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Response transformation interceptor to standardize API responses
 */
@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, any>
{
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // If the response is already wrapped or is an error, return as is
        if (data && typeof data === 'object' && 'statusCode' in data) {
          return data;
        }

        // Transform successful responses to a standard format
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
