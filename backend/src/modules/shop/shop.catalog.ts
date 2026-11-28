export type ShopKind = 'FRAME' | 'BUBBLE' | 'MIC';
/** colors drive how the app draws the item (gradient ring, bubble fill, mic glow). All art is drawn in-app. */
export interface ShopItem { id: string; kind: ShopKind; name: string; nameAr: string; price: number; colors: string[]; style: string }

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'frame_royal', kind: 'FRAME', name: 'Royal Ring', nameAr: 'الحلقة الملكية', price: 800, colors: ['#FFD36B', '#FF9F43'], style: 'ring' },
  { id: 'frame_star', kind: 'FRAME', name: 'Star Ring', nameAr: 'حلقة النجوم', price: 600, colors: ['#FFE08A', '#7B5CFF'], style: 'dots' },
  { id: 'frame_galaxy', kind: 'FRAME', name: 'Galaxy Ring', nameAr: 'حلقة المجرة', price: 1000, colors: ['#7B5CFF', '#22D3EE', '#FF5CA8'], style: 'sweep' },
  { id: 'frame_neon', kind: 'FRAME', name: 'Neon Ring', nameAr: 'حلقة النيون', price: 900, colors: ['#22D3B6', '#2E9BFF'], style: 'glow' },
  { id: 'frame_rose', kind: 'FRAME', name: 'Rose Ring', nameAr: 'حلقة الورد', price: 700, colors: ['#FF5CA8', '#FFB3D1'], style: 'ring' },
  { id: 'frame_emerald', kind: 'FRAME', name: 'Emerald Ring', nameAr: 'حلقة الزمرد', price: 700, colors: ['#1FCB7E', '#B8F5D5'], style: 'dots' },
  { id: 'frame_fire', kind: 'FRAME', name: 'Fire Ring', nameAr: 'حلقة النار', price: 1200, colors: ['#FF4D6D', '#FFB02E', '#FFE08A'], style: 'sweep' },
  { id: 'frame_ice', kind: 'FRAME', name: 'Ice Ring', nameAr: 'حلقة الجليد', price: 1200, colors: ['#BDEBFF', '#2E9BFF'], style: 'glow' },
  { id: 'bubble_violet', kind: 'BUBBLE', name: 'Violet Bubble', nameAr: 'فقاعة بنفسجية', price: 300, colors: ['#7B5CFF', '#4B2FD0'], style: 'solid' },
  { id: 'bubble_sunset', kind: 'BUBBLE', name: 'Sunset Bubble', nameAr: 'فقاعة الغروب', price: 400, colors: ['#FF7A3D', '#FF4D6D'], style: 'gradient' },
  { id: 'bubble_ocean', kind: 'BUBBLE', name: 'Ocean Bubble', nameAr: 'فقاعة المحيط', price: 400, colors: ['#2E9BFF', '#22D3B6'], style: 'gradient' },
  { id: 'bubble_rose', kind: 'BUBBLE', name: 'Rose Bubble', nameAr: 'فقاعة وردية', price: 400, colors: ['#FF5CA8', '#B794FF'], style: 'gradient' },
  { id: 'bubble_gold', kind: 'BUBBLE', name: 'Gold Bubble', nameAr: 'فقاعة ذهبية', price: 600, colors: ['#FFD36B', '#F5B83D'], style: 'gradient' },
  { id: 'bubble_night', kind: 'BUBBLE', name: 'Night Bubble', nameAr: 'فقاعة الليل', price: 500, colors: ['#1E1E2B', '#7B5CFF'], style: 'outline' },
  { id: 'mic_pulse', kind: 'MIC', name: 'Violet Pulse', nameAr: 'نبض بنفسجي', price: 500, colors: ['#7B5CFF'], style: 'pulse' },
  { id: 'mic_wave', kind: 'MIC', name: 'Aqua Wave', nameAr: 'موجة مائية', price: 500, colors: ['#22D3B6'], style: 'wave' },
  { id: 'mic_flame', kind: 'MIC', name: 'Flame Glow', nameAr: 'وهج اللهب', price: 800, colors: ['#FF7A3D'], style: 'pulse' },
  { id: 'mic_gold', kind: 'MIC', name: 'Gold Aura', nameAr: 'هالة ذهبية', price: 900, colors: ['#FFD36B'], style: 'wave' },
  { id: 'mic_rose', kind: 'MIC', name: 'Rose Aura', nameAr: 'هالة وردية', price: 600, colors: ['#FF5CA8'], style: 'pulse' },
];
