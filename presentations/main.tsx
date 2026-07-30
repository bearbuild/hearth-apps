import { createRoot } from "https://esm.sh/react-dom@19/client";
import { useEffect, useRef, useState } from "https://esm.sh/react@19";
import Reveal from "https://esm.sh/reveal.js@5";
import Markdown from "https://esm.sh/reveal.js@5/plugin/markdown/markdown.esm.js";
import mermaid from "https://esm.sh/mermaid@11";

declare const playground: any;

type Config = {
  title?: string;
  theme?: "default";
  transition?: string;
  slideNumber?: boolean;
};

type DeckFile = { path: string; name: string; title?: string };

const themeCss = `
.reveal.theme-default { 
  --paper: #faf6f0; --paper-deep: #f3ece1; --ink: #1d1916;
  --ink-soft: #4a4239; --muted: #8a7f70; --accent: #c8472a;
  --accent-soft: #e57a4e; --glow: #f4c47a; --line: rgba(29,25,22,.12);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.reveal.theme-default.theme-dark {
  --paper: #1a1714; --paper-deep: #211d19; --ink: #f3ece1;
  --ink-soft: #cabfae; --muted: #9b8f7d; --accent: #e57a4e;
  --accent-soft: #f4a574; --glow: #f4c47a; --line: rgba(243,236,225,.16);
}
.reveal.theme-default, .reveal.theme-default .slides section {
  background: var(--paper) !important; color: var(--ink) !important;
}
.reveal.theme-default.theme-light {
  background-image: radial-gradient(circle at 50% 0%, rgba(229,122,78,.08), transparent 55%), radial-gradient(circle at 85% 80%, rgba(200,71,42,.04), transparent 60%) !important;
}
.reveal.theme-default.theme-dark {
  background-image: radial-gradient(circle at 50% 0%, rgba(229,122,78,.06), transparent 55%), radial-gradient(circle at 85% 80%, rgba(200,71,42,.03), transparent 60%) !important;
}
.reveal.theme-default h1, .reveal.theme-default h2 {
  font-family: Georgia, "Times New Roman", serif !important;
  font-weight: 500 !important; letter-spacing: -.025em !important;
  text-transform: none !important; color: var(--ink) !important;
}
.reveal.theme-default h1 { line-height: 1.1 !important; }
.reveal.theme-default h2 { line-height: 1.15 !important; }
.reveal.theme-default h3, .reveal.theme-default h4 {
  font-weight: 700 !important; text-transform: uppercase !important;
  letter-spacing: .06em !important; color: var(--accent) !important;
  font-size: .75em !important;
}
.reveal.theme-default p, .reveal.theme-default li {
  color: var(--ink-soft) !important; line-height: 1.55 !important;
}
.reveal.theme-default strong { color: var(--ink) !important; }
.reveal.theme-default a { color: var(--accent) !important; }
.reveal.theme-default blockquote {
  border-left: 3px solid var(--glow) !important;
  background: rgba(244,196,122,.08) !important;
  padding: .8em 1.2em !important; text-align: left;
  color: var(--ink-soft) !important; border-radius: 0 8px 8px 0 !important;
}
.reveal.theme-default table {
  font-size: .7em !important; border-top: 2px solid var(--ink) !important;
  border-bottom: 2px solid var(--ink) !important; border-collapse: collapse !important;
}
.reveal.theme-default th { color: var(--ink) !important; border-bottom: 1px solid var(--line) !important; }
.reveal.theme-default td { color: var(--ink-soft) !important; border-bottom: 1px solid var(--line) !important; }
.reveal.theme-default code:not(.hljs), .reveal.theme-default pre {
  background: var(--paper-deep) !important; color: var(--ink) !important;
  border: 1px solid var(--line) !important; border-radius: 8px !important;
}
.reveal.theme-default pre { box-shadow: 0 12px 40px rgba(29,25,22,.08) !important; }
.reveal .mermaid-diagram { display:flex; justify-content:center; align-items:center; width:100%; max-height:560px; margin:.8em auto; }
.reveal .mermaid-diagram svg { max-width:100%; max-height:560px; }
.reveal .mermaid-error { color: var(--accent); text-align:left; }
.reveal .progress { height:3px !important; background:var(--line) !important; }
.reveal .progress span { background:var(--accent) !important; }
.reveal .controls, .reveal .slide-number { color:var(--muted) !important; }
.reveal .slide-number { background:transparent !important; }
.reveal.overview .slides section { display:block !important; opacity:1 !important; visibility:visible !important; }
`;

function installStyles() {
  if (document.getElementById("presentations-theme")) return;
  const style = document.createElement("style");
  style.id = "presentations-theme";
  style.textContent = themeCss;
  document.head.appendChild(style);
}

async function loadCss(id: string, url: string) {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.appendChild(style);
  }
  const response = await fetch(url);
  if (response.ok) style.textContent = await response.text();
}

function parseDeck(content: string): { config: Config; markdown: string } {
  let markdown = content.replace(/^\uFEFF/, "");
  const config: Config = {};
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (match) {
    markdown = markdown.slice(match[0].length);
    for (const line of match[1].split("\n")) {
      const item = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
      if (!item) continue;
      const value = item[2].trim().replace(/^["']|["']$/g, "");
      if (item[1] === "title") config.title = value;
      if (item[1] === "transition") config.transition = value;
      if (item[1] === "slideNumber") config.slideNumber = value === "true";
      if (item[1] === "theme") config.theme = "default";
    }
  }
  markdown = markdown.replace(/<!--\s*notes?:?\s*([\s\S]*?)-->/gi, (_, notes) => `\nNotes:\n${String(notes).trim()}\n`);
  return { config, markdown };
}

function titleFor(slide?: HTMLElement) {
  if (!slide) return "End of presentation";
  const heading = slide.querySelector("h1,h2,h3,h4,h5,h6")?.textContent?.trim();
  return (heading || slide.textContent?.replace(/\s+/g, " ").trim() || "").slice(0, 40);
}

async function ensureSampleDeck() {
  try {
    await playground.open("Presentations/sample-deck.md");
    return;
  } catch {}

  try {
    const bundled = await playground.open("Apps/presentations/sample-deck.md");
    const content = await bundled.read();
    const target = await playground.open("Presentations/sample-deck.md", { create: true });
    if (target.kind === "text") await target.write(content);
    await target.close?.();
  } catch {}
}

async function renderMermaid(root: HTMLElement, dark: boolean) {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("code[class*='mermaid']"));
  if (!nodes.length) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: dark
      ? { background: "#1a1714", primaryColor: "#2c2722", primaryTextColor: "#f3ece1", primaryBorderColor: "#e57a4e", lineColor: "#cabfae" }
      : { background: "#faf6f0", primaryColor: "#f3ece1", primaryTextColor: "#1d1916", primaryBorderColor: "#c8472a", lineColor: "#4a4239" },
    flowchart: { htmlLabels: false, useMaxWidth: true },
  });
  for (let i = 0; i < nodes.length; i++) {
    const code = nodes[i].textContent || "";
    const host = nodes[i].parentElement!;
    host.className = "mermaid-diagram";
    try {
      const result = await mermaid.render(`diagram-${Date.now()}-${i}`, code);
      host.innerHTML = result.svg;
    } catch (error) {
      host.className += " mermaid-error";
      host.textContent = `Diagram error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

function App() {
  const [files, setFiles] = useState<DeckFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    installStyles();
    (async () => {
      try {
        await ensureSampleDeck();
        const entries = await playground.listFiles("Presentations");
        const names = Array.isArray(entries) ? entries : Object.keys(entries || {});
        const paths = names
          .map((entry: any) => typeof entry === "string" ? entry : entry?.path || entry?.name || "")
          .filter((path: string) => path.endsWith(".md"))
          .map((path: string) => path.startsWith("Presentations/") ? path : `Presentations/${path}`);
        const decks = await Promise.all(paths.map(async (path: string) => {
          try {
            const file = await playground.open(path);
            const parsed = parseDeck(await file.read());
            return { path, name: path.split("/").pop() || path, title: parsed.config.title };
          } catch {
            return { path, name: path.split("/").pop() || path };
          }
        }));
        setFiles(decks.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name)));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (selected) return <Deck path={selected} onBack={() => setSelected(null)} />;
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Presentations</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Markdown slide decks powered by reveal.js</p>
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && !files.length && <p className="text-sm text-muted-foreground">Add .md files to the Presentations folder to get started.</p>}
      <div className="grid gap-2">
        {files.map(file => (
          <button key={file.path} onClick={() => setSelected(file.path)} className="text-left rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent transition-colors">
            <div className="font-medium text-foreground">{file.title || file.name.replace(/\.md$/, "")}</div>
            {file.title && <div className="text-xs text-muted-foreground mt-1">{file.name}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Deck({ path, onBack }: { path: string; onBack: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<any>(null);
  const [title, setTitle] = useState("");
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [notes, setNotes] = useState(false);
  const [meta, setMeta] = useState({ number: 1, count: 0, html: "", next: "End of presentation" });

  useEffect(() => {
    let stopped = false;
    let unwatch: (() => void) | undefined;
    const root = rootRef.current;
    if (!root) return;

    const updateMeta = () => {
      const deck = revealRef.current;
      if (!deck) return;
      const slides = deck.getSlides().filter((slide: HTMLElement) => !slide.querySelector(":scope > section"));
      const active = deck.getCurrentSlide() as HTMLElement | null;
      const index = Math.max(0, slides.indexOf(active));
      setMeta({ number: index + 1, count: slides.length, html: active?.querySelector("aside.notes")?.innerHTML || "", next: titleFor(slides[index + 1]) });
    };

    const mount = async (content: string) => {
      const parsed = parseDeck(content);
      setTitle(parsed.config.title || path.split("/").pop()?.replace(/\.md$/, "") || "Presentation");
      if (revealRef.current) revealRef.current.destroy();
      root.innerHTML = '<div class="slides"></div>';
      const section = document.createElement("section");
      section.dataset.markdown = "";
      section.dataset.separator = "^\\r?\\n---\\r?\\n$";
      section.dataset.separatorVertical = "^\\r?\\n----+\\r?\\n$";
      section.dataset.separatorNotes = "^Notes?:\\s*$";
      const textarea = document.createElement("textarea");
      textarea.dataset.template = "";
      textarea.textContent = parsed.markdown;
      section.appendChild(textarea);
      root.querySelector(".slides")!.appendChild(section);
      await Promise.all([
        loadCss("reveal-css", "https://esm.sh/reveal.js@5/dist/reveal.css"),
        loadCss("reveal-theme-css", "https://esm.sh/reveal.js@5/dist/theme/white.css"),
        loadCss("highlight-css", `https://esm.sh/highlight.js@11/styles/${dark ? "github-dark" : "github"}.css`),
      ]);
      if (stopped) return;
      revealRef.current = new Reveal(root, {
        plugins: [Markdown], embedded: true, width: 960, height: 700, margin: .04,
        minScale: .1, maxScale: 2, transition: parsed.config.transition || "slide",
        slideNumber: parsed.config.slideNumber !== false, controls: true, progress: true,
        keyboard: true, overview: true, center: true, touch: true,
      });
      await revealRef.current.initialize();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await renderMermaid(root, dark);
      revealRef.current.on("slidechanged", updateMeta);
      revealRef.current.layout();
      updateMeta();
    };

    (async () => {
      const file = await playground.open(path);
      await mount(await file.read());
      try { unwatch = playground.watch(path, async () => { const next = await playground.open(path); await mount(await next.read()); }); } catch {}
    })();

    return () => {
      stopped = true;
      unwatch?.();
      revealRef.current?.destroy();
      revealRef.current = null;
    };
  }, [path, dark]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "n" || event.key.toLowerCase() === "s") {
        event.preventDefault();
        setNotes(value => !value);
      }
    };
    addEventListener("keydown", handler, true);
    return () => removeEventListener("keydown", handler, true);
  }, []);

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.();
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card h-[42px] flex-shrink-0">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← All presentations</button>
        <div className="text-sm font-medium text-foreground truncate mx-4">{title}</div>
        <div className="flex items-center gap-3 text-sm">
          {meta.count > 0 && <span className="text-xs text-muted-foreground">{meta.count} slides</span>}
          <button onClick={() => setDark(value => !value)} className="text-muted-foreground hover:text-foreground">{dark ? "☀️ Light" : "🌙 Dark"}</button>
          <button onClick={() => setNotes(value => !value)} className="text-muted-foreground hover:text-foreground">📝 Notes</button>
          <button onClick={fullscreen} className="text-muted-foreground hover:text-foreground">⛶ Fullscreen</button>
        </div>
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        <div ref={rootRef} className={`reveal reveal-viewport theme-default ${dark ? "theme-dark" : "theme-light"}`} style={{ height: notes ? "calc(100vh - 234px)" : "calc(100vh - 42px)", background: dark ? "#1a1714" : "#faf6f0" }} />
        {notes && <div className="h-48 border-t border-border bg-card px-6 py-3 overflow-y-auto flex-shrink-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Speaker Notes — Slide {meta.number} of {meta.count}</div>
          <div className="text-xs text-muted-foreground mb-2">Next: {meta.next}</div>
          {meta.html ? <div className="text-sm text-foreground" dangerouslySetInnerHTML={{ __html: meta.html }} /> : <p className="text-sm italic text-muted-foreground">No speaker notes for this slide.</p>}
        </div>}
      </div>
    </div>
  );
}

export default (root: HTMLElement) => {
  installStyles();
  const reactRoot = createRoot(root);
  reactRoot.render(<App />);
  return () => reactRoot.unmount();
};
