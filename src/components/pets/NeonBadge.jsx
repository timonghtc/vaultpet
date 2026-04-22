import React from 'react';
import { Badge } from '@/components/ui/badge';

export default function NeonBadge({ neon }) {
  if (neon === 'normal') return null;

  if (neon === 'mega_neon') {
    return (
      <Badge className="bg-pink-100 text-pink-700 border border-pink-300 text-xs font-bold shadow-sm">
        🌈 Mega Neon
      </Badge>
    );
  }

  return (
    <Badge className="bg-cyan-100 text-cyan-700 border border-cyan-300 text-xs font-bold shadow-sm">
      ✨ Neon
    </Badge>
  );
}