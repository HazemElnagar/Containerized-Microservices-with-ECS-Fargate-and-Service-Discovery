import { Injectable } from '@angular/core';

export interface ApiConfig {
  apiBaseUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiConfigService {
  private config: ApiConfig = { apiBaseUrl: '' };
  private loaded = false;

  async loadConfig(): Promise<void> {
    try {
      const response = await fetch('api-config.json');
      if (response.ok) {
        this.config = await response.json();
        console.log('[ApiConfig] Loaded:', this.config);
      }
    } catch (err) {
      console.warn('[ApiConfig] Could not load api-config.json, using relative paths.', err);
    }
    this.loaded = true;
  }

  get apiBaseUrl(): string {
    return this.config.apiBaseUrl || '';
  }

  get isLoaded(): boolean {
    return this.loaded;
  }
}
