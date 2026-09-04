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

````md
````ad-note
title: Outer

Some outer content.

```ad-warning
title: Inner
Inner content.
```

Back to outer.
````
````

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

## Development

```bash
npm install --include=dev
npm run build      # builds dist/ with tsup
npm test           # runs the vitest tests
npx tsc --noEmit   # typecheck
```

## License

MIT
