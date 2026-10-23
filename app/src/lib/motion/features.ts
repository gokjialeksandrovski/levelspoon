// Its own module so the dynamic import in providers.tsx splits the animation
// features into a chunk that loads after first paint. domMax, not
// domAnimation: the day view drags and the meal's ingredient rows animate
// layout, and both need it.
export { domMax } from "motion/react";
