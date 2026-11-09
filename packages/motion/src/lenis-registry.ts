/** The part of a Lenis instance the registry needs (avoids depending on `lenis` here). */
export type LenisLike = {
  stop: () => void
  start: () => void
  /** Present on a real Lenis; the lightbox jumps the page behind it with it. */
  scrollTo?: (target: number, options?: { immediate?: boolean; force?: boolean }) => void
}

let active: LenisLike | null = null

/** Registers the page's Lenis (album pages). Replaces any earlier one. */
export const registerLenis = (lenis: LenisLike): void => {
  active = lenis
}

/** Unregisters `lenis` if it is still the active one (a later page may have replaced it). */
export const unregisterLenis = (lenis: LenisLike): void => {
  if (active === lenis) active = null
}

export const getActiveLenis = (): LenisLike | null => active

/** Lenis ignores `overflow: hidden`, so a scroll lock (menu, lightbox) must stop it too. */
export const stopActiveLenis = (): void => active?.stop()
export const startActiveLenis = (): void => active?.start()
