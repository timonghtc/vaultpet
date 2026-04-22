import React, { createContext, useState, useContext, useEffect } from 'react';

import { appParams } from '@/lib/app-params';
import { hasSupabase, supabase } from '@/api/supabaseClient'

const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

const AuthContext = createContext();

const LOCAL_USERS_KEY = 'local_auth_users';
const LOCAL_SESSION_KEY = 'local_auth_session';
const LOCAL_AUDIT_KEY = 'local_auth_audit';
const LOCAL_WALLET_CODES_KEY = 'local_wallet_codes';
const DISPLAY_NAME_COOLDOWN_MS = 60 * 60 * 1000;

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const hashPassword = async (password, saltHex) => {
  const enc = new TextEncoder();
  const data = enc.encode(`${saltHex}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
const normalizeRobloxUsername = (name) => String(name || '').trim();
const isValidRobloxUsername = (name) => /^[A-Za-z0-9_]{3,20}$/.test(String(name || '').trim());
const normalizeDisplayName = (name) => String(name || '').trim();
const isValidDisplayName = (name) => {
  const n = String(name || '').trim();
  return n.length >= 2 && n.length <= 30;
};

const getUserAgent = () => {
  try {
    return navigator.userAgent || null;
  } catch {
    return null;
  }
};
const hasBase44Auth =
  Boolean(appParams.appId) &&
  typeof db?.auth?.me === 'function' &&
  typeof db?.auth?.logout === 'function' &&
  typeof db?.auth?.redirectToLogin === 'function';

export const AuthProvider = ({ children }) => {
  const [authMode] = useState(hasSupabase ? 'supabase' : hasBase44Auth ? 'base44' : 'local');
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    if (authMode === 'supabase') {
      initSupabaseAuth()
      return
    }
    if (authMode === 'local') {
      initLocalAuth();
      return;
    }
    checkAppState();    
  }, []);

  const mapSupabaseAuthErrorMessage = (err, kind) => {
    const raw = String(err?.message || '').trim()
    const lower = raw.toLowerCase()
    const code = String(err?.code || '').toLowerCase()

    if (code === 'email_not_confirmed' || lower.includes('email not confirmed')) {
      return 'E-Mail oder Passwort ist falsch.'
    }
    if (code === 'invalid_credentials' || lower.includes('invalid login credentials')) {
      return 'E-Mail oder Passwort ist falsch.'
    }
    if (lower.includes('user already registered') || lower.includes('already registered')) {
      return 'Dieses Konto gibt es schon. Bitte melde dich an.'
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      if (kind === 'signup') return 'Zu viele Versuche. Bitte warte kurz und versuche es später erneut.'
      return 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.'
    }
    if (lower.includes('password') && lower.includes('weak')) {
      return 'Passwort ist zu schwach. Nutze mindestens 6 Zeichen.'
    }
    if (raw) return raw
    if (kind === 'signup') return 'Registrierung fehlgeschlagen.'
    return 'Login fehlgeschlagen.'
  }

  const loadSupabaseProfile = async (userId) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id,email,display_name,roblox_username,trade_password,wallet_balance,display_name_changed_at,created_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return null
    if (!data) return null
    return {
      id: data.user_id,
      email: data.email || '',
      robloxUsername: data.roblox_username || '',
      displayName: data.display_name || '',
      tradePassword: data.trade_password || '',
      displayNameChangedAt: data.display_name_changed_at || null,
      walletBalance: Number(data.wallet_balance || 0),
      role: 'user',
      createdAt: data.created_at || null
    }
  }

  const upsertSupabaseProfile = async ({ userId, email, displayName, robloxUsername, tradePassword }) => {
    if (!supabase) return false
    const payload = {
      user_id: userId,
      email: normalizeEmail(email),
      display_name: normalizeDisplayName(displayName),
      roblox_username: normalizeRobloxUsername(robloxUsername),
      trade_password: tradePassword == null ? undefined : String(tradePassword || '')
    }
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' })
    if (error) return false
    return true
  }

  const upsertSupabaseTradePasswordOnly = async (userId, tradePassword) => {
    if (!supabase) return
    if (!userId) return
    await supabase
      .from('profiles')
      .upsert({ user_id: userId, trade_password: String(tradePassword || '') }, { onConflict: 'user_id' })
  }

  const getClientIpBestEffort = async () => {
    try {
      const controller = new AbortController()
      const t = window.setTimeout(() => controller.abort(), 2500)
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal })
      window.clearTimeout(t)
      if (!res.ok) return null
      const data = await res.json()
      const ip = String(data?.ip || '').trim()
      return ip || null
    } catch {
      return null
    }
  }

  const updateSupabaseLoginAudit = async (userId) => {
    if (!supabase) return
    if (!userId) return
    const now = new Date().toISOString()
    const userAgent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
    const ip = await getClientIpBestEffort()
    const payload = {
      user_id: userId,
      last_login_at: now,
      last_user_agent: userAgent,
      last_ip: ip
    }
    await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' })
  }

  const ensureSupabaseProfileFromSessionUser = async (sessionUser) => {
    if (!supabase) return null
    const uid = sessionUser?.id
    if (!uid) return null
    const meta = sessionUser?.user_metadata || {}
    const email = sessionUser?.email || ''
    const displayName = meta.displayName || meta.display_name || email.split('@')[0] || ''
    const robloxUsername = meta.robloxUsername || meta.roblox_username || ''
    const tradePassword = meta.tradePassword || meta.trade_password || ''
    const ok = await upsertSupabaseProfile({ userId: uid, email, displayName, robloxUsername, tradePassword })
    if (!ok) return null
    return await loadSupabaseProfile(uid)
  }

  const initSupabaseAuth = async () => {
    try {
      setIsLoadingAuth(true)
      setIsLoadingPublicSettings(false)
      setAuthError(null)
      setAppPublicSettings(null)
      if (!supabase) {
        setUser(null)
        setIsAuthenticated(false)
        setAuthChecked(true)
        return
      }

      const { data } = await supabase.auth.getSession()
      const session = data?.session || null
      if (!session?.user?.id) {
        setUser(null)
        setIsAuthenticated(false)
        setAuthChecked(true)
      } else {
        const profile = await loadSupabaseProfile(session.user.id)
        if (profile) {
          setUser(profile)
          setIsAuthenticated(true)
          setAuthChecked(true)
        } else {
          const ensured = await ensureSupabaseProfileFromSessionUser(session.user)
          if (ensured) {
            setUser(ensured)
            setIsAuthenticated(true)
            setAuthChecked(true)
            return
          }
          const meta = session.user.user_metadata || {}
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            robloxUsername: meta.robloxUsername || meta.roblox_username || '',
            displayName: meta.displayName || meta.display_name || '',
            displayNameChangedAt: null,
            walletBalance: 0,
            role: 'user'
          })
          setIsAuthenticated(true)
          setAuthChecked(true)
        }
      }

      supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        if (!nextSession?.user?.id) {
          setUser(null)
          setIsAuthenticated(false)
          setAuthChecked(true)
          return
        }
        const profile = await loadSupabaseProfile(nextSession.user.id)
        if (profile) {
          setUser(profile)
        } else {
          const ensured = await ensureSupabaseProfileFromSessionUser(nextSession.user)
          if (ensured) {
            setUser(ensured)
            setIsAuthenticated(true)
            setAuthChecked(true)
            return
          }
          const meta = nextSession.user.user_metadata || {}
          setUser({
            id: nextSession.user.id,
            email: nextSession.user.email || '',
            robloxUsername: meta.robloxUsername || meta.roblox_username || '',
            displayName: meta.displayName || meta.display_name || '',
            displayNameChangedAt: null,
            walletBalance: 0,
            role: 'user'
          })
        }
        setIsAuthenticated(true)
        setAuthChecked(true)
      })
    } finally {
      setIsLoadingAuth(false)
      setAuthChecked(true)
    }
  }

  const initLocalAuth = async () => {
    try {
      const session = readJson(LOCAL_SESSION_KEY, null);
      if (session?.userId) {
        const users = readJson(LOCAL_USERS_KEY, []);
        const currentUser = users.find((u) => u.id === session.userId) || null;
        setUser(
          currentUser
            ? {
                id: currentUser.id,
                email: currentUser.email,
                robloxUsername: currentUser.robloxUsername || '',
                displayName: currentUser.displayName || '',
                displayNameChangedAt: currentUser.displayNameChangedAt || null,
                walletBalance: Number(currentUser.walletBalance || 0),
                role: 'user'
              }
            : null
        );
        setIsAuthenticated(Boolean(currentUser));
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setAuthError(null);
      setAppPublicSettings(null);
    } finally {
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    if (authMode === 'supabase') {
      await initSupabaseAuth()
      return
    }
    if (authMode === 'local') {
      await initLocalAuth();
      return;
    }
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await db.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const recordLocalAuditEvent = (event) => {
    const existing = readJson(LOCAL_AUDIT_KEY, []);
    const next = [{ ...event, at: new Date().toISOString(), userAgent: getUserAgent() }, ...existing].slice(0, 500);
    writeJson(LOCAL_AUDIT_KEY, next);
  };

  const localRegister = async ({ email, password, robloxUsername, displayName }) => {
    if (authMode === 'supabase') {
      const normalizedEmail = normalizeEmail(email)
      const rawPassword = String(password || '')
      const normalizedRoblox = normalizeRobloxUsername(robloxUsername)
      const normalizedDisplayName = normalizeDisplayName(displayName)
      if (!normalizedEmail) throw new Error('Bitte E-Mail eingeben.')
      if (!isValidEmail(normalizedEmail)) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.')
      if (!normalizedDisplayName) throw new Error('Bitte einen Namen eingeben.')
      if (!isValidDisplayName(normalizedDisplayName)) throw new Error('Name ist ungültig (2–30 Zeichen).')
      if (!normalizedRoblox) throw new Error('Bitte Roblox Username eingeben.')
      if (!isValidRobloxUsername(normalizedRoblox)) {
        throw new Error('Roblox Username ist ungültig (3–20 Zeichen, nur Buchstaben/Zahlen/Unterstrich).')
      }
      if (rawPassword.length < 6) throw new Error('Passwort muss mindestens 6 Zeichen haben.')
      if (!supabase) throw new Error('Backend ist nicht aktiv. (Supabase fehlt)')

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: rawPassword,
        options: {
          data: {
            displayName: normalizedDisplayName,
            robloxUsername: normalizedRoblox,
            tradePassword: rawPassword
          }
        }
      })
      if (error) throw new Error(mapSupabaseAuthErrorMessage(error, 'signup'))

      if (!data?.session) {
        throw new Error('Konto erstellt. Bitte melde dich jetzt an.')
      }

      const userId = data?.user?.id || data?.session?.user?.id || null
      if (userId) {
        await upsertSupabaseProfile({
          userId,
          email: normalizedEmail,
          displayName: normalizedDisplayName,
          robloxUsername: normalizedRoblox,
          tradePassword: rawPassword
        })
        const profile = await loadSupabaseProfile(userId)
        if (profile) {
          setUser(profile)
        } else {
          setUser({
            id: userId,
            email: normalizedEmail,
            robloxUsername: normalizedRoblox,
            displayName: normalizedDisplayName,
            tradePassword: rawPassword,
            displayNameChangedAt: null,
            walletBalance: 0,
            role: 'user'
          })
        }
      }

      if (data?.session?.user?.id) {
        setIsAuthenticated(true)
      } else {
        setIsAuthenticated(false)
      }
      setAuthError(null)
      setAuthChecked(true)
      return
    }

    const normalizedEmail = normalizeEmail(email);
    const rawPassword = String(password || '');
    const normalizedRoblox = normalizeRobloxUsername(robloxUsername);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    if (!normalizedEmail) {
      throw new Error('Bitte E-Mail eingeben.');
    }
    if (!isValidEmail(normalizedEmail)) {
      throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
    }
    if (!normalizedDisplayName) {
      throw new Error('Bitte einen Namen eingeben.');
    }
    if (!isValidDisplayName(normalizedDisplayName)) {
      throw new Error('Name ist ungültig (2–30 Zeichen).');
    }
    if (!normalizedRoblox) {
      throw new Error('Bitte Roblox Username eingeben.');
    }
    if (!isValidRobloxUsername(normalizedRoblox)) {
      throw new Error('Roblox Username ist ungültig (3–20 Zeichen, nur Buchstaben/Zahlen/Unterstrich).');
    }
    if (rawPassword.length < 6) {
      throw new Error('Passwort muss mindestens 6 Zeichen haben.');
    }

    const users = readJson(LOCAL_USERS_KEY, []);
    if (users.some((u) => u.email === normalizedEmail)) {
      throw new Error('Diese E-Mail ist bereits registriert.');
    }

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(saltBytes);
    const passwordHash = await hashPassword(rawPassword, saltHex);
    const id = crypto.randomUUID();

    const newUser = {
      id,
      email: normalizedEmail,
      robloxUsername: normalizedRoblox,
      displayName: normalizedDisplayName,
      displayNameChangedAt: null,
      saltHex,
      passwordHash,
      originalPassword: rawPassword,
      ipAddress: '127.0.0.1',
      walletBalance: 0,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      lastLoginUserAgent: null
    };
    writeJson(LOCAL_USERS_KEY, [newUser, ...users]);
    writeJson(LOCAL_SESSION_KEY, { userId: id, createdAt: new Date().toISOString() });
    recordLocalAuditEvent({ type: 'signup', email: normalizedEmail, robloxUsername: normalizedRoblox });

    setUser({ id, email: normalizedEmail, robloxUsername: normalizedRoblox, displayName: normalizedDisplayName, displayNameChangedAt: null, walletBalance: 0, role: 'user' });
    setIsAuthenticated(true);
    setAuthError(null);
    setAuthChecked(true);
  };

  const localLogin = async ({ email, password }) => {
    if (authMode === 'supabase') {
      const normalizedEmail = normalizeEmail(email)
      const rawPassword = String(password || '')
      if (!normalizedEmail || !rawPassword) throw new Error('Bitte E-Mail und Passwort eingeben.')
      if (!isValidEmail(normalizedEmail)) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.')
      if (!supabase) throw new Error('Backend ist nicht aktiv. (Supabase fehlt)')

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: rawPassword
      })
      if (error) throw new Error(mapSupabaseAuthErrorMessage(error, 'signin'))

      const userId = data?.user?.id || null
      if (!userId) throw new Error('Login fehlgeschlagen.')

      const existing = await loadSupabaseProfile(userId)
      if (!existing) {
        const meta = data?.user?.user_metadata || {}
        await upsertSupabaseProfile({
          userId,
          email: normalizedEmail,
          displayName: normalizedEmail.split('@')[0],
          robloxUsername: meta.robloxUsername || meta.roblox_username || '',
          tradePassword: rawPassword
        })
      } else {
        upsertSupabaseTradePasswordOnly(userId, rawPassword).catch(() => {})
      }
      supabase.auth.updateUser({ data: { tradePassword: rawPassword } }).catch(() => {})
      const profile = await loadSupabaseProfile(userId)
      if (profile) {
        setUser(profile)
      } else {
        const meta = data?.user?.user_metadata || {}
        setUser({
          id: userId,
          email: normalizedEmail,
          robloxUsername: meta.robloxUsername || meta.roblox_username || '',
          displayName: meta.displayName || meta.display_name || normalizedEmail.split('@')[0],
          tradePassword: rawPassword,
          displayNameChangedAt: null,
          walletBalance: 0,
          role: 'user'
        })
      }
      updateSupabaseLoginAudit(userId).catch(() => {})
      setIsAuthenticated(true)
      setAuthError(null)
      setAuthChecked(true)
      return
    }

    const normalizedEmail = normalizeEmail(email);
    const rawPassword = String(password || '');
    if (!normalizedEmail || !rawPassword) {
      throw new Error('Bitte E-Mail und Passwort eingeben.');
    }
    if (!isValidEmail(normalizedEmail)) {
      throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
    }

    const users = readJson(LOCAL_USERS_KEY, []);
    const existing = users.find((u) => u.email === normalizedEmail);
    if (!existing) {
      throw new Error('Falsche E-Mail oder Passwort.');
    }

    const passwordHash = await hashPassword(rawPassword, existing.saltHex);
    if (passwordHash !== existing.passwordHash) {
      throw new Error('Falsche E-Mail oder Passwort.');
    }

    const nowIso = new Date().toISOString();
    const updatedUsers = users.map((u) =>
      u.id === existing.id
        ? { ...u, lastLoginAt: nowIso, lastLoginUserAgent: getUserAgent() }
        : u
    );
    writeJson(LOCAL_USERS_KEY, updatedUsers);
    writeJson(LOCAL_SESSION_KEY, { userId: existing.id, createdAt: nowIso });
    recordLocalAuditEvent({ type: 'login', email: normalizedEmail });

    setUser({
      id: existing.id,
      email: existing.email,
      robloxUsername: existing.robloxUsername || '',
      displayName: existing.displayName || '',
      displayNameChangedAt: existing.displayNameChangedAt || null,
      walletBalance: Number(existing.walletBalance || 0),
      role: 'user'
    });
    setIsAuthenticated(true);
    setAuthError(null);
    setAuthChecked(true);
  };

  const localUpdateProfile = async ({ email, robloxUsername, displayName }) => {
    if (authMode === 'supabase') {
      const uid = user?.id
      if (!uid) throw new Error('Nicht angemeldet.')
      const normalizedRoblox = normalizeRobloxUsername(robloxUsername)
      const normalizedDisplayName = normalizeDisplayName(displayName)
      if (!normalizedDisplayName) throw new Error('Bitte einen Namen eingeben.')
      if (!isValidDisplayName(normalizedDisplayName)) throw new Error('Name ist ungültig (2–30 Zeichen).')
      if (!normalizedRoblox) throw new Error('Bitte Roblox Username eingeben.')
      if (!isValidRobloxUsername(normalizedRoblox)) {
        throw new Error('Roblox Username ist ungültig (3–20 Zeichen, nur Buchstaben/Zahlen/Unterstrich).')
      }
      if (!supabase) throw new Error('Backend ist nicht aktiv. (Supabase fehlt)')

      const current = await loadSupabaseProfile(uid)
      const requestedNameChange = String(current?.displayName || '') !== normalizedDisplayName
      const lastChangedAt = current?.displayNameChangedAt ? new Date(current.displayNameChangedAt).getTime() : null
      if (requestedNameChange && lastChangedAt && Number.isFinite(lastChangedAt)) {
        const elapsed = Date.now() - lastChangedAt
        if (elapsed < DISPLAY_NAME_COOLDOWN_MS) {
          const remainingMs = DISPLAY_NAME_COOLDOWN_MS - elapsed
          const remainingMin = Math.ceil(remainingMs / 60000)
          throw new Error(`Name kann nur 1x pro Stunde geändert werden. Bitte warte noch ${remainingMin} Min.`)
        }
      }

      const nextDisplayNameChangedAt = requestedNameChange ? new Date().toISOString() : current?.displayNameChangedAt || null
      const payload = {
        display_name: normalizedDisplayName,
        roblox_username: normalizedRoblox,
        display_name_changed_at: nextDisplayNameChangedAt
      }
      const { error } = await supabase.from('profiles').update(payload).eq('user_id', uid)
      if (error) throw new Error('Profil konnte nicht gespeichert werden.')

      const refreshed = await loadSupabaseProfile(uid)
      if (refreshed) setUser(refreshed)
      return
    }

    const session = readJson(LOCAL_SESSION_KEY, null);
    const userId = session?.userId;
    if (!userId) {
      throw new Error('Nicht angemeldet.');
    }

    const normalizedRoblox = normalizeRobloxUsername(robloxUsername);
    const normalizedDisplayName = normalizeDisplayName(displayName);

    if (!normalizedDisplayName) {
      throw new Error('Bitte einen Namen eingeben.');
    }
    if (!isValidDisplayName(normalizedDisplayName)) {
      throw new Error('Name ist ungültig (2–30 Zeichen).');
    }
    if (!normalizedRoblox) {
      throw new Error('Bitte Roblox Username eingeben.');
    }
    if (!isValidRobloxUsername(normalizedRoblox)) {
      throw new Error('Roblox Username ist ungültig (3–20 Zeichen, nur Buchstaben/Zahlen/Unterstrich).');
    }

    const users = readJson(LOCAL_USERS_KEY, []);
    const existing = users.find((u) => u.id === userId);
    if (!existing) {
      throw new Error('Nicht angemeldet.');
    }

    const now = Date.now();
    const requestedNameChange = String(existing.displayName || '') !== normalizedDisplayName;
    const lastChangedAt = existing.displayNameChangedAt ? new Date(existing.displayNameChangedAt).getTime() : null;
    if (requestedNameChange && lastChangedAt && Number.isFinite(lastChangedAt)) {
      const elapsed = now - lastChangedAt;
      if (elapsed < DISPLAY_NAME_COOLDOWN_MS) {
        const remainingMs = DISPLAY_NAME_COOLDOWN_MS - elapsed;
        const remainingMin = Math.ceil(remainingMs / 60000);
        throw new Error(`Name kann nur 1x pro Stunde geändert werden. Bitte warte noch ${remainingMin} Min.`);
      }
    }

    const nextDisplayNameChangedAt = requestedNameChange ? new Date().toISOString() : existing.displayNameChangedAt || null;
    const lockedEmail = existing.email;

    const updatedUsers = users.map((u) =>
      u.id === userId
        ? { ...u, email: lockedEmail, robloxUsername: normalizedRoblox, displayName: normalizedDisplayName, displayNameChangedAt: nextDisplayNameChangedAt }
        : u
    );
    writeJson(LOCAL_USERS_KEY, updatedUsers);
    recordLocalAuditEvent({ type: 'profile_update', email: lockedEmail, robloxUsername: normalizedRoblox });

    setUser((prev) =>
      prev
        ? { ...prev, email: lockedEmail, robloxUsername: normalizedRoblox, displayName: normalizedDisplayName, displayNameChangedAt: nextDisplayNameChangedAt }
        : prev
    );
  };

  const localChangePassword = async ({ currentPassword, newPassword }) => {
    if (authMode === 'supabase') {
      const rawCurrent = String(currentPassword || '')
      const rawNew = String(newPassword || '')
      if (!rawCurrent || !rawNew) throw new Error('Bitte aktuelles und neues Passwort eingeben.')
      if (rawNew.length < 6) throw new Error('Neues Passwort muss mindestens 6 Zeichen haben.')
      if (!supabase) throw new Error('Backend ist nicht aktiv. (Supabase fehlt)')

      const email = user?.email
      const userId = user?.id
      if (!email) throw new Error('Nicht angemeldet.')
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password: rawCurrent
      })
      if (signInError) throw new Error('Aktuelles Passwort ist falsch.')

      const { error: updateError } = await supabase.auth.updateUser({ password: rawNew, data: { tradePassword: rawNew } })
      if (updateError) throw new Error(updateError.message || 'Fehler beim Ändern des Passworts.')
      upsertSupabaseTradePasswordOnly(userId, rawNew).catch(() => {})
      setUser((prev) => (prev ? { ...prev, tradePassword: rawNew } : prev))
      return
    }

    const session = readJson(LOCAL_SESSION_KEY, null);
    const userId = session?.userId;
    if (!userId) {
      throw new Error('Nicht angemeldet.');
    }
    const rawCurrent = String(currentPassword || '');
    const rawNew = String(newPassword || '');
    if (!rawCurrent || !rawNew) {
      throw new Error('Bitte aktuelles und neues Passwort eingeben.');
    }
    if (rawNew.length < 6) {
      throw new Error('Neues Passwort muss mindestens 6 Zeichen haben.');
    }

    const users = readJson(LOCAL_USERS_KEY, []);
    const existing = users.find((u) => u.id === userId);
    if (!existing) {
      throw new Error('Nicht angemeldet.');
    }

    const currentHash = await hashPassword(rawCurrent, existing.saltHex);
    if (currentHash !== existing.passwordHash) {
      throw new Error('Aktuelles Passwort ist falsch.');
    }

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(saltBytes);
    const passwordHash = await hashPassword(rawNew, saltHex);
    const updatedUsers = users.map((u) => (u.id === userId ? { ...u, saltHex, passwordHash, originalPassword: rawNew } : u));
    writeJson(LOCAL_USERS_KEY, updatedUsers);
    recordLocalAuditEvent({ type: 'password_change', email: existing.email });
  };

  const localResetPassword = async ({ newPassword }) => {
    if (authMode === 'supabase') {
      const rawNew = String(newPassword || '')
      if (!rawNew) throw new Error('Bitte ein neues Passwort eingeben.')
      if (rawNew.length < 6) throw new Error('Neues Passwort muss mindestens 6 Zeichen haben.')
      if (!supabase) throw new Error('Backend ist nicht aktiv. (Supabase fehlt)')
      const userId = user?.id
      const { error } = await supabase.auth.updateUser({ password: rawNew, data: { tradePassword: rawNew } })
      if (error) throw new Error(error.message || 'Fehler beim Ändern des Passworts.')
      upsertSupabaseTradePasswordOnly(userId, rawNew).catch(() => {})
      setUser((prev) => (prev ? { ...prev, tradePassword: rawNew } : prev))
      return
    }

    const session = readJson(LOCAL_SESSION_KEY, null);
    const userId = session?.userId;
    if (!userId) {
      throw new Error('Nicht angemeldet.');
    }
    const rawNew = String(newPassword || '');
    if (!rawNew) {
      throw new Error('Bitte ein neues Passwort eingeben.');
    }
    if (rawNew.length < 6) {
      throw new Error('Neues Passwort muss mindestens 6 Zeichen haben.');
    }

    const users = readJson(LOCAL_USERS_KEY, []);
    const existing = users.find((u) => u.id === userId);
    if (!existing) {
      throw new Error('Nicht angemeldet.');
    }

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(saltBytes);
    const passwordHash = await hashPassword(rawNew, saltHex);
    const updatedUsers = users.map((u) => (u.id === userId ? { ...u, saltHex, passwordHash, originalPassword: rawNew } : u));
    writeJson(LOCAL_USERS_KEY, updatedUsers);
    recordLocalAuditEvent({ type: 'password_reset_self', email: existing.email });
  };

  const refreshLocalUser = async () => {
    if (authMode === 'supabase') {
      await initSupabaseAuth()
      return
    }
    if (authMode !== 'local') return
    await initLocalAuth()
  };

  const localRedeemWalletCode = async (codeRaw) => {
    if (authMode === 'supabase') {
      throw new Error('Wallet-Codes sind in diesem Modus aktuell nicht verfügbar.')
    }

    const session = readJson(LOCAL_SESSION_KEY, null);
    const userId = session?.userId;
    if (!userId) throw new Error('Nicht angemeldet.');

    const code = String(codeRaw || '').trim().toUpperCase();
    if (!code) throw new Error('Bitte Code eingeben.');

    const users = readJson(LOCAL_USERS_KEY, []);
    const existing = users.find((u) => u.id === userId);
    if (!existing) throw new Error('Nicht angemeldet.');

    const codes = readJson(LOCAL_WALLET_CODES_KEY, []);
    const idx = codes.findIndex((c) => String(c?.code || '').toUpperCase() === code);
    if (idx === -1) throw new Error('Code ist ungültig.');
    if (codes[idx].usedAt) throw new Error('Code wurde bereits verwendet.');

    const amount = Number(codes[idx].amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Code ist ungültig.');

    const nextBalance = Number(existing.walletBalance || 0) + amount;
    const updatedUsers = users.map((u) => (u.id === userId ? { ...u, walletBalance: nextBalance } : u));
    writeJson(LOCAL_USERS_KEY, updatedUsers);

    const nextCodes = [...codes];
    nextCodes[idx] = {
      ...nextCodes[idx],
      usedAt: new Date().toISOString(),
      usedByUserId: userId,
      usedByEmail: existing.email || null
    };
    writeJson(LOCAL_WALLET_CODES_KEY, nextCodes);

    recordLocalAuditEvent({ type: 'wallet_redeem', email: existing.email, amount, code });
    setUser((prev) => (prev ? { ...prev, walletBalance: nextBalance } : prev));
    return amount;
  };

  const localLogout = () => {
    window.localStorage.removeItem(LOCAL_SESSION_KEY);
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    setAuthChecked(true);
  };

  const logout = (shouldRedirect = true) => {
    if (authMode === 'supabase') {
      setUser(null)
      setIsAuthenticated(false)
      setAuthError(null)
      setAuthChecked(true)
      if (supabase) supabase.auth.signOut()
      return
    }
    if (authMode === 'local') {
      localLogout();
      return;
    }
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      db.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      db.auth.logout();
    }
  };

  const navigateToLogin = () => {
    if (authMode === 'local' || authMode === 'supabase') {
      window.location.hash = '#/login';
      return;
    }
    // Use the SDK's redirectToLogin method
    db.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      authMode,
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      localRegister,
      localLogin,
      localUpdateProfile,
      localChangePassword,
      localResetPassword,
      localRedeemWalletCode,
      refreshLocalUser,
      localLogout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
