import { createContext, useContext, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypePrism from "rehype-prism-plus";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { PostImages } from "../../types/media";

interface MarkdownProps {
  content: string;
  // Size data for uploaded images (from the post API or the media library).
  // Images without an entry render as a plain lazy-loaded <img>.
  images?: PostImages;
}

// The post column is at most 900px wide; below that the image fills the screen.
const IMAGE_SIZES = "(max-width: 940px) 100vw, 900px";

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

function Anchor(props: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
  const { node: _node, ...rest } = props;
  return (
    <InsideLink.Provider value={true}>
      <a {...rest} />
    </InsideLink.Provider>
  );
}

// Stable component (defined once): a component created per render would make
// React remount every image on each keystroke in the editor preview.
function Image(props: ComponentPropsWithoutRef<"img"> & { node?: unknown }) {
    const { node: _node, src, alt, title } = props;
    const images = useContext(Images);
    const insideLink = useContext(InsideLink);
    const name = uploadFilename(typeof src === "string" ? src : undefined);
    const info = name ? images?.[name] : undefined;

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
      <a href={src} target="_blank" rel="noopener noreferrer" className="prose-image-link" title="Open full size">
        {img}
      </a>
    );
}

const COMPONENTS: Components = { a: Anchor, img: Image };

export default function MarkdownRenderer({ content, images }: MarkdownProps) {
  return (
    <Images.Provider value={images}>
      <div className="prose">
        <ReactMarkdown
          rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema], rehypePrism]}
          components={COMPONENTS}
        >
          {content}
        </ReactMarkdown>
      </div>
    </Images.Provider>
  );
}
