import { createContext, useContext, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { Link } from "react-router-dom";
import type { Root, Element, ElementContent } from "hast";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypePrism from "rehype-prism-plus";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useI18n } from "../../i18n";
import type { PostImages } from "../../types/media";
import { slugify } from "../../utils/format";
import { parseHexdump } from "../../utils/hexdump";
import HexViewer from "./HexViewer";

interface MarkdownProps {
  content: string;
  // Size data for uploaded images (from the post API or the media library).
  // Images without an entry render as a plain lazy-loaded <img>.
  images?: PostImages;
  // Content from an agent, under review: no request leaves the site (only
  // this site's uploads load; other images show their address instead) and
  // links don't navigate: each shows its real target.
  untrusted?: boolean;
  // Review of an agent's proposal: its unpublished images (file name ->
  // the admin-only address they are served from until accepted)
  pendingImages?: Record<string, string>;
}

// The article column is at most 720px wide; below 900px the image fills the screen.
const IMAGE_SIZES = "(max-width: 900px) 100vw, 720px";

// File name of an uploaded image, for /api/uploads/<name> or an absolute URL
// on any host (old posts may contain either).
function uploadFilename(src: string | undefined): string | null {
  if (!src) return null;
  const m = /\/api\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(src.split(/[?#]/)[0]);
  return m ? m[1] : null;
}

// True while rendering inside a markdown link, so images there don't get a
// second (nested, invalid) link to the full-size file.
const InsideLink = createContext(false);
const Images = createContext<PostImages | undefined>(undefined);
const Pending = createContext<Record<string, string> | undefined>(undefined);

function Anchor(props: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
  const { node: _node, href, ...rest } = props;
  // Links to pages of this site navigate inside the app; others open normally
  const internal = !!href && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/") && !href.startsWith("/.well-known/");
  return (
    <InsideLink.Provider value={true}>
      {internal ? <Link to={href} {...rest} /> : <a href={href} {...rest} />}
    </InsideLink.Provider>
  );
}

// Stable component (defined once): a component created per render would make
// React remount every image on each keystroke in the editor preview.
function Image(props: ComponentPropsWithoutRef<"img"> & { node?: unknown }) {
    const { node: _node, src, alt, title } = props;
    const images = useContext(Images);
    const insideLink = useContext(InsideLink);
    const { t } = useI18n();
    const name = uploadFilename(typeof src === "string" ? src : undefined);
    const info = name ? images?.[name] : undefined;
    const pending = useContext(Pending);

    if (name && pending?.[name]) {
      return <img src={pending[name]} alt={alt ?? ""} title={title} loading="lazy" decoding="async" className="pending-image" />;
    }
    if (!info || typeof src !== "string") {
      return <img src={src} alt={alt ?? ""} title={title} loading="lazy" decoding="async" />;
    }

    const srcSet = [
      ...info.variants.map((v) => `${v.url} ${v.width}w`),
      `${src} ${info.width}w`,
    ].join(", ");

    const img = (
      <img
        src={src}
        srcSet={srcSet}
        sizes={IMAGE_SIZES}
        width={info.width}
        height={info.height}
        alt={alt ?? ""}
        title={title}
        loading="lazy"
        decoding="async"
      />
    );

    if (insideLink) return img;
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="prose-image-link" title={t("image.openFull")}>
        {img}
      </a>
    );
}

// ---------------------------------------------------------------------------
// rehype plugins. They run AFTER rehype-sanitize, so the ids and classes they
// add come from us, never from post content.
// ---------------------------------------------------------------------------
function textOf(node: ElementContent | Root): string {
  if (node.type === "text") return node.value;
  if ("children" in node) return (node.children as ElementContent[]).map(textOf).join("");
  return "";
}

function walk(node: Root | Element, fn: (el: Element) => void) {
  for (const child of node.children) {
    if (child.type === "element") {
      fn(child);
      walk(child, fn);
    }
  }
}

// id on every h2/h3 (for the table of contents and #links)
function rehypeHeadingIds() {
  return (tree: Root) => {
    const seen = new Map<string, number>();
    walk(tree, (el) => {
      if (el.tagName !== "h2" && el.tagName !== "h3") return;
      const base = slugify(textOf(el));
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      el.properties = { ...el.properties, id: n ? `${base}-${n + 1}` : base };
    });
  };
}

// GitHub-style alerts: "> [!NOTE]", "> [!TIP]", "> [!WARNING]", ...
const CALLOUT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/i;
type CalloutLabels = Record<string, string>;
function rehypeCallouts(labels: CalloutLabels) {
  return (tree: Root) => {
    walk(tree, (el) => {
      if (el.tagName !== "blockquote") return;
      const p = el.children.find((c): c is Element => c.type === "element");
      const first = p?.tagName === "p" ? p.children[0] : undefined;
      if (!p || first?.type !== "text") return;
      const m = CALLOUT_RE.exec(first.value);
      if (!m) return;
      const kind = m[1].toLowerCase();
      first.value = first.value.slice(m[0].length);
      if (!first.value && p.children.length === 1) el.children.splice(el.children.indexOf(p), 1);
      else if (!first.value && p.children[1]?.type === "element" && p.children[1].tagName === "br") p.children.splice(0, 2);
      el.properties = { ...el.properties, className: ["callout", kind] };
      el.children.unshift({
        type: "element", tagName: "span", properties: { className: ["callout-title"] },
        children: [{ type: "text", value: labels[kind] ?? kind }],
      });
    });
  };
}

// Plain text of a hast node (the source of a code block)
function hastText(node: unknown): string {
  const n = node as { type?: string; value?: string; children?: unknown[] } | undefined;
  if (!n) return "";
  if (n.type === "text") return n.value ?? "";
  return (n.children ?? []).map(hastText).join("");
}

// ```hexdump blocks: the interactive viewer (utils/hexdump.ts has the syntax)
function HexBlock({ source }: { source: string }) {
  const dump = useMemo(() => parseHexdump(source), [source]);
  if (!dump.bytes.length) return <pre className="hexdump-invalid">{source}</pre>;
  return <HexViewer dump={dump} />;
}

// Code block: panel with the language and a copy button
function Pre(props: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const { node, className, children, ...rest } = props;
  const code = (node as { children?: { properties?: { className?: unknown } }[] } | undefined)?.children?.[0];
  const codeClass = String(code?.properties?.className ?? "");
  if (/\blanguage-hexdump\b/.test(`${className ?? ""} ${codeClass}`)) return <HexBlock source={hastText(node).replace(/\n$/, "")} />;
  return <CodePre className={className} {...rest}>{children}</CodePre>;
}

function CodePre(props: ComponentPropsWithoutRef<"pre">) {
  const { className, children, ...rest } = props;
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  const lang = /language-([\w+-]+)/.exec(className ?? "")?.[1] ?? "text";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.innerText ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable (http, permissions) */ }
  };

  return (
    <div className="panel codeblock">
      <div className="panel-bar">
        <span>{lang}</span>
        <button type="button" className="copy" onClick={copy}>{copied ? t("code.copied") : t("code.copy")}</button>
      </div>
      <pre ref={ref} className={className} {...rest}>{children}</pre>
    </div>
  );
}

const COMPONENTS: Components = { a: Anchor, img: Image, pre: Pre };

function UntrustedAnchor(props: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
  const { children, href } = props;
  return (
    <span className="untrusted-link" title={href}>
      <span className="untrusted-link-text">{children}</span> <code>{href ?? "(no address)"}</code>
    </span>
  );
}

function UntrustedImage(props: ComponentPropsWithoutRef<"img"> & { node?: unknown }) {
  const { src, alt } = props;
  const s = typeof src === "string" ? src : "";
  if (/^\/api\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)) return <Image {...props} />;
  return <span className="untrusted-image">[external image not loaded: <code>{s || "(no address)"}</code>{alt ? ` · ${alt}` : ""}]</span>;
}

const UNTRUSTED: Components = { a: UntrustedAnchor, img: UntrustedImage, pre: Pre };

export default function MarkdownRenderer({ content, images, untrusted = false, pendingImages }: MarkdownProps) {
  const { t } = useI18n();
  const rehypePlugins = useMemo(() => {
    const labels: CalloutLabels = {
      note: t("callout.note"), tip: t("callout.tip"), important: t("callout.important"),
      warning: t("callout.warning"), caution: t("callout.caution"),
    };
    return [rehypeRaw, [rehypeSanitize, defaultSchema], rehypeHeadingIds, [rehypeCallouts, labels], [rehypePrism, { ignoreMissing: true }]] as const;
  }, [t]);
  return (
    <Images.Provider value={images}>
     <Pending.Provider value={pendingImages}>
      <div className="prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rehypePlugins={rehypePlugins as any}
          components={untrusted ? UNTRUSTED : COMPONENTS}
        >
          {content}
        </ReactMarkdown>
      </div>
     </Pending.Provider>
    </Images.Provider>
  );
}
