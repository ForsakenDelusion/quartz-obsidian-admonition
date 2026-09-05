import { visit } from "unist-util-visit"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkMath from "remark-math"
import type { Root, Content, Code, Parent, Node } from "mdast"
import type { BuildCtx } from "@quartz-community/types"

// ============================================================================
// Quartz Obsidian Admonition (v0.1.1)
//
// A Quartz v5 transformer plugin that converts Obsidian Admonition syntax
// (```ad-<type> code blocks) into native Quartz/Obsidian callout blocks. It
// mirrors the exact node structure emitted by
// @quartz-community/obsidian-flavored-markdown so that Quartz's default
// callout renderer, icons and styles apply automatically.
//
// Nested admonitions are supported by increasing the number of backticks,
// matching the original Obsidian Admonition plugin behaviour. The plugin
// re-parses the inner body with remark-parse (+ remark-math) so that embedded
// markdown (headings, lists, bold) AND LaTeX ($...$, $$...$$) render correctly
// inside the callout.
// ============================================================================

const ADO_PREFIX = "ad-"

/** Map of admonition types, including aliases from the original plugin. */
const TYPE_ALIASES: Record<string, string> = {
  note: "note",
  seealso: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "info",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
}

function canonicalizeType(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/^ad-/, "")
  return TYPE_ALIASES[cleaned] ?? cleaned
}

interface AdmonitionOptions {
  title: string
  collapse: "open" | "closed" | "none"
  icon: string
  color: string
  metadata: string
}

const DEFAULT_OPTIONS: AdmonitionOptions = {
  title: "",
  collapse: "none",
  icon: "",
  color: "",
  metadata: "",
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Parse the top-of-block key: value options (title/collapse/icon/color/meta).
 * Must appear at the top, in any order. Returns parsed options + remaining body.
 */
function parseOptions(value: string): {
  options: AdmonitionOptions
  body: string
} {
  const options = { ...DEFAULT_OPTIONS }
  const lines = value.split("\n")
  // Skip any leading blank lines so the key: value block is recognized even
  // when nested content starts with a newline.
  let i = 0
  while (i < lines.length && lines[i].trim() === "") i++
  while (i < lines.length) {
    const m = /^(title|collapse|icon|color|metadata):[ \t]*(.*)$/.exec(lines[i])
    if (!m) break
    const key = m[1]
    const val = m[2].trim()
    if (key === "title") options.title = val
    else if (key === "collapse") options.collapse = (val || "none") as AdmonitionOptions["collapse"]
    else if (key === "icon") options.icon = val
    else if (key === "color") options.color = val
    else if (key === "metadata") options.metadata = val
    i++
  }
  return { options, body: lines.slice(i).join("\n") }
}

/**
 * Find the closing fence: a line consisting of exactly `n` backticks, scanning
 * forward from index `from`.
 */
function findClosingFence(
  text: string,
  from: number,
  n: number,
): { start: number; end: number } | null {
  const re = new RegExp("^[ \\t]*([`]{" + n + "})[ \\t]*$", "gm")
  re.lastIndex = from
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const before = text[m.index - 1]
    const after = text[m.index + m[0].length]
    const isolated =
      (before === undefined || before === "\n") && (after === undefined || after === "\n")
    if (isolated && m[1].length === n) {
      return { start: m.index, end: m.index + m[0].length }
    }
  }
  return null
}

/**
 * Recursively parse an admonition body into real mdast nodes, correctly
 * handling the Admonition backtick-depth nesting rule.
 *
 * Admonitions nest by using a different number of backticks at each level
 * (e.g. outer 5 -> inner 4 -> inner-inner 3). We detect ANY `ad-*` fenced block
 * inside the body regardless of its backtick count, find its own closing fence,
 * and recurse. Non-admonition markdown segments are re-parsed with remark-parse
 * so that headings, lists and emphasis render correctly inside the callout.
 */
function parseAdmonitionText(
  value: string,
  parse: (src: string) => Root,
): Array<Content> {
  const nodes: Array<Content> = []
  let pos = 0
  let buf = ""

  // Match any fenced block (>= 3 backticks). `isAdmon` decides later whether it
  // is an admonition (converted) or a regular code block (kept).
  const fenceRe = /^[ \t]*([`]{3,})([^`\n]*)$/gm
  fenceRe.lastIndex = 0

  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(value)) !== null) {
    const fence = m[1]
    const curSize = fence.length
    const langInfo = m[2].trim()
    const openStart = m.index
    const openEnd = m.index + m[0].length

    // Leading text before this fence
    if (openStart > pos) {
      buf += value.slice(pos, openStart)
    }

    const isAdmon = langInfo.startsWith(ADO_PREFIX)

    if (isAdmon) {
      // This is a (possibly nested) admonition. Find its exact closing fence.
      const close = findClosingFence(value, openEnd, curSize)
      if (!close) {
        buf += value.slice(openStart)
        break
      }
      const innerBody = value.slice(openEnd, close.start)
      const child = buildCallout(langInfo, innerBody, parse)
      flush(buf, parse, nodes)
      buf = ""
      nodes.push(child)
      pos = close.end
      fenceRe.lastIndex = pos
    } else {
      // Non-admonition fenced block (e.g. a code sample inside the callout).
      // Capture until its closing fence as a code block.
      const close = findClosingFence(value, openEnd, curSize)
      if (close) {
        buf += value.slice(openStart, close.end)
        pos = close.end
        fenceRe.lastIndex = pos
      } else {
        buf += value.slice(openStart)
        break
      }
    }
  }

  if (pos < value.length) {
    buf += value.slice(pos)
  }
  flush(buf, parse, nodes)
  return nodes
}

/** Flush buffered plain-markdown text into parsed mdast nodes. */
function flush(buf: string, parse: (src: string) => Root, nodes: Array<Content>): void {
  if (!buf.trim()) return
  const tree = parse(buf)
  nodes.push(...tree.children)
}

/**
 * Build a callout blockquote node from an admonition lang + body text.
 * `parentFenceSize` is the number of backticks used to open this callout's
 * own fence (3 for a top-level ```ad-*, 4+ for nested). `parse` is the
 * remark-parse function used to re-parse embedded markdown.
 */
function buildCallout(
  langInfo: string,
  bodyValue: string,
  parse: (src: string) => Root,
): Content {
  const type = canonicalizeType(langInfo)
  const { options, body } = parseOptions(bodyValue)

  // Parse the body with the nesting-aware parser so nested admonitions render.
  const contentChildren = parseAdmonitionText(body, parse)

  const titleText = options.title || type
  const titleHtml =
    `<div class="callout-title">\n` +
    `  <div class="callout-icon"></div>\n` +
    `  <div class="callout-title-inner">${escapeHtml(titleText)}</div>\n` +
    `</div>`

  const classNames = ["callout", type]
  if (options.collapse === "open" || options.collapse === "closed") {
    classNames.push("is-collapsible")
  }
  if (options.collapse === "closed") {
    classNames.push("is-collapsed")
  }

  return {
    type: "blockquote",
    data: {
      hProperties: {
        className: classNames,
        "data-callout": type,
        "data-callout-fold": options.collapse,
        "data-callout-metadata": options.metadata,
      },
      hName: "div",
    },
    children: [
      {
        type: "html",
        value: titleHtml,
      },
      {
        type: "blockquote",
        data: {
          hProperties: { className: ["callout-content"] },
          hName: "div",
        },
        children: contentChildren,
      },
    ],
  } as unknown as Content
}

/**
 * The main remark transform. Walks the top-level mdast tree and converts any
 * ad-* code block into a callout, re-parsing its body for embedded markdown.
 * The body subtree is then recursively scanned for nested ad-* blocks.
 */
function admonitionPlugin() {
  return (tree: Root) => {
    // Re-parse embedded markdown WITH remark-math so that $...$ / $$...$$
    // inside an admonition body are converted to inlineMath/displayMath nodes
    // (which Quartz's Latex plugin then renders via KaTeX/MathJax).
    const parse = (src: string) =>
      unified().use(remarkParse).use(remarkMath).parse(src) as Root
    visit(tree, "code", (node: Code, index, parent) => {
      if (!parent || index === undefined) return
      if (!node.lang || !node.lang.startsWith(ADO_PREFIX)) return

      // Top-level admonitions.
      const callout = buildCallout(node.lang, node.value, parse)
      parent.children.splice(index, 1, callout)
    })
  }
}

/**
 * Configurable plugin entry point.
 */
export function QuartzObsidianAdmonition(
  _opts?: Record<string, unknown>,
): {
  name: string
  markdownPlugins: (ctx: BuildCtx) => Array<() => (tree: Root) => void>
} {
  return {
    name: "QuartzObsidianAdmonition",
    markdownPlugins() {
      return [admonitionPlugin]
    },
  }
}

export default QuartzObsidianAdmonition
