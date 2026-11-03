import type { Address, Email } from 'postal-mime'
import { deriveThreadProviderId, parseMessageIds } from './imap-parsing'

const MAX_TEXT_BODY = 200_000
const MAX_HTML_BODY = 400_000
const MAX_RAW_HEADERS_JSON = 63_000
const MAX_ATTACHMENTS = 100

type MappingContext = {
  organizationId: string
  mailboxId: string
  folderProviderId: string
  uid: number
}

type ParticipantType = 'from' | 'to' | 'cc' | 'bcc' | 'reply_to'

function truncate(value: string | undefined, max: number): string | null {
  if (!value) return null
  return value.trim().slice(0, max)
}

function safeReceivedAt(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function participantRows(type: ParticipantType, addresses: Address[] | undefined) {
  return (addresses ?? [])
    .flatMap((address, ordinal) => {
      const emailAddress = address.address?.trim().toLowerCase()
      if (!emailAddress) return []
      return [{
        participant_type: type,
        email_address: emailAddress,
        display_name: address.name?.trim().slice(0, 320) || null,
        ordinal,
      }]
    })
}

function attachmentSize(content: unknown): number {
  if (typeof content === 'string') return new TextEncoder().encode(content).byteLength
  if (content instanceof ArrayBuffer) return content.byteLength
  if (ArrayBuffer.isView(content)) return content.byteLength
  return 0
}

function safeHeaders(email: Email): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const header of email.headers) {
    if (!header?.key || typeof header.value !== 'string') continue
    const key = header.key.toLowerCase().slice(0, 200)
    const value = header.value.slice(0, 4_000)
    const existing = result[key]
    if (existing === undefined) result[key] = value
    else if (Array.isArray(existing)) existing.push(value)
    else result[key] = [existing, value]
    if (JSON.stringify(result).length >= MAX_RAW_HEADERS_JSON) {
      delete result[key]
      break
    }
  }
  return result
}

export function mapParsedEmail(email: Email, context: MappingContext) {
  const from = email.from ? [email.from] : []
  const references = parseMessageIds(email.references)
  const messageId = parseMessageIds(email.messageId)[0] ?? null
  const providerMessageKey = messageId ?? `${context.folderProviderId}:${context.uid}`
  const inReplyTo = parseMessageIds(email.inReplyTo)[0] ?? null
  const text = truncate(email.text, MAX_TEXT_BODY)
  const html = truncate(email.html, MAX_HTML_BODY)
  const snippetSource = text ?? email.subject ?? ''

  const participants = [
    ...participantRows('from', from),
    ...participantRows('to', email.to),
    ...participantRows('cc', email.cc),
    ...participantRows('bcc', email.bcc),
    ...participantRows('reply_to', email.replyTo),
  ]

  const attachments = email.attachments.slice(0, MAX_ATTACHMENTS).map((attachment, index) => ({
    filename: attachment.filename?.slice(0, 1_024) || `attachment-${index + 1}`,
    content_type: attachment.mimeType?.slice(0, 255) || 'application/octet-stream',
    size_bytes: attachmentSize(attachment.content),
    inline_content_id: attachment.contentId?.slice(0, 998) || null,
  }))

  return {
    threadProviderId: deriveThreadProviderId({
      messageId: email.messageId,
      inReplyTo: email.inReplyTo,
      references: email.references,
    }) ?? providerMessageKey,
    providerMessageKey,
    message: {
      organization_id: context.organizationId,
      mailbox_account_id: context.mailboxId,
      direction: 'inbound' as const,
      provider_message_key: providerMessageKey,
      rfc_message_id: messageId,
      in_reply_to: inReplyTo,
      references_header: references,
      subject: email.subject?.slice(0, 998) ?? '',
      snippet: snippetSource.replace(/\s+/g, ' ').trim().slice(0, 320),
      text_body: text,
      html_body: html,
      received_at: safeReceivedAt(email.date),
      raw_headers: safeHeaders(email),
    },
    participants,
    attachments,
  }
}
