import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { LogIn, PawPrint } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

export default function LoginPrompt({ message = "Melde dich an, um fortzufahren!" }) {
  const { authMode } = useAuth();

  const handleLoginClick = () => {
    const redirectTarget = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;
    const redirectPath = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.pathname;
    if (authMode === 'local' || authMode === 'supabase') {
      window.location.hash = `#/login?redirect=${encodeURIComponent(redirectPath)}`;
      return;
    }
    db.auth.redirectToLogin(redirectTarget);
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="text-center max-w-sm"
      >
        <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-bounce-slow">
          <PawPrint className="w-12 h-12 text-primary" />
        </div>
        <h2 className="font-heading text-3xl text-foreground mb-2">Ups! 🐾</h2>
        <p className="text-muted-foreground text-base mb-8 leading-relaxed">{message}</p>
        <Button
          size="lg"
          className="gap-2 rounded-2xl font-bold text-base px-8 h-12 shadow-lg shadow-primary/25"
          onClick={handleLoginClick}
        >
          <LogIn className="w-5 h-5" />
          Jetzt anmelden
        </Button>
        <p className="text-xs text-muted-foreground mt-4">Kostenlos & schnell! 🚀</p>
      </motion.div>
    </div>
  );
}
