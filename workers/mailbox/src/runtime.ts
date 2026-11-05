export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  MAILBOX_ENCRYPTION_KEY: string
  MAILBOX_ENCRYPTION_KEY_VERSION: string
  APP_ORIGIN: string
  SLACK_WEBHOOK_URL?: string
  UNSUBSCRIBE_URL_BASE?: string
  DISPATCH_TOKEN?: string
}

export function serviceHeaders(env: Env, contentType = false) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...(contentType ? { 'content-type': 'application/json' } : {}),
  }
}
