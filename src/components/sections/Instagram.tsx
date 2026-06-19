import Image from 'next/image';
import type { InstagramPost } from '@/lib/instagram';

interface Props {
  posts: InstagramPost[];
}

export default function Instagram({ posts }: Props) {

  if (posts.length === 0) return null;

  return (
    <section
      id="sns"
      className="relative min-h-screen flex flex-col items-center justify-center z-[2]
        gap-[44px] py-[90px] min-[700px]:py-[110px]"
      style={{ paddingInline: 'clamp(24px, 6.25vw, 80px)' }}
    >
      <div className="sns-header text-center">
        <h2
          className="font-serif font-light text-[clamp(16px,2.6vw,26px)]
            text-[rgba(232,224,208,0.6)] tracking-[0.22em] mb-2"
        >
          Instagram
        </h2>
        <a
          href="https://instagram.com/sikocoffee"
          target="_blank"
          rel="noopener noreferrer"
          className="font-serif italic text-[13.5px] text-[var(--amber)]
            tracking-[0.1em] no-underline transition-colors duration-300 hover:text-[#F6E0A0]"
        >
          @sikocoffee
        </a>
      </div>

      <div
        className="sns-grid grid gap-[3px] max-w-[620px] w-full
          grid-cols-4 max-[700px]:grid-cols-2 max-[700px]:max-w-[300px]"
      >
        {posts.slice(0, 8).map((post) => {
          const src = post.media_type === 'VIDEO'
            ? (post.thumbnail_url ?? post.media_url)
            : post.media_url;
          return (
            <a
              key={post.id}
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={post.caption ? `Instagram: ${post.caption.slice(0, 60)}` : 'Sikō Coffee Instagram投稿を見る'}
              className="group aspect-square relative overflow-hidden block"
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 700px) 150px, 155px"
                className="object-cover transition-[opacity,transform] duration-500
                  group-hover:opacity-70 group-hover:scale-105"
              />
              {post.media_type === 'VIDEO' && (
                <span
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  aria-hidden="true"
                >
                  <svg
                    width="22" height="22" viewBox="0 0 24 24"
                    style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
                  >
                    <polygon points="8,5 19,12 8,19" fill="rgba(232,224,208,0.92)" />
                  </svg>
                </span>
              )}
            </a>
          );
        })}
      </div>
    </section>
  );
}
