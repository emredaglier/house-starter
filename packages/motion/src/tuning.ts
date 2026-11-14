/**
 * The registry the `?debug` panel reads (apps/web `DebugPanel`). An animated piece registers its
 * tunable values (easing, timing, colour, spacing) and gets told when the owner changes one; the
 * panel shows an input per value and posts the current values on Save. No React here, so the
 * root entry stays safe on the server. Registering costs nothing when no panel is mounted.
 */

export type TuningKind = 'ease' | 'time' | 'color' | 'spacing'
export type TuningValue = string | number
/** One tunable value: `ease` is a GSAP ease, `time` is seconds, `color` and `spacing` are CSS values. */
export type TuningControl = { readonly kind: TuningKind; readonly value: TuningValue }
export type TuningValues = Record<string, TuningValue>
export type Tuning = {
  readonly name: string
  readonly controls: Readonly<Record<string, TuningControl>>
  /** What the piece should use now: the defaults, then the owner's edits. */
  readonly values: Readonly<TuningValues>
}
export type TuningPayload = { pieces: Record<string, TuningValues> }

type Entry = { tuning: Tuning; onChange?: (values: Readonly<TuningValues>) => void }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let snapshot: readonly Tuning[] = []

const emit = () => {
  snapshot = [...entries.values()].map((entry) => entry.tuning)
  for (const listener of listeners) listener()
}

/**
 * Registers a piece under `name` (a second registration of a name replaces the first, so a
 * remount is fine). `onChange` gets the full current values after each edit. Returns the
 * unregister function for the effect's cleanup.
 */
export const registerTuning = (
  name: string,
  controls: Readonly<Record<string, TuningControl>>,
  onChange?: Entry['onChange'],
): (() => void) => {
  const values = Object.fromEntries(Object.entries(controls).map(([key, c]) => [key, c.value]))
  const entry: Entry = { tuning: { name, controls, values }, onChange }
  entries.set(name, entry)
  emit()
  return () => {
    if (entries.get(name) !== entry) return
    entries.delete(name)
    emit()
  }
}

/** Sets one value of a registered piece; an unknown piece or key is ignored. */
export const setTuningValue = (name: string, key: string, value: TuningValue): void => {
  const entry = entries.get(name)
  if (!entry || !(key in entry.tuning.controls)) return
  entry.tuning = { ...entry.tuning, values: { ...entry.tuning.values, [key]: value } }
  emit()
  entry.onChange?.(entry.tuning.values)
}

/** Every registered piece. The same array until something changes (for `useSyncExternalStore`). */
export const getTunings = (): readonly Tuning[] => snapshot

export const subscribeTuning = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current values of every piece, by piece name: what Save posts. */
export const tuningPayload = (): TuningPayload => ({
  pieces: Object.fromEntries(snapshot.map(({ name, values }) => [name, { ...values }])),
})

/** Empties the registry (tests). */
export const resetTuning = (): void => {
  entries.clear()
  emit()
}
