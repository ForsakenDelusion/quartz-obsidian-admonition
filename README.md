# @quartz-community/obsidian-admonition

A Quartz v5 transformer plugin that converts **Obsidian Admonition** syntax
(```` ```ad-<type> ```` code blocks) into **native Quartz callouts**, including
**nested** admonitions.

## Why

Quartz natively supports the Obsidian *callout* syntax (`> [!note]`), but not
the older **Admonition** plugin syntax (```` ```ad-note ```` fenced code
blocks). If your notes were written with the Obsidian Admonition plugin, you
can use this transformer so they render as proper callouts on your published
Quartz site — with full nested support.

This plugin emits the **exact same mdast structure** that
`@quartz-community/obsidian-flavored-markdown` produces for `> [!type]`
callouts, so Quartz's default callout renderer, icons and styles apply
automatically. No CSS changes required.

## Usage

Add the plugin to your `quartz.config.yaml`. Since it's sourced directly from a
GitHub repo by name (or installed via the managed plugin mechanism):

```yaml
plugins:
  - source: "@quartz-community/obsidian-admonition"
    enabled: true
    order: 25
```

Or, to pull it from the git repo directly (recommended for a fork that tracks
upstream):

```yaml
plugins:
  - source: "github:ForsakenDelusion/quartz-obsidian-admonition"
    enabled: true
    order: 25
```

Then install it (Quartz v5 uses a hybrid install):

```bash
npx quartz plugin install
# or, to fetch changes from the repo:
npx quartz plugin install --from-config
```

## Syntax

### Basic admonition

````md
```ad-note
Here is my note content.
```
````

### With options

The `title`, `collapse`, `icon`, `color` and `metadata` options must appear at
the top of the block, in any order.

````md
```ad-tip
title: My Tip
collapse: open
Body content here.
```
````

### Nested admonitions

Admonitions nest by using a **different number of backticks** at each level.
The outer fence uses more backticks than the inner one.

`````md
````ad-note
title: Outer

Some outer content.

```ad-warning
title: Inner
Inner content.
```

Back to outer.
````
`````

### Supported types & aliases

These map to the original Admonition plugin types:

| Type | Aliases |
|------|---------|
| note | seealso |
| abstract | summary, tldr |
| info | todo |
| tip | hint, important |
| success | check, done |
| question | help, faq |
| warning | caution, attention |
| failure | fail, missing |
| danger | error |
| bug | — |
| example | — |
| quote | cite |

## LaTeX / Math support

The plugin re-parses admonition bodies with **remark-math**, so inline math
(`$...$`) and display math (`$$...$$`) inside an admonition are converted into
`math` nodes and rendered by Quartz's LaTeX plugin (KaTeX/MathJax) — exactly
like math in regular note text.

### Requirements

1. **Enable the Quartz LaTeX plugin** in `quartz.config.yaml` (it ships with
   Quartz, `@quartz-community/latex`, `enabled: true`). The admonition plugin
   only converts `$...$` into `math` nodes; the LaTeX plugin does the actual
   rendering.
2. **`remark-math` must be resolvable from your Quartz project root.** Because
   plugins cloned via `github:` are installed into `.quartz/plugins/` and do
   **not** install their own dependencies automatically, the module lookup walks
   up to your project's `node_modules`. **Add `remark-math` as a root
   dependency** of your Quartz project:

   ```bash
   npm install remark-math@6.0.0
   ```

   This is required for both local builds and CI (`npm ci` reads package-lock.json).

### Syntax

Inline math and display math work exactly as in regular notes:

````md
```ad-note
The dimension is $n_1 \times n_2$.
```
````

````md
```ad-note
$$
E = mc^2
$$
```
````

### Notes / pitfalls

- **`$$...$$` must be a block on its own.** remark-math only recognizes
  display math when the `$$` delimiters sit on their own lines (with blank-line
  boundaries). A single-line `$$E = mc^2$$` is treated as plain text. Write it
  as:
  ```md
  $$
  E = mc^2
  $$
  ```
- **`$...$` requires the LaTeX engine to be configured** (`renderEngine: katex`
  or `mathjax` in the `@quartz-community/latex` plugin options). The default is
  `katex`.
- **Update the plugin to get math support.** If you installed an earlier
  version (before v0.1.1), `quartz.lock.json` still points to the old commit.
  Refresh it with:

  ```bash
  npx quartz plugin install --latest
  ```


## Development

```bash
npm install --include=dev
npm run build      # builds dist/ with tsup
npm test           # runs the vitest tests
npx tsc --noEmit   # typecheck
```

## License

MIT
