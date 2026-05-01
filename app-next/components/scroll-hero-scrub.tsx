"use client"
import { HeroScrub } from "@/components/ui/hero-scrub"

const FRAME_COUNT = 150

export default function ScrollHeroScrub() {
  return (
    <HeroScrub
      frameCount={FRAME_COUNT}
      frameUrl={(i) => `/hero/frames/${String(i + 1).padStart(4, "0")}.webp`}
      titleTop="Off"
      titleBottom="Pitch"
      accentHex="#1F4E3D"
    />
  )
}
