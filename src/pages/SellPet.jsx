import React, { useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Upload, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import LoginPrompt from '@/components/auth/LoginPrompt';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabaseClient'

const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

const SELL_REQUESTS_KEY = 'local_sell_requests';

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

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Upload fehlgeschlagen.'));
    reader.readAsDataURL(file);
  });

export default function SellPet() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { authMode, user, isAuthenticated, isLoadingAuth } = useAuth();
  const [submitOverlay, setSubmitOverlay] = useState(null);

  const [form, setForm] = useState({
    name: '',
    pet_type: '',
    neon: 'normal',
    age: 'full_grown',
    flyable: false,
    rideable: false,
    price: '',
    description: '',
    image_url: '',
  });
  const [uploading, setUploading] = useState(false);

  const update = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (authMode === 'supabase') {
        if (!supabase) throw new Error('Backend ist nicht aktiv.')
        const payload = {
          ...data,
          status: 'pending',
          seller_email: user?.email || null,
          seller_id: user?.id || null,
          seller_roblox: user?.robloxUsername || null,
          seller_name: user?.displayName || user?.full_name || user?.email?.split('@')[0] || 'Unknown',
          seller_user_id: user?.id || null
        }
        const { data: created, error } = await supabase.from('pets').insert(payload).select('*').single()
        if (error) throw new Error('Anfrage konnte nicht gespeichert werden.')
        return created
      }

      if (authMode !== 'local') {
        const payload = {
          ...data,
          status: 'pending',
          created_date: new Date().toISOString(),
          seller_email: user?.email || null,
          seller_id: user?.id || null,
          seller_roblox: user?.robloxUsername || null,
          seller_name: user?.displayName || user?.full_name || user?.email?.split('@')[0] || 'Unknown',
        };
        const created = await db.entities.Pet.create(payload);
        return created;
      }

      const existing = readJson(SELL_REQUESTS_KEY, []);
      const request = {
        id: crypto.randomUUID(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        seller_email: user?.email || null,
        seller_id: user?.id || null,
        seller_roblox: user?.robloxUsername || null,
        ...data,
      };
      writeJson(SELL_REQUESTS_KEY, [request, ...existing]);
      return request;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sell-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-pets'] });
      queryClient.invalidateQueries({ queryKey: ['my-pets'] });
      toast.success('✅ Anfrage gesendet! Ein Admin muss sie erst freigeben.');
      setSubmitOverlay({
        name: form.name,
        image_url: form.image_url || null
      });
      window.setTimeout(() => {
        setSubmitOverlay(null);
        navigate('/marketplace');
      }, 2600);
    },
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      if (authMode === 'supabase' || authMode === 'local') {
        const dataUrl = await readFileAsDataUrl(file);
        update('image_url', dataUrl);
      } else {
        const { file_url } = await db.integrations.Core.UploadFile({ file });
        if (file_url) {
          update('image_url', file_url);
        } else {
          const dataUrl = await readFileAsDataUrl(file);
          update('image_url', dataUrl);
        }
      }
    } catch {
      const dataUrl = await readFileAsDataUrl(file);
      update('image_url', dataUrl);
    }
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      ...form,
      price: parseFloat(form.price),
      seller_name: user?.displayName || user?.full_name || user?.email?.split('@')[0] || 'Unknown',
    });
  };

  if (!isLoadingAuth && !isAuthenticated) {
    return (
      <LoginPrompt message="Du musst angemeldet sein, um ein Pet zu verkaufen! Melde dich an — es ist ganz einfach 🐾" />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {submitOverlay ? (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                🐰
              </div>
              <div>
                <div className="font-heading text-xl text-slate-900">Antrag abgeschickt!</div>
                <div className="text-sm text-slate-600 font-semibold">Ich bringe dein Pet jetzt zum Admin.</div>
              </div>
            </div>

            <div className="mt-4 border-2 border-slate-100 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0">
                {submitOverlay.image_url ? (
                  <img src={submitOverlay.image_url} alt={submitOverlay.name || 'Pet'} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{submitOverlay.name || 'Dein Pet'}</div>
                <div className="text-xs text-slate-600 font-semibold mt-1">Status: Wartet auf Genehmigung…</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  initial={{ width: '10%' }}
                  animate={{ width: '80%' }}
                  transition={{ duration: 2.2, ease: 'easeOut' }}
                  className="h-full bg-primary"
                />
              </div>
              <div className="text-xs text-slate-600 font-semibold mt-2">
                Normalerweise dauert die Genehmigung nur ein paar Minuten. Du siehst den Status unter „Meine Verkäufe“.
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="font-heading text-4xl text-foreground">🐾 Pet verkaufen</h1>
          <p className="text-muted-foreground font-semibold mt-1">Stelle dein Adopt Me Pet zum Verkauf ein!</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Image Upload */}
          <Card className="border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/50 transition-colors rounded-3xl overflow-hidden">
            <label className="flex flex-col items-center justify-center p-8 cursor-pointer">
              {form.image_url ? (
                <img src={form.image_url} alt="Preview" className="w-32 h-32 object-cover rounded-2xl shadow-md" />
              ) : uploading ? (
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              ) : (
                <>
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-3">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <p className="font-bold text-foreground">Bild hochladen</p>
                  <p className="text-sm text-muted-foreground mt-1">Klick hier, um ein Bild auszuwählen</p>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </Card>

          <div className="space-y-2">
            <Label className="font-bold">Pet Name *</Label>
            <Input
              placeholder="z.B. Shadow Dragon"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
              className="rounded-xl border-2 font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="font-bold">Seltenheit *</Label>
              <Select value={form.pet_type} onValueChange={(v) => update('pet_type', v)} required>
                <SelectTrigger className="rounded-xl border-2 font-semibold">
                  <SelectValue placeholder="Wählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="legendary">⭐ Legendary</SelectItem>
                  <SelectItem value="ultra_rare">💜 Ultra Rare</SelectItem>
                  <SelectItem value="rare">💙 Rare</SelectItem>
                  <SelectItem value="uncommon">💚 Uncommon</SelectItem>
                  <SelectItem value="common">🩶 Common</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-bold">Neon-Status</Label>
              <Select value={form.neon} onValueChange={(v) => update('neon', v)}>
                <SelectTrigger className="rounded-xl border-2 font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="neon">✨ Neon</SelectItem>
                  <SelectItem value="mega_neon">🌈 Mega Neon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-bold">Alter</Label>
              <Select value={form.age} onValueChange={(v) => update('age', v)}>
                <SelectTrigger className="rounded-xl border-2 font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newborn">Newborn</SelectItem>
                  <SelectItem value="junior">Junior</SelectItem>
                  <SelectItem value="pre_teen">Pre-Teen</SelectItem>
                  <SelectItem value="teen">Teen</SelectItem>
                  <SelectItem value="post_teen">Post-Teen</SelectItem>
                  <SelectItem value="full_grown">Full Grown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-8 p-4 bg-secondary rounded-2xl">
            <div className="flex items-center gap-3">
              <Switch checked={form.flyable} onCheckedChange={(v) => update('flyable', v)} />
              <Label className="font-bold text-base">✈️ Fly</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.rideable} onCheckedChange={(v) => update('rideable', v)} />
              <Label className="font-bold text-base">🚲 Ride</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-bold">Preis (EUR) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              required
              className="rounded-xl border-2 font-heading text-2xl h-14"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-bold">Beschreibung</Label>
            <Textarea
              placeholder="Weitere Details zu deinem Pet..."
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className="rounded-xl border-2 font-semibold h-24"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full gap-2 font-bold text-base rounded-2xl h-14 shadow-lg shadow-primary/25"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                📩 Anfrage senden <ArrowRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </form>
      </motion.div>

      {submitOverlay ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md bg-white border-2 border-primary/20 rounded-3xl p-6 shadow-xl"
          >
            <div className="flex items-start gap-4">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                className="text-4xl leading-none"
              >
                🐰
              </motion.div>
              <div className="flex-1">
                <div className="font-heading text-2xl text-foreground">Antrag abgeschickt! 📨</div>
                <div className="text-sm text-muted-foreground font-semibold mt-1">
                  Ich bringe dein Pet jetzt zum Admin. Normalerweise dauert die Genehmigung nicht länger als 5 Minuten ⏳
                </div>
              </div>
            </div>

            {submitOverlay.image_url ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border-2 border-border bg-secondary p-3">
                <img src={submitOverlay.image_url} alt="" className="w-12 h-12 rounded-2xl object-cover border-2 border-border" />
                <div className="min-w-0">
                  <div className="font-bold text-foreground truncate">{submitOverlay.name || 'Dein Pet'}</div>
                  <div className="text-xs text-muted-foreground font-semibold">Status: Wartet auf Genehmigung…</div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border-2 border-border bg-secondary p-3">
                <div className="font-bold text-foreground truncate">{submitOverlay.name || 'Dein Pet'}</div>
                <div className="text-xs text-muted-foreground font-semibold">Status: Wartet auf Genehmigung…</div>
              </div>
            )}

            <div className="mt-5">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2.4, ease: 'easeInOut' }}
                  className="h-full bg-primary"
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground font-semibold">
                Du kannst den Status jederzeit unter „Meine Verkäufe“ sehen.
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}
