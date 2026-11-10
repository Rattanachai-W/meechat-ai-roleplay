import { Link } from "@/i18n/navigation";
import { Heart, MessageCircle, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface CharacterCardProps {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  taglineEn?: string | null;
  primaryLanguage?: string;
  avatarUrl?: string | null;
  contentRating?: string;
  chatCount?: number;
  likeCount?: number;
  favoriteCount?: number;
  creatorUsername?: string | null;
  tags?: string[];
}

const GRADIENTS = [
  "from-fuchsia-500/70 to-violet-600/70",
  "from-sky-500/70 to-blue-600/70",
  "from-amber-500/70 to-orange-600/70",
  "from-emerald-500/70 to-teal-600/70",
  "from-rose-500/70 to-pink-600/70",
  "from-indigo-500/70 to-purple-600/70",
];

function gradientFor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export function CharacterCard({ character }: { character: CharacterCardProps }) {
  return (
    <Link
      href={`/character/${character.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-fuchsia-500/35 hover:shadow-md hover:shadow-fuchsia-500/8"
    >
      <div
        className={`relative aspect-[3/4] w-full bg-gradient-to-br ${gradientFor(character.slug)}`}
      >
        {character.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={character.avatarUrl}
            alt={character.name}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-5xl font-black tracking-tight text-white/90 drop-shadow-md sm:text-6xl">
            {character.name.slice(0, 1)}
          </span>
        )}
        {character.contentRating === "MATURE" && (
          <Badge variant="destructive" className="absolute top-2 left-2 text-[10px]">
            18+
          </Badge>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="line-clamp-1 text-[15px] font-semibold tracking-tight">{character.name}</p>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{character.tagline}</p>
        <div className="mt-auto flex items-center gap-3 pt-2 text-[11px] text-muted-foreground">
          {typeof character.chatCount === "number" && (
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3" aria-hidden />
              {compact(character.chatCount)}
            </span>
          )}
          {typeof character.likeCount === "number" && (
            <span className="flex items-center gap-1">
              <Heart className="size-3" aria-hidden />
              {compact(character.likeCount)}
            </span>
          )}
          {typeof character.favoriteCount === "number" && (
            <span className="flex items-center gap-1">
              <Star className="size-3" aria-hidden />
              {compact(character.favoriteCount)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
