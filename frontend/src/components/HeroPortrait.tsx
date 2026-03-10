import type { Hero } from '@/api/heroes'

interface HeroPortraitProps {
  hero: string
  heroMap: Map<string, Hero>
  size?: string
}

export function HeroPortrait({ hero, heroMap, size = 'h-6 w-6' }: HeroPortraitProps) {
  const heroData = heroMap.get(hero)
  if (!heroData?.portrait_url) {
    return (
      <span
        className={`inline-flex ${size} items-center justify-center rounded-full bg-muted text-[8px] font-medium text-muted-foreground`}
        title={hero}
      >
        {hero.slice(0, 2)}
      </span>
    )
  }
  return (
    <img
      src={heroData.portrait_url}
      alt={hero}
      title={hero}
      className={`${size} rounded-full object-cover border border-border`}
    />
  )
}
