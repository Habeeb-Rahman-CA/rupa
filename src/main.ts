import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { handleFatalError } from './app/core/app-error-handler';

bootstrapApplication(App, appConfig).catch((err) => {
  // The injector (and therefore AppErrorHandler) never came up, so this path
  // must show recovery UI itself — otherwise a failed boot strands the user
  // on the splash screen with no feedback.
  handleFatalError(err);
});
