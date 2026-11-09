# @house/motion

A minimal shell: capability checks (`prefersReducedMotion`, `hasFinePointer`, `hasWebGL2`,
`supportsViewTransitions`) and the shared motion-fault event (`reportMotionFault`).

The full plumbing (safe ticker, idle watcher, typed `<html>` flags, Lenis registry, ease and
colour bridges, hooks, the engine contract) is added by a later ticket. The effects library
starts empty; a project adds its own effects here.
