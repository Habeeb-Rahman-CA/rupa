export const environment = {
  production: true,
  supabase: {
    url: 'https://kulwhzrhmpcdgwgamjzx.supabase.co',
    anonKey: 'sb_publishable_uHLSkc60rj86J-27EqoVpg_Ic1jPzpw',
  },
  /** VAPID public key — safe in the client. The private key lives only in the
   *  push-notifications Edge Function secret (see .env / SETUP.md). */
  vapidPublicKey:
    'BIDYpJCMq_gAxRxbn9JrRe6OL_nUoW9IHCruhZ8Ft1X3Tm2JFUgz1ILrLEloqEOl97V_oiIXlh2z0GfgQ_PcWMU',
};
