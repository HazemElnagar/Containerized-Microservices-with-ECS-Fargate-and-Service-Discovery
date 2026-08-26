import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { ApiConfigService } from './core/api-config.service';

export function initApiConfig(apiConfig: ApiConfigService) {
  return (): Promise<void> => apiConfig.loadConfig();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: initApiConfig,
      deps: [ApiConfigService],
      multi: true
    }
  ]
};
