import { Injectable } from '@angular/core';
import { ApiConfigService } from './api-config.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  constructor(private config: ApiConfigService) {}

  private buildUrl(path: string): string {
    const base = this.config.apiBaseUrl;
    // If base URL is configured, use it; otherwise keep relative path
    if (base) {
      // Ensure no double slashes
      const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
      const cleanPath = path.startsWith('/') ? path : '/' + path;
      return cleanBase + cleanPath;
    }
    return path;
  }

  async get(path: string, headers?: Record<string, string>): Promise<any> {
    const response = await fetch(this.buildUrl(path), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${response.status})`);
    }

    return response.json();
  }

  async post(path: string, body: any, headers?: Record<string, string>): Promise<any> {
    const response = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const resBody = await response.json().catch(() => ({}));
      throw new Error(resBody.error || `Request failed (${response.status})`);
    }

    return response.json();
  }
}
