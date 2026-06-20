export interface PresetAvatar {
  id: string
  label: string
  svg: string
}

const circle = (bg: string, inner: string) =>
  `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="40" fill="${bg}"/>${inner}</svg>`

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'bean',
    label: 'コーヒー豆',
    svg: circle('#3E2C23',
      `<ellipse cx="40" cy="40" rx="12" ry="18" fill="#8B6914" transform="rotate(-15 40 40)"/>
       <line x1="40" y1="24" x2="40" y2="56" stroke="#3E2C23" stroke-width="2" transform="rotate(-15 40 40)"/>`),
  },
  {
    id: 'cup',
    label: 'コーヒーカップ',
    svg: circle('#2A3A4A',
      `<rect x="26" y="30" width="28" height="22" rx="3" fill="#C8A45A"/>
       <path d="M54 35 Q62 35 62 43 Q62 50 54 50" fill="none" stroke="#C8A45A" stroke-width="2.5"/>
       <rect x="24" y="52" width="32" height="3" rx="1.5" fill="#C8A45A"/>`),
  },
  {
    id: 'dripper',
    label: 'ドリッパー',
    svg: circle('#1E2D2A',
      `<polygon points="28,28 52,28 48,52 32,52" fill="none" stroke="#A8BFA0" stroke-width="2.5"/>
       <line x1="40" y1="52" x2="40" y2="60" stroke="#A8BFA0" stroke-width="2"/>
       <ellipse cx="40" cy="26" rx="14" ry="3" fill="none" stroke="#A8BFA0" stroke-width="2"/>`),
  },
  {
    id: 'kettle',
    label: 'ケトル',
    svg: circle('#2C2833',
      `<ellipse cx="40" cy="44" rx="14" ry="12" fill="#B8A0C8"/>
       <path d="M26 40 Q20 34 26 30" fill="none" stroke="#B8A0C8" stroke-width="2.5" stroke-linecap="round"/>
       <rect x="36" y="30" width="8" height="4" rx="2" fill="#B8A0C8"/>`),
  },
  {
    id: 'leaf',
    label: 'リーフ',
    svg: circle('#1A2E1A',
      `<path d="M40 24 Q56 36 40 56 Q24 36 40 24Z" fill="#6B8E4E"/>
       <line x1="40" y1="30" x2="40" y2="54" stroke="#1A2E1A" stroke-width="1.5"/>`),
  },
  {
    id: 'steam',
    label: 'スチーム',
    svg: circle('#33261E',
      `<path d="M32 50 Q32 42 36 38 Q40 34 36 28" fill="none" stroke="#D4A96A" stroke-width="2" stroke-linecap="round"/>
       <path d="M40 52 Q40 44 44 40 Q48 36 44 28" fill="none" stroke="#D4A96A" stroke-width="2" stroke-linecap="round"/>
       <path d="M48 50 Q48 44 52 40 Q54 37 52 32" fill="none" stroke="#D4A96A" stroke-width="2" stroke-linecap="round"/>`),
  },
  {
    id: 'grinder',
    label: 'グラインダー',
    svg: circle('#2A2A32',
      `<rect x="32" y="34" width="16" height="20" rx="2" fill="#A0A8B8"/>
       <rect x="30" y="30" width="20" height="6" rx="2" fill="#B8BEC8"/>
       <line x1="40" y1="24" x2="40" y2="30" stroke="#B8BEC8" stroke-width="2.5" stroke-linecap="round"/>
       <circle cx="40" cy="23" r="3" fill="#B8BEC8"/>`),
  },
  {
    id: 'latte',
    label: 'ラテアート',
    svg: circle('#F5F0E8',
      `<circle cx="40" cy="40" r="16" fill="#D4A96A"/>
       <path d="M40 28 Q46 38 40 42 Q34 38 40 28Z" fill="#F5F0E8"/>
       <path d="M34 42 Q40 48 46 42" fill="none" stroke="#F5F0E8" stroke-width="1.5"/>`),
  },
]

export function randomPresetId(): string {
  return PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)].id
}

export function getPresetSvg(id: string): string | undefined {
  return PRESET_AVATARS.find(a => a.id === id)?.svg
}
