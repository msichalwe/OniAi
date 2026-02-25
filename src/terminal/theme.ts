import chalk, { Chalk } from "chalk";
import { ONI_PALETTE } from "./palette.js";

const hasForceColor =
  typeof process.env.FORCE_COLOR === "string" &&
  process.env.FORCE_COLOR.trim().length > 0 &&
  process.env.FORCE_COLOR.trim() !== "0";

const baseChalk = process.env.NO_COLOR && !hasForceColor ? new Chalk({ level: 0 }) : chalk;

const hex = (value: string) => baseChalk.hex(value);

export const theme = {
  accent: hex(ONI_PALETTE.accent),
  accentBright: hex(ONI_PALETTE.accentBright),
  accentDim: hex(ONI_PALETTE.accentDim),
  info: hex(ONI_PALETTE.info),
  success: hex(ONI_PALETTE.success),
  warn: hex(ONI_PALETTE.warn),
  error: hex(ONI_PALETTE.error),
  muted: hex(ONI_PALETTE.muted),
  heading: baseChalk.bold.hex(ONI_PALETTE.accent),
  command: hex(ONI_PALETTE.accentBright),
  option: hex(ONI_PALETTE.warn),
} as const;

export const isRich = () => Boolean(baseChalk.level > 0);

export const colorize = (rich: boolean, color: (value: string) => string, value: string) =>
  rich ? color(value) : value;
