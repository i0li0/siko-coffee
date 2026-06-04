'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SHOP_CATEGORIES, type CategoryKey } from '@/lib/shopCategories';

export default function ShopSidebar() {
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
      <aside className="hidden min-[760px]:flex flex-col gap-[6px] w-[148px] shrink-0 pt-[2px]">
        <span className="font-sans text-[9px] tracking-[0.18em] text-[rgba(184,190,200,0.3)]
          uppercase mb-[10px]">
          Category
        </span>

        {SHOP_CATEGORIES.map(({ key, label, labelJp, available }) => {
          const isActive = key === current || (key === 'all' && current === 'all');

          return (
            <button
              key={key}
              onClick={() => select(key, available)}
              disabled={!available}
              className={[
                'group flex items-baseline justify-between gap-2',
                'bg-transparent border-none text-left w-full',
                'py-[9px] px-[12px]',
                'transition-all duration-300',
                available ? 'cursor-pointer' : 'cursor-default opacity-50',
                isActive
                  ? 'border-l border-[rgba(184,190,200,0.35)] text-[#E8EAEE]'
                  : 'border-l border-transparent text-[rgba(184,190,200,0.38)] hover:text-[rgba(184,190,200,0.65)]',
              ].join(' ')}
            >
              <span className="flex flex-col gap-[1px]">
                <span className="font-serif text-[13.5px] font-light tracking-[0.04em]">
                  {label}
                </span>
                <span className="font-sans text-[9px] font-extralight tracking-[0.12em]
                  text-[rgba(184,190,200,0.35)]">
                  {labelJp}
                </span>
              </span>

              {!available && (
                <span className="font-sans text-[7.5px] tracking-[0.14em]
                  text-[rgba(184,190,200,0.28)] border border-[rgba(184,190,200,0.14)]
                  px-[5px] py-[2px] whitespace-nowrap">
                  準備中
                </span>
              )}
            </button>
          );
        })}
      </aside>

      {/* ── Mobile tabs ── */}
      <div className="min-[760px]:hidden flex gap-[6px] overflow-x-auto pb-[2px]
        scrollbar-none mb-[32px]">
        {SHOP_CATEGORIES.map(({ key, label, available }) => {
          const isActive = key === current || (key === 'all' && current === 'all');

          return (
            <button
              key={key}
              onClick={() => select(key, available)}
              disabled={!available}
              className={[
                'shrink-0 font-sans font-extralight text-[9.5px] tracking-[0.18em]',
                'px-[16px] py-[8px] border transition-all duration-300',
                available ? 'cursor-pointer' : 'cursor-default opacity-40',
                isActive
                  ? 'border-[rgba(184,190,200,0.38)] text-[#E8EAEE]'
                  : 'border-[rgba(184,190,200,0.14)] text-[rgba(184,190,200,0.38)]',
              ].join(' ')}
            >
              {label}
              {!available && (
                <span className="ml-[6px] text-[7px] text-[rgba(184,190,200,0.3)]">
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
