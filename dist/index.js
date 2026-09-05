// src/index.ts
import { visit } from "unist-util-visit";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
var ADO_PREFIX = "ad-";
var TYPE_ALIASES = {
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
  cite: "quote"
};
function canonicalizeType(raw) {
  const cleaned = raw.trim().toLowerCase().replace(/^ad-/, "");
  return TYPE_ALIASES[cleaned] ?? cleaned;
}
var DEFAULT_OPTIONS = {
  title: "",
  collapse: "none",
  icon: "",
  color: "",
  metadata: ""
};
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function parseOptions(value) {
  const options = { ...DEFAULT_OPTIONS };
  const lines = value.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  while (i < lines.length) {
    const m = /^(title|collapse|icon|color|metadata):[ \t]*(.*)$/.exec(lines[i]);
    if (!m) break;
    const key = m[1];
    const val = m[2].trim();
    if (key === "title") options.title = val;
    else if (key === "collapse") options.collapse = val || "none";
    else if (key === "icon") options.icon = val;
    else if (key === "color") options.color = val;
    else if (key === "metadata") options.metadata = val;
    i++;
  }
  return { options, body: lines.slice(i).join("\n") };
}
function findClosingFence(text, from, n) {
  const re = new RegExp("^[ \\t]*([`]{" + n + "})[ \\t]*$", "gm");
  re.lastIndex = from;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text[m.index - 1];
    const after = text[m.index + m[0].length];
    const isolated = (before === void 0 || before === "\n") && (after === void 0 || after === "\n");
    if (isolated && m[1].length === n) {
      return { start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}
function parseAdmonitionText(value, parse) {
  const nodes = [];
  let pos = 0;
  let buf = "";
  const fenceRe = /^[ \t]*([`]{3,})([^`\n]*)$/gm;
  fenceRe.lastIndex = 0;
  let m;
  while ((m = fenceRe.exec(value)) !== null) {
    const fence = m[1];
    const curSize = fence.length;
    const langInfo = m[2].trim();
    const openStart = m.index;
    const openEnd = m.index + m[0].length;
    if (openStart > pos) {
      buf += value.slice(pos, openStart);
    }
    const isAdmon = langInfo.startsWith(ADO_PREFIX);
    if (isAdmon) {
      const close = findClosingFence(value, openEnd, curSize);
      if (!close) {
        buf += value.slice(openStart);
        break;
      }
      const innerBody = value.slice(openEnd, close.start);
      const child = buildCallout(langInfo, innerBody, parse);
      flush(buf, parse, nodes);
      buf = "";
      nodes.push(child);
      pos = close.end;
      fenceRe.lastIndex = pos;
    } else {
      const close = findClosingFence(value, openEnd, curSize);
      if (close) {
        buf += value.slice(openStart, close.end);
        pos = close.end;
        fenceRe.lastIndex = pos;
      } else {
        buf += value.slice(openStart);
        break;
      }
    }
  }
  if (pos < value.length) {
    buf += value.slice(pos);
  }
  flush(buf, parse, nodes);
  return nodes;
}
function downgradeHeading(node) {
  const children = node.children ?? [];
  const level = Number(node.depth) || 3;
  return {
    type: "paragraph",
    data: {
      hProperties: {
        className: ["admonition-heading", "admonition-heading-" + level]
      },
      hName: "div"
    },
    children
  };
}
function downgradeHeadings(tree) {
  visit(tree, "heading", (node, index, parent) => {
    if (!parent || index === void 0) return;
    const replacement = downgradeHeading(node);
    parent.children.splice(index, 1, replacement);
  });
}
function flush(buf, parse, nodes) {
  if (!buf.trim()) return;
  const tree = parse(buf);
  downgradeHeadings(tree);
  nodes.push(...tree.children);
}
function buildCallout(langInfo, bodyValue, parse) {
  const type = canonicalizeType(langInfo);
  const { options, body } = parseOptions(bodyValue);
  const contentChildren = parseAdmonitionText(body, parse);
  const titleText = options.title || type;
  const titleHtml = `<div class="callout-title">
  <div class="callout-icon"></div>
  <div class="callout-title-inner">${escapeHtml(titleText)}</div>
</div>`;
  const classNames = ["callout", type];
  if (options.collapse === "open" || options.collapse === "closed") {
    classNames.push("is-collapsible");
  }
  if (options.collapse === "closed") {
    classNames.push("is-collapsed");
  }
  return {
    type: "blockquote",
    data: {
      hProperties: {
        className: classNames,
        "data-callout": type,
        "data-callout-fold": options.collapse,
        "data-callout-metadata": options.metadata
      },
      hName: "div"
    },
    children: [
      {
        type: "html",
        value: titleHtml
      },
      {
        type: "blockquote",
        data: {
          hProperties: { className: ["callout-content"] },
          hName: "div"
        },
        children: contentChildren
      }
    ]
  };
}
function admonitionPlugin() {
  return (tree) => {
    const parse = (src) => unified().use(remarkParse).use(remarkMath).parse(src);
    visit(tree, "code", (node, index, parent) => {
      if (!parent || index === void 0) return;
      if (!node.lang || !node.lang.startsWith(ADO_PREFIX)) return;
      const callout = buildCallout(node.lang, node.value, parse);
      parent.children.splice(index, 1, callout);
    });
  };
}
var ADMONITION_HEADING_CSS = `
.callout .admonition-heading {
  margin: 0.75em 0 0.35em 0;
  font-weight: 700;
  line-height: 1.25;
}
.callout .admonition-heading-1 { font-size: 1.6em; }
.callout .admonition-heading-2 { font-size: 1.35em; }
.callout .admonition-heading-3 { font-size: 1.15em; }
.callout .admonition-heading-4 { font-size: 1.05em; }
.callout .admonition-heading-5 { font-size: 1.0em; }
.callout .admonition-heading-6 { font-size: 0.95em; }
`;
function QuartzObsidianAdmonition(_opts) {
  return {
    name: "QuartzObsidianAdmonition",
    markdownPlugins() {
      return [admonitionPlugin];
    },
    externalResources() {
      return {
        css: [{ content: ADMONITION_HEADING_CSS }]
      };
    }
  };
}
var index_default = QuartzObsidianAdmonition;
export {
  QuartzObsidianAdmonition,
  index_default as default
};
//# sourceMappingURL=index.js.map