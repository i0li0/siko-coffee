'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SHOP_CATEGORIES, type CategoryKey } from '@/lib/shopCategories';

/* ── Sidebar toggle icon ── */
function SidebarIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="1" y="1" width="14" height="14" rx="2"
        stroke="currentColor" strokeWidth="1.2" />
      <line x1="5.5" y1="1.5" x2="5.5" y2="14.5"
        stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default function ShopSidebar() {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams.get('category') ?? 'all') as CategoryKey;

  function select(key: CategoryKey, available: boolean) {
    if (!available) return;
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'all') {
      params.delete('category');
    } else {
      params.set('category', key);
    }
    router.push(`/shop${params.size ? `?${params}` : ''}`);
  }

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside
        className={[
          'hidden min-[760px]:flex flex-col shrink-0',
          'border-r border-[rgba(184,190,200,0.07)]',
          'transition-all duration-300 ease-in-out overflow-hidden',
          open ? 'w-[176px] pr-[24px]' : 'w-[44px] pr-0',
        ].join(' ')}
      >
        {/* Toggle button */}
        <button
          onClick={() => setOpen(!open)}
          title={open ? 'サイドバーを閉じる' : 'サイドバーを開く'}
          className={[
            'flex items-center gap-[10px] mb-[20px]',
            'bg-transparent border-none cursor-pointer',
            'text-[rgba(184,190,200,0.45)] hover:text-[#B8BEC8]',
            'transition-colors duration-200',
            open ? 'self-end' : 'self-center',
          ].join(' ')}
        >
          <SidebarIcon />
        </button>

        {/* Category list */}
        <div
          className={[
            'flex flex-col gap-[4px]',
            'transition-all duration-300',
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
          ].join(' ')}
        >
          <span className="font-sans text-[10px] tracking-[0.2em]
            text-[rgba(184,190,200,0.45)] uppercase mb-[12px] pl-[12px]">
            Category
          </span>

          {SHOP_CATEGORIES.map(({ key, label, labelJp, available }) => {
            const isActive = key === current;

            return (
              <button
                key={key}
                onClick={() => select(key, available)}
                disabled={!available}
                className={[
                  'flex items-center justify-between gap-3',
                  'bg-transparent border-none text-left w-full',
                  'py-[10px] px-[12px] rounded-sm',
                  'transition-all duration-200',
                  available ? 'cursor-pointer' : 'cursor-default',
                  isActive
                    ? 'border-l-2 border-[#B8BEC8] bg-[rgba(184,190,200,0.05)]'
                    : 'border-l-2 border-transparent',
                  available && !isActive
                    ? 'hover:bg-[rgba(184,190,200,0.04)] hover:border-l-2 hover:border-[rgba(184,190,200,0.2)]'
                    : '',
                  !available ? 'opacity-40' : '',
                ].join(' ')}
              >
                <span className="flex flex-col gap-[3px]">
                  <span
                    className={[
                      'font-serif text-[15px] font-light tracking-[0.04em]',
                      isActive ? 'text-[#E8EAEE]' : 'text-[rgba(184,190,200,0.75)]',
                    ].join(' ')}
                  >
                    {label}
                  </span>
                  <span className="font-sans text-[10px] font-extralight tracking-[0.12em]
                    text-[rgba(184,190,200,0.45)]">
                    {labelJp}
                  </span>
                </span>

                {!available && (
                  <span className="font-sans text-[8px] tracking-[0.14em]
                    text-[rgba(184,190,200,0.45)] border border-[rgba(184,190,200,0.2)]
                    px-[6px] py-[2px] whitespace-nowrap">
                    準備中
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Mobile tabs ── */}
      <div className="min-[760px]:hidden flex gap-[8px] overflow-x-auto pb-[2px]
        scrollbar-none mb-[32px]">
        {SHOP_CATEGORIES.map(({ key, label, available }) => {
          const isActive = key === current;

          return (
            <button
              key={key}
              onClick={() => select(key, available)}
              disabled={!available}
              className={[
                'shrink-0 font-sans text-[11px] font-light tracking-[0.16em]',
                'px-[18px] py-[9px] border transition-all duration-200',
                available ? 'cursor-pointer' : 'cursor-default opacity-40',
                isActive
                  ? 'border-[rgba(184,190,200,0.55)] text-[#E8EAEE] bg-[rgba(184,190,200,0.05)]'
                  : 'border-[rgba(184,190,200,0.18)] text-[rgba(184,190,200,0.65)] hover:border-[rgba(184,190,200,0.35)] hover:text-[rgba(184,190,200,0.85)]',
              ].join(' ')}
            >
              {label}
              {!available && (
                <span className="ml-[7px] text-[8px] text-[rgba(184,190,200,0.4)]">
                  準備中
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
