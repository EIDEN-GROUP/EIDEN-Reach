import { useEffect, useState } from 'react'
import { avatarSignedUrl } from '../lib/profile'

export function ProfileAvatar({ path, label, size = 'md' }: { path: string | null; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setUrl(null)
    if (!path) return
    void avatarSignedUrl(path).then(signed => { if (active) setUrl(signed) })
    return () => { active = false }
  }, [path])

  const initial = (label.trim()[0] ?? '?').toUpperCase()
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initial}
    </span>
  )
}
