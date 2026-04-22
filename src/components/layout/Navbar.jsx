import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Store, Plus, User, PawPrint, Settings, Shield, HelpCircle, MessageCircle, Wallet, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import CartIcon from '@/components/cart/CartIcon';
import { useAuth } from '@/lib/AuthContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authMode, user, isAuthenticated, logout, navigateToLogin } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const prevUnreadRef = useRef(0);

  const playMessageTone = (variant) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      const master = ctx.createGain();
      master.gain.value = 0.033;
      master.connect(compressor);
      compressor.connect(ctx.destination);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1550, ctx.currentTime);
      filter.Q.setValueAtTime(0.7, ctx.currentTime);
      filter.connect(master);

      const t0 = ctx.currentTime;
      const notes = variant === 'admin' ? [392, 523] : [494, 659];

      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, t0 + i * 0.08);
        g.gain.setValueAtTime(0.0001, t0 + i * 0.08);
        g.gain.linearRampToValueAtTime(1, t0 + i * 0.08 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.08 + 0.19);
        o.connect(g);
        g.connect(filter);
        o.start(t0 + i * 0.08);
        o.stop(t0 + i * 0.08 + 0.22);
      });

      window.setTimeout(() => {
        try {
          ctx.close();
        } catch {}
      }, 600);
    } catch {}
  };

  useEffect(() => {
    if (!isAuthenticated || authMode !== 'local' || !user?.id) {
      setUnreadMessages(0);
      prevUnreadRef.current = 0;
      return;
    }

    const readJson = (key, fallback) => {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    };

    const tick = () => {
      const all = readJson('local_messages', []);
      const count = all.filter((m) => m?.toUserId === user.id && !m.readAt).length;
      setUnreadMessages(count);
      if (count > prevUnreadRef.current) {
        playMessageTone('user');
      }
      prevUnreadRef.current = count;
    };

    tick();
    const id = window.setInterval(tick, 1200);
    return () => window.clearInterval(id);
  }, [authMode, isAuthenticated, user?.id]);

  const links = [
    { path: '/marketplace', label: 'Marketplace', icon: Store },
    { path: '/how', label: 'So geht’s', icon: HelpCircle },
    { path: '/sell', label: 'Verkaufen', icon: Plus },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b-2 border-primary/20 bg-white/90 backdrop-blur-xl shadow-sm touch-manipulation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2 py-2 md:h-16 md:flex-nowrap md:py-0">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
              <PawPrint className="w-5 h-5 text-white" />
            </div>
            <span className="hidden sm:inline font-heading text-xl sm:text-2xl text-primary">
              PetVault
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {links.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              if (path === '/sell') {
                return (
                  <Button
                    key={path}
                    asChild
                    variant="default"
                    size="sm"
                    className="gap-2 rounded-xl font-body font-bold bg-primary text-white hover:bg-primary/90 px-4"
                  >
                    <Link to={path}>
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  </Button>
                );
              }
              return (
                <Button
                  key={path}
                  asChild
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  className={`gap-2 rounded-xl font-body font-700 ${isActive ? '' : 'text-foreground/70 hover:text-foreground hover:bg-secondary'}`}
                >
                  <Link to={path}>
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex md:hidden items-center gap-1">
              {links.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path;
                return (
                  <Button
                    key={path}
                    asChild
                    variant={isActive ? 'default' : 'ghost'}
                    size="icon"
                    className={`rounded-2xl h-12 w-12 ${isActive ? '' : 'text-muted-foreground'}`}
                  >
                    <Link to={path} aria-label={label}>
                      <Icon className="w-5 h-5" />
                    </Link>
                  </Button>
                );
              })}
            </div>
            <CartIcon />
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => navigate('/wallet/topup')}
                className="inline-flex items-center"
                aria-label="Guthaben"
              >
                <Badge variant="outline" className="rounded-xl font-bold border-primary/30 text-primary">
                  €{Number(user?.walletBalance || 0).toFixed(2)}
                </Badge>
              </button>
            ) : null}
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="flex items-center">
                      <button
                        type="button"
                        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary text-sm font-semibold text-foreground/80 hover:bg-secondary/80 transition-colors"
                      >
                        <span className="relative inline-flex">
                          <User className="w-4 h-4 text-primary" />
                          {unreadMessages > 0 ? (
                            <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
                              {unreadMessages > 9 ? '9+' : unreadMessages}
                            </span>
                          ) : null}
                        </span>
                        {user?.displayName || user?.full_name || user?.email?.split('@')[0]}
                      </button>
                      <button
                        type="button"
                        className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-secondary hover:bg-secondary/80 transition-colors"
                        aria-label="Account"
                      >
                        <span className="relative inline-flex">
                          <User className="w-4 h-4 text-primary" />
                          {unreadMessages > 0 ? (
                            <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
                              {unreadMessages > 9 ? '9+' : unreadMessages}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuLabel className="truncate">{user?.email || 'Account'}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => navigate('/wallet/topup')}>
                      <Wallet />
                      Guthaben aufladen
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate('/account?tab=messages')}>
                      <MessageCircle />
                      Nachrichten {unreadMessages > 0 ? `(${unreadMessages})` : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate('/account?tab=orders')}>
                      <ReceiptText />
                      Bestellungen
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate('/my-pets')}>
                      <PawPrint />
                      Meine Verkäufe
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate('/account?tab=profile')}>
                      <Settings />
                      Einstellungen
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate('/admin')}>
                      <Shield />
                      Admin
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate('/how')}>
                      <HelpCircle />
                      Hilfe / FAQ
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate('/', { replace: true });
                  }}
                  className="hidden md:block text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Abmelden
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to={`/register?redirect=${encodeURIComponent('/marketplace')}`}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-1"
                >
                  Registrieren
                </Link>
                <Button
                  size="sm"
                  className="gap-2 rounded-xl font-semibold"
                  onClick={() => {
                    if (authMode === 'local' || authMode === 'supabase') {
                      navigate('/login')
                      return
                    }
                    navigateToLogin()
                  }}
                >
                  <User className="w-4 h-4" />
                  Anmelden
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
