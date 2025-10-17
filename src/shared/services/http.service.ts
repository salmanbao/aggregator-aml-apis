import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse, AxiosError } from 'axios';
import { firstValueFrom, timeout, retry, catchError } from 'rxjs';
import { throwError } from 'rxjs';

/**
 * HTTP service wrapper with retry logic and error handling
 */
@Injectable()
export class CustomHttpService {
  private readonly logger = new Logger(CustomHttpService.name);
  private readonly defaultTimeout = 30000; // 30 seconds
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor(private readonly httpService: HttpService) {}

  /**
   * Make a GET request with retry logic
   */
  async get<T>(
    url: string,
    config?: {
      timeout?: number;
      retries?: number;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const requestConfig = {
      timeout: config?.timeout || this.defaultTimeout,
      headers: config?.headers || {},
    };

    const retryCount = config?.retries || this.maxRetries;

    try {
      const response$ = this.httpService.get<T>(url, requestConfig).pipe(
        timeout(requestConfig.timeout),
        retry({
          count: retryCount,
          delay: this.retryDelay,
        }),
        catchError((error: AxiosError) => {
          this.logger.error(
            `GET request failed: ${url} - ${error.message}`,
            error.stack,
          );
          return throwError(() => this.handleAxiosError(error));
        }),
      );

      const response: AxiosResponse<T> = await firstValueFrom(response$);
      return response.data;
    } catch (error) {
      this.logger.error(`GET request failed after retries: ${url}`, error);
      throw error;
    }
  }

  /**
   * Make a POST request with retry logic
   */
  async post<T>(
    url: string,
    data?: any,
    config?: {
      timeout?: number;
      retries?: number;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const requestConfig = {
      timeout: config?.timeout || this.defaultTimeout,
      headers: config?.headers || {},
    };

    const retryCount = config?.retries || this.maxRetries;

    try {
      const response$ = this.httpService.post<T>(url, data, requestConfig).pipe(
        timeout(requestConfig.timeout),
        retry({
          count: retryCount,
          delay: this.retryDelay,
        }),
        catchError((error: AxiosError) => {
          this.logger.error(
            `POST request failed: ${url} - ${error.message}`,
            error.stack,
          );
          return throwError(() => this.handleAxiosError(error));
        }),
      );

      const response: AxiosResponse<T> = await firstValueFrom(response$);
      return response.data;
    } catch (error) {
      this.logger.error(`POST request failed after retries: ${url}`, error);
      throw error;
    }
  }

  /**
   * Handle Axios errors and convert to meaningful error messages
   */
  private handleAxiosError(error: AxiosError): Error {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const statusText = error.response.statusText;
      const data = error.response.data;

      return new Error(
        `HTTP ${status} ${statusText}: ${JSON.stringify(data)}`,
      );
    } else if (error.request) {
      // Request was made but no response received
      return new Error('No response received from server');
    } else {
      // Something else happened
      return new Error(`Request setup error: ${error.message}`);
    }
  }
}
