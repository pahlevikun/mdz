#!/usr/bin/env bun
/**
 * Assert DESIGN.md frontmatter, design/tokens.json, and design/tokens.tailwind.json
 * use the same hex for every named color token.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function normalizeHex(hex: string): string {
  const h = hex.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(h)) fail(`invalid hex: ${hex}`)
  return h
}

function parseFrontmatter(designMd: string): Record<string, string> {
  const match = designMd.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) fail("DESIGN.md: missing YAML frontmatter")
  const yaml = match[1]
  const colors: Record<string, string> = {}
  const inColors = yaml.match(/^colors:\r?\n((?:[ \t]+\S+.*\r?\n)+)/m)
  if (!inColors) fail("DESIGN.md: missing colors in frontmatter")
  for (const line of inColors[1].split(/\r?\n/)) {
    const m = line.match(/^[ \t]+([\w-]+):\s*"(#[0-9a-fA-F]{6})"/)
    if (m) colors[m[1]] = normalizeHex(m[2])
  }
  if (Object.keys(colors).length === 0) {
    fail("DESIGN.md: colors block parsed empty")
  }
  const required = [
    "version: alpha",
    "name: mdz",
    "description:",
    "typography:",
    "spacing:",
    "rounded:",
    "components:",
  ]
  for (const needle of required) {
    if (!yaml.includes(needle)) fail(`DESIGN.md frontmatter missing ${needle}`)
  }
  return colors
}

function parseLightFromProse(designMd: string): Record<string, string> {
  const colors: Record<string, string> = {}
  const section = designMd.match(
    /### Light \(derived, partial\)([\s\S]*?)(?=\n## |\n### |\z)/,
  )
  if (!section) fail("DESIGN.md: missing Light (derived, partial) subsection")
  const re = /\*\*([\w-]+)\s*\(`(#[0-9a-fA-F]{6})`\):/g
  let m: RegExpExecArray | null
  while ((m = re.exec(section[1])) !== null) {
    colors[m[1]] = normalizeHex(m[2])
  }
  if (Object.keys(colors).length === 0) {
    fail("DESIGN.md: light prose block parsed empty")
  }
  return colors
}

function dtcgDarkColors(tokens: unknown): Record<string, string> {
  const t = tokens as {
    color?: { dark?: Record<string, { $value?: string; $type?: string }> }
  }
  const dark = t.color?.dark
  if (!dark) fail("tokens.json: missing color.dark")
  const out: Record<string, string> = {}
  for (const [key, leaf] of Object.entries(dark)) {
    if (leaf.$type !== "color" || typeof leaf.$value !== "string") {
      fail(`tokens.json: color.dark.${key} must have $type color and string $value`)
    }
    out[key] = normalizeHex(leaf.$value)
  }
  return out
}

function dtcgLightColors(tokens: unknown): Record<string, string> {
  const t = tokens as {
    color?: { light?: Record<string, { $value?: string; $type?: string }> }
  }
  const light = t.color?.light
  if (!light) fail("tokens.json: missing color.light")
  const out: Record<string, string> = {}
  for (const [key, leaf] of Object.entries(light)) {
    if (leaf.$type !== "color" || typeof leaf.$value !== "string") {
      fail(`tokens.json: color.light.${key} must have $type color and string $value`)
    }
    out[`${key}-light`] = normalizeHex(leaf.$value)
  }
  return out
}

function tailwindColors(tw: unknown): { dark: Record<string, string>; light: Record<string, string> } {
  const t = tw as { colors?: Record<string, string> }
  if (!t.colors) fail("tokens.tailwind.json: missing colors")
  const dark: Record<string, string> = {}
  const light: Record<string, string> = {}
  for (const [key, value] of Object.entries(t.colors)) {
    if (typeof value !== "string") fail(`tokens.tailwind.json: colors.${key} must be a hex string`)
    const hex = normalizeHex(value)
    if (key.endsWith("-light")) light[key] = hex
    else dark[key] = hex
  }
  return { dark, light }
}

function compareMaps(
  label: string,
  a: Record<string, string>,
  b: Record<string, string>,
): void {
  const keysA = Object.keys(a).sort()
  const keysB = Object.keys(b).sort()
  if (keysA.join(",") !== keysB.join(",")) {
    fail(`${label}: token keys differ\n  A: ${keysA.join(", ")}\n  B: ${keysB.join(", ")}`)
  }
  for (const key of keysA) {
    if (a[key] !== b[key]) {
      fail(`${label}: ${key} is ${a[key]} vs ${b[key]}`)
    }
  }
}

const designMd = readFileSync(join(root, "DESIGN.md"), "utf8")
const tokensJson = JSON.parse(readFileSync(join(root, "design/tokens.json"), "utf8"))
const tailwindJson = JSON.parse(readFileSync(join(root, "design/tokens.tailwind.json"), "utf8"))

const fmDark = parseFrontmatter(designMd)
const proseLight = parseLightFromProse(designMd)
const jsonDark = dtcgDarkColors(tokensJson)
const jsonLight = dtcgLightColors(tokensJson)
const { dark: twDark, light: twLight } = tailwindColors(tailwindJson)

compareMaps("DESIGN.md frontmatter vs tokens.json dark", fmDark, jsonDark)
compareMaps("DESIGN.md frontmatter vs tokens.tailwind.json dark", fmDark, twDark)
compareMaps("DESIGN.md light prose vs tokens.json light", proseLight, jsonLight)
compareMaps("DESIGN.md light prose vs tokens.tailwind.json light", proseLight, twLight)

console.log("tokens agree")
