import { Variants } from "framer-motion";

/**
 * ANIMATION SYSTEM [UI-015]: Centralized animation tokens for Osiris.
 * Focuses on fluidity, consistency, and a "Zero-Gravity" feel.
 */

export const transitions = {
  spring: {
    type: "spring",
    stiffness: 300,
    damping: 30,
  },
  smooth: {
    type: "tween",
    ease: [0.22, 1, 0.36, 1], // ease-standard from index.css
    duration: 0.6,
  },
  fast: {
    type: "tween",
    ease: [0.22, 1, 0.36, 1],
    duration: 0.3,
  },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitions.smooth },
  exit: { opacity: 0, transition: transitions.fast },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: transitions.smooth },
  exit: { opacity: 0, y: -20, transition: transitions.fast },
};

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0, transition: transitions.smooth },
  exit: { opacity: 0, y: 20, transition: transitions.fast },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: transitions.smooth },
  exit: { opacity: 0, scale: 0.95, transition: transitions.fast },
};

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const slideInRight: Variants = {
  initial: { x: "100%", opacity: 0 },
  animate: { x: 0, opacity: 1, transition: transitions.smooth },
  exit: { x: "100%", opacity: 0, transition: transitions.fast },
};

export const slideInLeft: Variants = {
  initial: { x: "-100%", opacity: 0 },
  animate: { x: 0, opacity: 1, transition: transitions.smooth },
  exit: { x: "-100%", opacity: 0, transition: transitions.fast },
};

export const hoverScale = {
  whileHover: { scale: 1.02, transition: { duration: 0.2 } },
  whileTap: { scale: 0.98 },
};

export const hoverGlow = {
  whileHover: { 
    boxShadow: "0 0 20px rgba(var(--primary-rgb), 0.3)",
    transition: { duration: 0.2 }
  },
};
