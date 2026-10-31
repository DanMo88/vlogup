declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const APP_BUILD: string = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';
export const VERSION_LABEL = `v${APP_VERSION} (${APP_BUILD})`;
