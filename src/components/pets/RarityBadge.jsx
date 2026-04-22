import React from 'react';
import { Badge } from '@/components/ui/badge';

const rarityConfig = {
  legendary: { label: '⭐ Legendary', className: 'bg-amber-100 text-amber-700 border-amber-300' },
  ultra_rare: { label: '💜 Ultra Rare', className: 'bg-purple-100 text-purple-700 border-purple-300' },
  rare: { label: '💙 Rare', className: 'bg-blue-100 text-blue-700 border-blue-300' },
  uncommon: { label: '💚 Uncommon', className: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  common: { label: '🩶 Common', className: 'bg-slate-100 text-slate-600 border-slate-300' },
};

export default function RarityBadge({ rarity }) {
  const config = rarityConfig[rarity] || rarityConfig.common;
  return (
    <Badge variant="outline" className={`${config.className} text-xs font-bold shadow-sm`}>
      {config.label}
    </Badge>
  );
}