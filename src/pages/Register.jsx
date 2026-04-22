import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'

export default function Register() {
  const { authMode, isAuthenticated, localRegister, navigateToLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [robloxUsername, setRobloxUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTo = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('redirect')
    return raw || '/marketplace'
  }, [location.search])

  if (authMode === 'base44') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">Konto erstellen</h1>
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
      if (password !== password2) {
        throw new Error('Passwörter stimmen nicht überein.')
      }
      await localRegister({ email, password, robloxUsername, displayName })
      window.localStorage.setItem('pv_just_registered', '1')
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err?.message || 'Registrierung fehlgeschlagen.')
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
            <h1 className="text-xl font-semibold text-slate-900">Konto erstellen</h1>
            <p className="text-sm text-slate-600">Lege einen neuen Zugang an.</p>
          </div>
        </div>

        {error ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        ) : null}

        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              type="text"
              autoComplete="name"
              required
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
            />
            <div className="text-xs text-slate-500">2–30 Zeichen.</div>
          </div>
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
            <label className="text-sm font-medium text-slate-700">Roblox Username</label>
            <input
              value={robloxUsername}
              onChange={(e) => setRobloxUsername(e.target.value)}
              type="text"
              autoComplete="username"
              required
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
            />
            <div className="text-xs text-slate-500">3–20 Zeichen, nur Buchstaben/Zahlen/Unterstrich.</div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Passwort</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
            />
            <div className="text-xs text-slate-500">Mindestens 6 Zeichen.</div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Passwort wiederholen</label>
            <input
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-60 shadow-lg shadow-primary/20"
          >
            {isSubmitting ? 'Bitte warten…' : 'Registrieren'}
          </button>
        </form>

        <div className="text-sm text-slate-600">
          Schon ein Konto?{' '}
          <Link className="text-slate-900 font-medium underline" to={`/login?redirect=${encodeURIComponent(redirectTo)}`}>
            Anmelden
          </Link>
        </div>
      </div>
    </div>
  )
}
