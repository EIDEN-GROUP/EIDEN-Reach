export type ImapFolder = {
  name: string
  specialUse?: string
}

export function parseImapListLine(line: string): ImapFolder | null {
  const match = /^\*\s+LIST\s+\(([^)]*)\)\s+(?:"[^"]*"|NIL)\s+(.+)$/i.exec(line)
  if (!match) return null

  const flags = match[1]
  if (/\\Noselect\b/i.test(flags)) return null

  let name = match[2].trim()
  if (name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (!name || name.toUpperCase() === 'NIL') return null

  const wellKnown = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive']
  const specialUse = [...flags.matchAll(/\\([A-Za-z]+)/g)]
    .map(match => match[1].toLowerCase())
    .find(flag => wellKnown.includes(flag))

  return { name, specialUse }
}

export function parseImapSearchLine(line: string): number[] | null {
  const match = /^\*\s+SEARCH(?:\s+(.*))?$/i.exec(line)
  if (!match) return null

  return [...new Set((match[1] ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
    .filter(uid => Number.isSafeInteger(uid) && uid > 0))]
    .sort((left, right) => left - right)
}

export function parseMessageIds(value?: string): string[] {
  if (!value) return []
  const matches = value.replace(/\r?\n[\t ]+/g, ' ').match(/<[^<>\s]+>/g)
  return matches ? [...new Set(matches)] : []
}

export function deriveThreadProviderId(input: {
  messageId?: string
  inReplyTo?: string
  references?: string
}): string | null {
  return parseMessageIds(input.references)[0]
    ?? parseMessageIds(input.inReplyTo)[0]
    ?? parseMessageIds(input.messageId)[0]
    ?? null
}
