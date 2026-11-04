import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, Inbox, ShieldCheck, Workflow } from 'lucide-react'
import nodeworkLogo from '../assets/nodework-logo-mark.png'
import { supabase } from '../lib/supabase'

const highlights = [
  { icon: Workflow, text: 'Follow-ups stop the moment a contact replies.' },
  { icon: Inbox, text: 'Conversations and mailboxes in one shared inbox.' },
  { icon: ShieldCheck, text: 'Access and every change are set and recorded by your workspace.' },
]

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const { error: authError } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    if (authError) setError('That email and password do not match. Check them, or ask a workspace administrator for access.')
    setBusy(false)
  }

  return <main className="auth-page">
    <aside className="auth-aside">
      <div className="auth-brand">
        <img className="auth-logo" src={nodeworkLogo} alt="" aria-hidden="true" />
        <span>EIDEN Reach</span>
      </div>
      <div className="auth-pitch">
        <h1>Reach the right people. Move business forward.</h1>
        <p>Your sales conversations, follow-up sequences and pipeline, in one workspace.</p>
      </div>
      <ul className="auth-highlights">
        {highlights.map(({ icon: Icon, text }) => <li key={text}><span className="auth-highlight-icon"><Icon size={16} /></span>{text}</li>)}
      </ul>
    </aside>

    <section className="auth-form-side">
      <form className="auth-card" onSubmit={submit} noValidate={false}>
        <header className="auth-card-head">
          <img className="auth-card-logo" src={nodeworkLogo} alt="" aria-hidden="true" />
          <h2>Sign in</h2>
          <p>Use the email your workspace administrator invited you with.</p>
        </header>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <label className="auth-field">
          <span>Email address</span>
          <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" autoFocus required maxLength={320} placeholder="you@company.com" />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <span className="auth-password">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required maxLength={1024} placeholder="Your password" />
            <button type="button" className="auth-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(current => !current)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>

        <button className="primary-button auth-submit" disabled={busy}>
          {busy ? 'Signing in…' : <>Sign in <ArrowRight size={16} /></>}
        </button>

        <p className="auth-help">Forgot your password or can't get in? Ask your workspace administrator to check your access.</p>
      </form>
      <p className="auth-footer">EIDEN Reach · Sales operations</p>
    </section>
  </main>
}
