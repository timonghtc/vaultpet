import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, SlidersHorizontal } from 'lucide-react';

export default function PetFilters({ filters, categories = [], onFilterChange }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex items-center gap-2 flex-1">
        <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="🔍 Pet suchen..."
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            className="pl-10 rounded-2xl border-2 font-semibold"
          />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="sm:hidden h-11 w-11 rounded-2xl border-2 border-slate-200 bg-white flex items-center justify-center"
          aria-label="Filter öffnen"
        >
          <SlidersHorizontal className="w-5 h-5 text-slate-700" />
        </button>
      </div>

      {open ? (
        <div className="sm:hidden rounded-2xl border-2 border-slate-200 bg-white p-3 space-y-3">
          <Select value={filters.rarity} onValueChange={(v) => onFilterChange({ ...filters, rarity: v })}>
            <SelectTrigger className="w-full rounded-2xl border-2 font-semibold">
              <SelectValue placeholder="Seltenheit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle ✨</SelectItem>
              <SelectItem value="legendary">⭐ Legendary</SelectItem>
              <SelectItem value="ultra_rare">💜 Ultra Rare</SelectItem>
              <SelectItem value="rare">💙 Rare</SelectItem>
              <SelectItem value="uncommon">💚 Uncommon</SelectItem>
              <SelectItem value="common">🩶 Common</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.neon} onValueChange={(v) => onFilterChange({ ...filters, neon: v })}>
            <SelectTrigger className="w-full rounded-2xl border-2 font-semibold">
              <SelectValue placeholder="Neon" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="neon">✨ Neon</SelectItem>
              <SelectItem value="mega_neon">🌈 Mega Neon</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.sort} onValueChange={(v) => onFilterChange({ ...filters, sort: v })}>
            <SelectTrigger className="w-full rounded-2xl border-2 font-semibold">
              <SelectValue placeholder="Sortieren" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">🆕 Neueste</SelectItem>
              <SelectItem value="price_low">💸 Preis ↑</SelectItem>
              <SelectItem value="price_high">💰 Preis ↓</SelectItem>
            </SelectContent>
          </Select>

          {categories.length > 0 ? (
            <Select value={filters.category} onValueChange={(v) => onFilterChange({ ...filters, category: v })}>
              <SelectTrigger className="w-full rounded-2xl border-2 font-semibold">
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}

      <div className="hidden sm:flex flex-wrap gap-3">
        <Select value={filters.rarity} onValueChange={(v) => onFilterChange({ ...filters, rarity: v })}>
          <SelectTrigger className="w-full sm:w-[140px] rounded-2xl border-2 font-semibold">
            <SelectValue placeholder="Seltenheit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle ✨</SelectItem>
            <SelectItem value="legendary">⭐ Legendary</SelectItem>
            <SelectItem value="ultra_rare">💜 Ultra Rare</SelectItem>
            <SelectItem value="rare">💙 Rare</SelectItem>
            <SelectItem value="uncommon">💚 Uncommon</SelectItem>
            <SelectItem value="common">🩶 Common</SelectItem>
          </SelectContent>
        </Select>

        {categories.length > 0 ? (
          <Select value={filters.category} onValueChange={(v) => onFilterChange({ ...filters, category: v })}>
            <SelectTrigger className="w-full sm:w-[150px] rounded-2xl border-2 font-semibold">
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={filters.neon} onValueChange={(v) => onFilterChange({ ...filters, neon: v })}>
          <SelectTrigger className="w-full sm:w-[130px] rounded-2xl border-2 font-semibold">
            <SelectValue placeholder="Neon" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="neon">✨ Neon</SelectItem>
            <SelectItem value="mega_neon">🌈 Mega Neon</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.sort} onValueChange={(v) => onFilterChange({ ...filters, sort: v })}>
          <SelectTrigger className="w-full sm:w-[130px] rounded-2xl border-2 font-semibold">
            <SelectValue placeholder="Sortieren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">🆕 Neueste</SelectItem>
            <SelectItem value="price_low">💸 Preis ↑</SelectItem>
            <SelectItem value="price_high">💰 Preis ↓</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
