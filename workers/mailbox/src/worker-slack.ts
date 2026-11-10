export async function notifySlack(webhook: string | undefined, text: string): Promise<void> {
  if (!webhook) return
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (error) {
    console.error('SLACK_NOTIFY_FAILED', error)
  }
}
