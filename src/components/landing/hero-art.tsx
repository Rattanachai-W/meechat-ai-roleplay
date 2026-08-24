import type { ImgHTMLAttributes } from "react";

type CharacterCardProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src">;

function CharacterCard({
  src,
  className,
  ...props
}: CharacterCardProps & {
  src: string;
}) {
  return (
    <img
      alt=""
      aria-hidden
      className={className}
      draggable={false}
      loading="eager"
      src={src}
      {...props}
    />
  );
}

export function RomanceCard(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/romance-manhwa.png" {...props} />;
}

export function ActionCard(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/action-shonen.png" {...props} />;
}

export function FantasyCard(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/wuxia-manhua.png" {...props} />;
}

export function HeartCard(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/dark-mage.png" {...props} />;
}

export function StarCard(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/star-idol.png" {...props} />;
}

export function ThaiCard(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/thai-fantasy.png" {...props} />;
}

export function ThaiBackgroundCharacter(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/bg-thai-fantasy.png" {...props} />;
}

export function ActionBackgroundCharacter(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/bg-action-shonen.png" {...props} />;
}

export function WuxiaBackgroundCharacter(props: CharacterCardProps) {
  return <CharacterCard src="/landing/characters/bg-wuxia-manhua.png" {...props} />;
}
