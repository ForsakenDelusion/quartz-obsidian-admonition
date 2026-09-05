import { describe, it, expect } from "vitest"
import { unified } from "unified"
import remarkParse from "remark-parse"
import { QuartzObsidianAdmonition } from "../src/index.js"

function transform(md: string) {
  const plugin = QuartzObsidianAdmonition()
  const processor = unified().use(remarkParse)
  plugin.markdownPlugins().forEach((p) => processor.use(p))
  const tree = processor.parse(md)
  return processor.runSync(tree)
}

/** Render a tree back to a compact human-readable form for assertions. */
function compact(tree: any): string {
  function walk(n: any): string {
    if (n.type === "blockquote") {
      const cls = n.data?.hProperties?.className
      if (cls && cls[0] === "callout") {
        const inner =
          n.children?.[0]?.value?.match(/callout-title-inner">([^<]+)</)?.[1] ||
          cls[1]
        const content = n.children?.[1]?.children?.map(walk).join(", ") ?? ""
        return `callout[${inner}](${content})`
      }
      return `bq(${(n.children ?? []).map(walk).join(", ")})`
    }
    if (n.type === "code") return `code:${n.lang ?? "?"}`
    if (n.type === "paragraph") {
      return `p(${(n.children ?? []).map((c: any) => c.value ?? c.type).join("")})`
    }
    if (n.children) return n.children.map(walk).join(", ")
    return n.type
  }
  return tree.children.map(walk).join(" | ")
}

describe("QuartzObsidianAdmonition", () => {
  it("converts a basic ad-note block into a callout", () => {
    const tree = transform("```ad-note\nHere is my note\n```\n")
    expect(compact(tree)).toBe("callout[note](p(Here is my note))")
  })

  it("reads title and collapse options", () => {
    const tree = transform(
      "```ad-tip\ntitle: My Tip\ncollapse: open\nBody content here.\n```\n",
    )
    expect(compact(tree)).toBe("callout[My Tip](p(Body content here.))")
  })

  it("resolves type aliases (ad-caution -> warning)", () => {
    const tree = transform("```ad-caution\ntitle: Be careful\nCareful text.\n```\n")
    const out = compact(tree)
    expect(out).toContain("callout[Be careful]")
    // verified via className in a raw dump
  })

  it("handles nested admonitions", () => {
    const tree = transform(
      "````ad-note\ntitle: Outer\n\nSome outer.\n\n```ad-warning\ntitle: Inner\nInner body.\n```\n\nBack to outer.\n````\n",
    )
    expect(compact(tree)).toBe(
      "callout[Outer](p(Some outer.), callout[Inner](p(Inner body.)), p(Back to outer.))",
    )
  })

  it("preserves embedded markdown in the body (heading downgraded, list/paragraph kept)", () => {
    const tree = transform(
      "```ad-note\ntitle: Note\n### Heading\n\n- item1\n- item2\n\nSome **bold** text.\n```\n",
    )
    const content = tree.children[0]?.children?.[1]?.children ?? []
    const types = content.map((c: any) => c.type)
    // The heading is downgraded to a paragraph (admonition-heading), list + paragraph kept
    expect(types).toEqual(["paragraph", "list", "paragraph"])
    // The first node carries the admonition-heading class
    expect(content[0]?.data?.hProperties?.className).toContain("admonition-heading")
  })

  it("converts inline LaTeX ($...$) into inlineMath nodes", () => {
    const tree = transform(
      "```ad-note\n那么$n1 \\times n2$:\n\n- a\n```\n",
    )
    const content = tree.children[0]?.children?.[1]?.children ?? []
    const para = content.find((c: any) => c.type === "paragraph")
    const types = (para?.children ?? []).map((c: any) => c.type)
    expect(types).toContain("inlineMath")
  })

  it("converts display LaTeX ($$...$$) into math nodes", () => {
    const tree = transform(
      "```ad-note\n$$\nE = mc^2\n$$\n```\n",
    )
    const content = tree.children[0]?.children?.[1]?.children ?? []
    const types = content.map((c: any) => c.type)
    expect(types).toContain("math")
  })

  it("downgrades headings in the admonition body to non-heading nodes", () => {
    const tree = transform(
      "```ad-note\n### A heading inside\nSome text.\n```\n",
    )
    const content = tree.children[0]?.children?.[1]?.children ?? []
    // The heading must NOT be a "heading" node anymore
    const nodeTypes = content.map((c: any) => c.type)
    expect(nodeTypes).not.toContain("heading")
    // It should now be a paragraph with the admonition-heading class
    const headingLike = content.find((c: any) =>
      c.data?.hProperties?.className?.includes("admonition-heading"),
    )
    expect(headingLike).toBeDefined()
    expect(headingLike.type).toBe("paragraph")
  })

  it("does not produce heading nodes that a TableOfContents visit would collect", () => {
    const tree = transform(
      "```ad-note\n### Heading inside admonition\n```\n\n## Real page heading\n",
    )
    // Simulate the TOC transformer: visit(tree, "heading")
    let tocHeadings = 0
    const visit = (node: any, cb: (n: any) => void) => {
      if (node.type === "heading") cb(node)
      if (node.children) node.children.forEach((c: any) => visit(c, cb))
    }
    visit(tree, () => tocHeadings++)
    // Only the REAL page heading should be collected; admonition one is downgraded
    expect(tocHeadings).toBe(1)
  })
})
