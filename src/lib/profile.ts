import { supabase } from './supabase'

export type Profile = { id: string; display_name: string | null; avatar_path: string | null }

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const SIGNED_URL_SECONDS = 60 * 60

function client() {
  if (!supabase) throw new Error('The workspace database is not configured.')
  return supabase
}

// READ
export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client().from('profiles').select('id,display_name,avatar_path').eq('id', userId).maybeSingle()
  if (error) throw new Error('Your profile could not be loaded.')
  return data as Profile | null
}

// CREATE (the sign-up trigger normally creates this row; this covers accounts created before it existed)
export async function ensureProfile(userId: string): Promise<void> {
  const { error } = await client().from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error('Your profile could not be created.')
}

// UPDATE
export async function saveDisplayName(userId: string, displayName: string): Promise<Profile> {
  const trimmed = displayName.trim()
  if (trimmed.length > 80) throw new Error('Display name must be 80 characters or fewer.')
  const { data, error } = await client()
    .from('profiles')
    .update({ display_name: trimmed || null, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id,display_name,avatar_path')
    .single()
  if (error) throw new Error('Your name could not be saved.')
  return data as Profile
}

export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_EXTENSIONS[file.type]) return 'Choose a PNG, JPEG or WebP image.'
  if (file.size > AVATAR_MAX_BYTES) return 'Choose an image of 2 MB or smaller.'
  return null
}

// CREATE/UPDATE the picture: upload the new object, point the profile at it, then remove the old object.
export async function uploadAvatar(userId: string, file: File): Promise<Profile> {
  const problem = validateAvatarFile(file)
  if (problem) throw new Error(problem)
  const extension = AVATAR_EXTENSIONS[file.type]
  const previous = await loadProfile(userId)
  const path = `${userId}/${crypto.randomUUID()}.${extension}`

  const upload = await client().storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false })
  if (upload.error) throw new Error('The photo could not be uploaded.')

  const { data, error } = await client()
    .from('profiles')
    .update({ avatar_path: path, avatar_updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id,display_name,avatar_path')
    .single()
  if (error) {
    await client().storage.from('avatars').remove([path])
    throw new Error('The photo could not be saved to your profile.')
  }
  if (previous?.avatar_path) await client().storage.from('avatars').remove([previous.avatar_path])
  return data as Profile
}

// DELETE the picture
export async function removeAvatar(userId: string, currentPath: string): Promise<Profile> {
  const { data, error } = await client()
    .from('profiles')
    .update({ avatar_path: null, avatar_updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id,display_name,avatar_path')
    .single()
  if (error) throw new Error('The photo could not be removed.')
  await client().storage.from('avatars').remove([currentPath])
  return data as Profile
}

export async function avatarSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await client().storage.from('avatars').createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error) return null
  return data.signedUrl
}
