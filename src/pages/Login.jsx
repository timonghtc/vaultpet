import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'

export default function Login() {
  const { authMode, isAuthenticated, localLogin, navigateToLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTo = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('redirect')
    return raw || '/'
  }, [location.search])

  if (authMode === 'base44') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">Anmeldung</h1>
            <p className="text-sm text-slate-600">Diese App nutzt die Base44-Anmeldung.</p>
          </div>
          <button
            type="button"
            onClick={navigateToLogin}
            className="w-full h-10 rounded-md bg-slate-900 text-white text-sm font-medium"
          >
            Zur Anmeldung
          </button>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    navigate(redirectTo, { replace: true })
    return null
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
        throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.')
      }
      await localLogin({ email, password })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err?.message || 'Login fehlgeschlagen.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-cyan-50 via-teal-50 to-pink-50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="space-y-2">
          <div className="font-heading text-2xl text-primary">PetVault</div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">Anmelden</h1>
            <p className="text-sm text-slate-600">Melde dich mit deiner E-Mail an.</p>
          </div>
        </div>

        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        ) : null}

        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">E-Mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Passwort</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-60 shadow-lg shadow-primary/20"
          >
            {isSubmitting ? 'Bitte warten…' : 'Anmelden'}
          </button>
        </form>

        <div className="text-sm text-slate-600">
          Noch kein Konto?{' '}
          <Link className="text-slate-900 font-medium underline" to={`/register?redirect=${encodeURIComponent(redirectTo)}`}>
            Konto erstellen
          </Link>
        </div>
      </div>
    </div>
  )
}
