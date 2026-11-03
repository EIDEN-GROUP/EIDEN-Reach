declare module 'cloudflare:sockets' {
  export type SecureTransport = 'off' | 'on' | 'starttls'
  export type Socket = {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
    opened: Promise<unknown>
    closed: Promise<void>
    close(): Promise<void>
    startTls(): Socket
  }
  export function connect(address: { hostname: string; port: number }, options?: { secureTransport?: SecureTransport; allowHalfOpen?: boolean }): Socket
}
