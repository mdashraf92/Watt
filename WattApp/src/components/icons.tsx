import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline, G, Polygon } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// ── Tab Bar Icons ─────────────────────────────────────────────

export function MapPinIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx={12} cy={10} r={3} />
    </Svg>
  );
}

export function CalendarIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={4} width={18} height={18} rx={2} ry={2} />
      <Line x1={16} y1={2} x2={16} y2={6} />
      <Line x1={8} y1={2} x2={8} y2={6} />
      <Line x1={3} y1={10} x2={21} y2={10} />
    </Svg>
  );
}

export function WalletIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 12V8H6a2 2 0 0 1 0-4h14v4" />
      <Path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
      <Path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </Svg>
  );
}

export function UserIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

export function GridIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={7} height={7} />
      <Rect x={14} y={3} width={7} height={7} />
      <Rect x={14} y={14} width={7} height={7} />
      <Rect x={3} y={14} width={7} height={7} />
    </Svg>
  );
}

export function ZapIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Svg>
  );
}

export function TrendingUpIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <Polyline points="17 6 23 6 23 12" />
    </Svg>
  );
}

// ── Navigation & UI ───────────────────────────────────────────

export function ArrowLeftIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5" />
      <Path d="M12 19l-7-7 7-7" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 20, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

export function SearchIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}

export function XIcon({ size = 24, color = '#000', strokeWidth = 2.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}

export function EyeIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  );
}

export function EyeOffIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <Line x1={1} y1={1} x2={23} y2={23} />
    </Svg>
  );
}

export function LocateIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 2v3" />
      <Path d="M12 19v3" />
      <Path d="M2 12h3" />
      <Path d="M19 12h3" />
    </Svg>
  );
}

// ── Settings & Profile Icons ──────────────────────────────────

export function BellIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

export function ShieldIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

export function HelpCircleIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <Line x1={12} y1={17} x2={12.01} y2={17} />
    </Svg>
  );
}

export function InfoIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Line x1={12} y1={8} x2={12} y2={12} />
      <Line x1={12} y1={16} x2={12.01} y2={16} />
    </Svg>
  );
}

export function GlobeIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Line x1={2} y1={12} x2={22} y2={12} />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  );
}

export function LogOutIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1={21} y1={12} x2={9} y2={12} />
    </Svg>
  );
}

export function CarIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-2" />
      <Circle cx={7.5} cy={17.5} r={2.5} />
      <Circle cx={17.5} cy={17.5} r={2.5} />
    </Svg>
  );
}

export function PhoneIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.91 6.91l.62-.62a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </Svg>
  );
}

export function AwardIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={8} r={7} />
      <Polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </Svg>
  );
}

export function StarIcon({ size = 24, color = '#000', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Svg>
  );
}

export function HeartIcon({ size = 24, color = '#000', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

export function CheckIcon({ size = 24, color = '#000', strokeWidth = 2.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function HomeIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

export function ClockIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Polyline points="12 6 12 12 16 14" />
    </Svg>
  );
}

export function PlusIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

export function ClipboardIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <Rect x={8} y={2} width={8} height={4} rx={1} ry={1} />
    </Svg>
  );
}

export function UsersIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx={9} cy={7} r={4} />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

export function TrashIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

export function PlugIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 6L6 18" />
      <Path d="M7 17a5 5 0 0 1 5-5l3-3a5 5 0 0 1 7 7l-3 3a5 5 0 0 1-5 5" />
      <Path d="M17 7a5 5 0 0 0-5 5" />
    </Svg>
  );
}

// ── Transaction & Finance Icons ───────────────────────────────

export function ArrowUpIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 19V5" />
      <Path d="M5 12l7-7 7 7" />
    </Svg>
  );
}

export function ArrowDownIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 5v14" />
      <Path d="M19 12l-7 7-7-7" />
    </Svg>
  );
}

export function RotateCcwIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="1 4 1 10 7 10" />
      <Path d="M3.51 15a9 9 0 1 0 .49-3.51" />
    </Svg>
  );
}

export function SwapVerticalIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 3L4 7l4 4" /><Path d="M4 7h12" />
      <Path d="M16 21l4-4-4-4" /><Path d="M20 17H8" />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function LayersIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="12 2 2 7 12 12 22 7 12 2" />
      <Polyline points="2 17 12 22 22 17" />
      <Polyline points="2 12 12 17 22 12" />
    </Svg>
  );
}

export function MapIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <Path d="M8 2v16" />
      <Path d="M16 6v16" />
    </Svg>
  );
}

export function SlidersIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 21v-7" /><Path d="M4 10V3" />
      <Path d="M12 21v-9" /><Path d="M12 8V3" />
      <Path d="M20 21v-5" /><Path d="M20 12V3" />
      <Path d="M1 14h6" /><Path d="M9 8h6" /><Path d="M17 16h6" />
    </Svg>
  );
}

export function GiftIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 12 20 22 4 22 4 12" />
      <Rect x={2} y={7} width={20} height={5} />
      <Path d="M12 22V7" />
      <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </Svg>
  );
}

export function CreditCardIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={1} y={4} width={22} height={16} rx={2} ry={2} />
      <Line x1={1} y1={10} x2={23} y2={10} />
    </Svg>
  );
}

export function CoinsIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={8} cy={8} r={6} />
      <Path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <Path d="M7 6h1v4" />
      <Line x1={16.71} y1={13.88} x2={17} y2={14} />
    </Svg>
  );
}

// ── Time & Status Icons ───────────────────────────────────────

export function TimerIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={10} y1={2} x2={14} y2={2} />
      <Circle cx={12} cy={14} r={8} />
      <Polyline points="12 10 12 14 14 16" />
    </Svg>
  );
}

export function BatteryChargingIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19" />
      <Line x1={23} y1={13} x2={23} y2={11} />
      <Polyline points="11 6 7 12 13 12 9 18" />
    </Svg>
  );
}

export function LeafIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 8C8 10 5.9 16.17 3.82 19.97M7.14 14.94C7.14 14.94 8.44 10.24 15.47 8.06" />
      <Path d="M22 2l-5 5" />
      <Path d="M22 2s-5.58.96-10.9 6.28C5.83 13.57 5 22 5 22s4.27-.59 9.06-4.84C18.87 13.17 22 7.83 22 2z" />
    </Svg>
  );
}

export function NavigationIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="3 11 22 2 13 21 11 13 3 11" />
    </Svg>
  );
}

export function ShareIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

export function DollarSignIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={12} y1={1} x2={12} y2={23} />
      <Path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Svg>
  );
}

export function LockIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

export function SunIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={5} />
      <Line x1={12} y1={1} x2={12} y2={3} />
      <Line x1={12} y1={21} x2={12} y2={23} />
      <Line x1={4.22} y1={4.22} x2={5.64} y2={5.64} />
      <Line x1={18.36} y1={18.36} x2={19.78} y2={19.78} />
      <Line x1={1} y1={12} x2={3} y2={12} />
      <Line x1={21} y1={12} x2={23} y2={12} />
      <Line x1={4.22} y1={19.78} x2={5.64} y2={18.36} />
      <Line x1={18.36} y1={5.64} x2={19.78} y2={4.22} />
    </Svg>
  );
}

export function CameraIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

export function HistoryIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="1 4 1 10 7 10" />
      <Path d="M3.51 15a9 9 0 1 0 .49-3.51" />
      <Polyline points="12 7 12 12 15 15" />
    </Svg>
  );
}

export function MailIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <Path d="m22 6-10 7L2 6" />
    </Svg>
  );
}

export function PlugZapIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4z" />
      <Path d="m2 22 3-3" />
      <Path d="M7.5 13.5 10 11" />
      <Path d="M10.5 16.5 13 14" />
      <Path d="m18 3-4 4h6l-4 4" />
    </Svg>
  );
}

export function AlertTriangleIcon({ size = 24, color = '#000', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m10.29 3.86-8.18 14.19A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-2.95L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <Line x1={12} y1={9} x2={12} y2={13} />
      <Line x1={12} y1={17} x2={12.01} y2={17} />
    </Svg>
  );
}
