'use client';

import { useState, useEffect } from 'react';

interface Post {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
}

export default function Instagram() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    fetch('/api/instagram')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setPosts(data); })
      .catch(() => {});
  }, []);

  if (posts.length === 0) return null;

  return (
    <section
      id="sns"
      className="relative min-h-screen flex flex-col items-center justify-center z-[2]
        gap-[44px] py-[110px] px-10 max-[700px]:py-[90px] max-[700px]:px-[22px]"
    >
      <div className="sns-header text-center">
        <h2
          className="font-serif font-light text-[clamp(16px,2.6vw,26px)]
            text-[rgba(240,235,224,0.45)] tracking-[0.22em] mb-2"
        >
          Instagram
        </h2>
        <a
          href="https://instagram.com/siko_coffee"
          target="_blank"
          rel="noopener noreferrer"
          className="font-serif italic text-[13.5px] text-[#c8a96e]
            tracking-[0.1em] no-underline"
        >
          @siko_coffee
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
              className="group aspect-square relative overflow-hidden block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover
                  transition-[opacity,transform] duration-500
                  group-hover:opacity-70 group-hover:scale-105"
              />
              {post.media_type === 'VIDEO' && (
                <span
                  className="absolute inset-0 flex items-center justify-center
                    text-[rgba(240,235,224,0.5)] text-[22px] pointer-events-none"
                >
                  ▶
                </span>
              )}
            </a>
          );
        })}
      </div>
    </section>
  );
}
