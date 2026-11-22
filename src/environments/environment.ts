export const environment = {
  production: true,
  apiUrl: 'http://localhost:3000/api',
  /** VAPID public key — safe in the client. The private key lives only in the
   *  push-notifications Edge Function secret (see .env / SETUP.md). */
  vapidPublicKey:
    'BIDYpJCMq_gAxRxbn9JrRe6OL_nUoW9IHCruhZ8Ft1X3Tm2JFUgz1ILrLEloqEOl97V_oiIXlh2z0GfgQ_PcWMU',
};
