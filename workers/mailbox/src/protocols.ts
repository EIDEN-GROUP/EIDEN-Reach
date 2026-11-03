import { connect, type Socket } from 'cloudflare:sockets'
import { parseImapListLine, parseImapSearchLine, type ImapFolder } from './imap-parsing'

export type MailboxTestStage = 'imap_connection_failed' | 'imap_authentication_failed' | 'smtp_connection_failed' | 'smtp_tls_failed' | 'smtp_authentication_failed' | 'smtp_auth_not_supported' | 'connection_timeout'

export class MailboxProtocolError extends Error {
  constructor(readonly code: MailboxTestStage) {
    super(code)
    this.name = 'MailboxProtocolError'
  }
}

const encoder = new TextEncoder()
const timeoutMs = 8_000

function withTimeout<T>(promise: Promise<T>, code: MailboxTestStage): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new MailboxProtocolError(code)), timeoutMs) }),
  ]).finally(() => { if (timer) clearTimeout(timer) })
}

type LineChannel = {
  readLine(): Promise<string>
  readBytes(length: number): Promise<Uint8Array>
  writeLine(line: string): Promise<void>
  detach(): void
  close(): Promise<void>
}

function createLineChannel(socket: Socket, timeoutCode: MailboxTestStage): LineChannel {
  const reader = socket.readable.getReader()
  const writer = socket.writable.getWriter()
  const decoder = new TextDecoder()
  let buffer = new Uint8Array()

  function append(chunk: Uint8Array) {
    const merged = new Uint8Array(buffer.length + chunk.length)
    merged.set(buffer)
    merged.set(chunk, buffer.length)
    buffer = merged
  }

  async function fill() {
    const result = await withTimeout(reader.read(), 'connection_timeout')
    if (result.done) throw new MailboxProtocolError(timeoutCode)
    append(result.value)
  }

  return {
    async readLine() {
      while (true) {
        const delimiter = buffer.indexOf(10)
        if (delimiter >= 0) {
          const end = delimiter > 0 && buffer[delimiter - 1] === 13 ? delimiter - 1 : delimiter
          const line = decoder.decode(buffer.slice(0, end))
          buffer = buffer.slice(delimiter + 1)
          return line
        }
        if (buffer.length > 16_384) throw new MailboxProtocolError(timeoutCode)
        await fill()
      }
    },
    async readBytes(length) {
      if (!Number.isSafeInteger(length) || length < 0 || length > 10 * 1024 * 1024) {
        throw new MailboxProtocolError(timeoutCode)
      }
      while (buffer.length < length) await fill()
      const value = buffer.slice(0, length)
      buffer = buffer.slice(length)
      return value
    },
    async writeLine(line) {
      await writer.write(encoder.encode(`${line}\r\n`))
    },
    detach() {
      if (buffer.length) throw new MailboxProtocolError(timeoutCode)
      reader.releaseLock()
      writer.releaseLock()
    },
    async close() {
      try { await reader.cancel() } catch { /* socket may already have closed */ }
      try { reader.releaseLock() } catch { /* reader can be detached for STARTTLS */ }
      try { writer.releaseLock() } catch { /* writer can already be released */ }
      try { await socket.close() } catch { /* close is best effort */ }
    },
  }
}

async function openSocket(hostname: string, port: number, secureTransport: 'on' | 'starttls', code: MailboxTestStage): Promise<Socket> {
  const socket = connect({ hostname, port }, { secureTransport })
  try {
    await withTimeout(socket.opened, code)
    return socket
  } catch (error) {
    try { await socket.close() } catch { /* connection may not have opened */ }
    if (error instanceof MailboxProtocolError) throw error
    throw new MailboxProtocolError(code)
  }
}

function quoteImap(value: string) {
  if (/[\r\n\0]/.test(value)) throw new MailboxProtocolError('imap_authentication_failed')
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export async function verifyImapLogin(address: string, password: string): Promise<void> {
  const socket = await openSocket('imap.hostinger.com', 993, 'on', 'imap_connection_failed')
  let channel: LineChannel | undefined
  try {
    channel = createLineChannel(socket, 'imap_connection_failed')
    const greeting = await channel.readLine()
    if (!/^\*\s+OK\b/i.test(greeting)) throw new MailboxProtocolError('imap_connection_failed')
    await channel.writeLine(`A001 LOGIN ${quoteImap(address)} ${quoteImap(password)}`)
    let accepted = false
    for (let count = 0; count < 40; count += 1) {
      const line = await channel.readLine()
      if (!/^A001\s+/i.test(line)) continue
      if (/^A001\s+OK\b/i.test(line)) accepted = true
      else throw new MailboxProtocolError('imap_authentication_failed')
      break
    }
    if (!accepted) throw new MailboxProtocolError('connection_timeout')
    await channel.writeLine('A002 LOGOUT')
    await channel.readLine()
  } catch (error) {
    if (error instanceof MailboxProtocolError) throw error
    throw new MailboxProtocolError('imap_connection_failed')
  } finally {
    if (channel) await channel.close()
    else try { await socket.close() } catch { /* best effort */ }
  }
}

function encodeBase64(value: string) {
  const bytes = encoder.encode(value)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

async function readSmtpReply(channel: LineChannel) {
  const first = await channel.readLine()
  const match = /^(\d{3})([ -])(.*)$/.exec(first)
  if (!match) throw new MailboxProtocolError('smtp_connection_failed')
  const code = Number(match[1])
  const lines = [match[3]]
  let separator = match[2]
  for (let count = 0; separator === '-' && count < 50; count += 1) {
    const line = await channel.readLine()
    const next = /^(\d{3})([ -])(.*)$/.exec(line)
    if (!next || Number(next[1]) !== code) throw new MailboxProtocolError('smtp_connection_failed')
    separator = next[2]
    lines.push(next[3])
  }
  if (separator === '-') throw new MailboxProtocolError('smtp_connection_failed')
  return { code, text: lines.join('\n') }
}

async function smtpCommand(channel: LineChannel, command: string) {
  await channel.writeLine(command)
  return readSmtpReply(channel)
}

function expectSmtpCode(code: number, reply: { code: number }, failure: MailboxTestStage) {
  if (reply.code !== code) throw new MailboxProtocolError(failure)
}

async function verifySmtpLoginOnPort(address: string, password: string, port: 465 | 587): Promise<void> {
  let socket: Socket | undefined
  let channel: LineChannel | undefined
  try {
    socket = await openSocket('smtp.hostinger.com', port, port === 465 ? 'on' : 'starttls', 'smtp_connection_failed')
    channel = createLineChannel(socket, 'smtp_connection_failed')
    expectSmtpCode(220, await readSmtpReply(channel), 'smtp_connection_failed')
    let ehlo = await smtpCommand(channel, 'EHLO eiden-reach.invalid')
    expectSmtpCode(250, ehlo, 'smtp_connection_failed')
    if (port === 587) {
      if (!/\bSTARTTLS\b/i.test(ehlo.text)) throw new MailboxProtocolError('smtp_tls_failed')
      expectSmtpCode(220, await smtpCommand(channel, 'STARTTLS'), 'smtp_tls_failed')
      channel.detach()
      socket = socket.startTls()
      await withTimeout(socket.opened, 'smtp_tls_failed')
      channel = createLineChannel(socket, 'smtp_tls_failed')
      ehlo = await smtpCommand(channel, 'EHLO eiden-reach.invalid')
      expectSmtpCode(250, ehlo, 'smtp_connection_failed')
    }

    const authLine = ehlo.text.split('\n').find(line => /^AUTH(?:\s|=)/i.test(line.trim())) ?? ''
    const mechanisms = authLine.replace(/^AUTH(?:\s*=)?\s*/i, '').toUpperCase().split(/\s+/)
    if (mechanisms.includes('PLAIN')) {
      const authValue = encodeBase64(`\0${address}\0${password}`)
      const result = await smtpCommand(channel, `AUTH PLAIN ${authValue}`)
      if (result.code === 334) expectSmtpCode(235, await smtpCommand(channel, authValue), 'smtp_authentication_failed')
      else expectSmtpCode(235, result, 'smtp_authentication_failed')
    } else if (mechanisms.includes('LOGIN')) {
      expectSmtpCode(334, await smtpCommand(channel, 'AUTH LOGIN'), 'smtp_authentication_failed')
      expectSmtpCode(334, await smtpCommand(channel, encodeBase64(address)), 'smtp_authentication_failed')
      expectSmtpCode(235, await smtpCommand(channel, encodeBase64(password)), 'smtp_authentication_failed')
    } else {
      throw new MailboxProtocolError('smtp_auth_not_supported')
    }

    try { await smtpCommand(channel, 'QUIT') } catch { /* authenticated test already succeeded */ }
  } catch (error) {
    if (error instanceof MailboxProtocolError) throw error
    throw new MailboxProtocolError('smtp_connection_failed')
  } finally {
    if (channel) await channel.close()
    else if (socket) try { await socket.close() } catch { /* best effort */ }
  }
}

export async function verifySmtpLogin(address: string, password: string): Promise<{ port: number; tlsMode: 'implicit_tls' | 'starttls' }> {
  try {
    await verifySmtpLoginOnPort(address, password, 465)
    return { port: 465, tlsMode: 'implicit_tls' }
  } catch (error) {
    if (!(error instanceof MailboxProtocolError) || !['smtp_connection_failed', 'smtp_tls_failed', 'smtp_auth_not_supported', 'connection_timeout'].includes(error.code)) throw error
    await verifySmtpLoginOnPort(address, password, 587)
    return { port: 587, tlsMode: 'starttls' }
  }
}

export async function verifyMailboxCredentials(address: string, password: string) {
  await verifyImapLogin(address, password)
  const smtp = await verifySmtpLogin(address, password)
  return { imapPort: 993, imapTlsMode: 'implicit_tls' as const, smtpPort: smtp.port, smtpTlsMode: smtp.tlsMode }
}

export async function listImapFolders(address: string, password: string): Promise<ImapFolder[]> {
  const socket = await openSocket('imap.hostinger.com', 993, 'on', 'imap_connection_failed')
  let channel: LineChannel | undefined
  try {
    channel = createLineChannel(socket, 'imap_connection_failed')
    const greeting = await channel.readLine()
    if (!/^\*\s+OK\b/i.test(greeting) && !/^\*\s+PREAUTH\b/i.test(greeting)) throw new MailboxProtocolError('imap_connection_failed')
    await channel.writeLine(`A001 LOGIN ${quoteImap(address)} ${quoteImap(password)}`)
    let logged = false
    for (let count = 0; count < 40; count += 1) {
      const line = await channel.readLine()
      if (!/^A001\s+/i.test(line)) continue
      if (/^A001\s+OK\b/i.test(line)) logged = true
      else throw new MailboxProtocolError('imap_authentication_failed')
      break
    }
    if (!logged) throw new MailboxProtocolError('connection_timeout')
    await channel.writeLine('A002 LIST "" "*"')
    const folders: ImapFolder[] = []
    for (let count = 0; count < 200; count += 1) {
      const line = await channel.readLine()
      if (/^A002\s+/i.test(line)) break
      const folder = parseImapListLine(line)
      if (folder) folders.push(folder)
    }
    await channel.writeLine('A003 LOGOUT')
    try { await channel.readLine() } catch { /* best effort */ }
    return folders
  } catch (error) {
    if (error instanceof MailboxProtocolError) throw error
    throw new MailboxProtocolError('imap_connection_failed')
  } finally {
    if (channel) await channel.close()
    else try { await socket.close() } catch { /* best effort */ }
  }
}

export async function searchImapUids(address: string, password: string, folder: string, sinceUid: number, limit: number): Promise<{ uids: number[]; hasMore: boolean }> {
  const socket = await openSocket('imap.hostinger.com', 993, 'on', 'imap_connection_failed')
  let channel: LineChannel | undefined
  try {
    channel = createLineChannel(socket, 'imap_connection_failed')
    const greeting = await channel.readLine()
    if (!/^\*\s+(?:OK|PREAUTH)\b/i.test(greeting)) throw new MailboxProtocolError('imap_connection_failed')
    await channel.writeLine(`A001 LOGIN ${quoteImap(address)} ${quoteImap(password)}`)
    let logged = false
    for (let count = 0; count < 40; count += 1) {
      const line = await channel.readLine()
      if (!/^A001\s+/i.test(line)) continue
      if (/^A001\s+OK\b/i.test(line)) logged = true
      else throw new MailboxProtocolError('imap_authentication_failed')
      break
    }
    if (!logged) throw new MailboxProtocolError('connection_timeout')
    await channel.writeLine(`A002 SELECT ${quoteImap(folder)}`)
    for (let count = 0; count < 40; count += 1) {
      const line = await channel.readLine()
      if (/^A002\s+/i.test(line)) {
        if (!/^A002\s+OK\b/i.test(line)) throw new MailboxProtocolError('imap_connection_failed')
        break
      }
    }
    const range = sinceUid > 0 ? `${sinceUid + 1}:*` : '1:*'
    await channel.writeLine(`A003 UID SEARCH UID ${range}`)
    let uids: number[] = []
    for (let count = 0; count < 40; count += 1) {
      const line = await channel.readLine()
      if (/^A003\s+/i.test(line)) break
      const parsed = parseImapSearchLine(line)
      if (parsed) uids = parsed
    }
    await channel.writeLine('A004 LOGOUT')
    try { await channel.readLine() } catch { /* best effort */ }
    const sorted = [...new Set(uids)].sort((a, b) => a - b)
    const page = sorted.slice(0, Math.max(1, limit))
    return { uids: page, hasMore: sorted.length > page.length }
  } catch (error) {
    if (error instanceof MailboxProtocolError) throw error
    throw new MailboxProtocolError('imap_connection_failed')
  } finally {
    if (channel) await channel.close()
    else try { await socket.close() } catch { /* best effort */ }
  }
}

export type FetchedMessage = { uid: number; raw: Uint8Array }

export async function fetchImapMessages(address: string, password: string, folder: string, uids: number[]): Promise<FetchedMessage[]> {
  if (uids.length === 0) return []
  const socket = await openSocket('imap.hostinger.com', 993, 'on', 'imap_connection_failed')
  let channel: LineChannel | undefined
  try {
    channel = createLineChannel(socket, 'imap_connection_failed')
    const greeting = await channel.readLine()
    if (!/^\*\s+(?:OK|PREAUTH)\b/i.test(greeting)) throw new MailboxProtocolError('imap_connection_failed')
    await channel.writeLine(`A001 LOGIN ${quoteImap(address)} ${quoteImap(password)}`)
    let logged = false
    for (let count = 0; count < 40; count += 1) {
      const line = await channel.readLine()
      if (!/^A001\s+/i.test(line)) continue
      if (/^A001\s+OK\b/i.test(line)) logged = true
      else throw new MailboxProtocolError('imap_authentication_failed')
      break
    }
    if (!logged) throw new MailboxProtocolError('connection_timeout')
    await channel.writeLine(`A002 SELECT ${quoteImap(folder)}`)
    for (let count = 0; count < 40; count += 1) {
      const line = await channel.readLine()
      if (/^A002\s+/i.test(line)) {
        if (!/^A002\s+OK\b/i.test(line)) throw new MailboxProtocolError('imap_connection_failed')
        break
      }
    }
    const set = uids.join(',')
    await channel.writeLine(`A003 UID FETCH ${set} (UID BODY.PEEK[])`)
    const results: FetchedMessage[] = []
    for (let count = 0; count < 10000; count += 1) {
      const line = await channel.readLine()
      if (/^A003\s+/i.test(line)) break
      const uidMatch = /^\*\s+\d+\s+FETCH\s+\(UID\s+(\d+).*\{(\d+)\}$/i.exec(line)
      if (!uidMatch) continue
      const uid = Number(uidMatch[1])
      const literalLength = Number(uidMatch[2])
      const raw = await channel.readBytes(literalLength)
      const closing = await channel.readLine()
      if (closing.trim() !== ')') throw new MailboxProtocolError('imap_connection_failed')
      results.push({ uid, raw })
    }
    await channel.writeLine('A004 LOGOUT')
    try { await channel.readLine() } catch { /* best effort */ }
    return results
  } catch (error) {
    if (error instanceof MailboxProtocolError) throw error
    throw new MailboxProtocolError('imap_connection_failed')
  } finally {
    if (channel) await channel.close()
    else try { await socket.close() } catch { /* best effort */ }
  }
}
