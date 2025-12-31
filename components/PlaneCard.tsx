import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PlaneCardProps {
  title: string;
  icon: LucideIcon;
  color: string;
  children: React.ReactNode;
  isActive?: boolean;
}

export const PlaneCard: React.FC<PlaneCardProps> = ({ title, icon: Icon, color, children, isActive = true }) => {
  return (
    <div className={`
      relative p-4 rounded-xl border backdrop-blur-sm transition-all duration-300
      ${isActive ? `border-${color}-500/50 bg-slate-900/60` : 'border-slate-800 bg-slate-900/20 opacity-70'}
    `}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-400`}>
          <Icon size={18} />
        </div>
        <h3 className="font-mono text-sm uppercase tracking-wider text-slate-300 font-bold">{title}</h3>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
};
