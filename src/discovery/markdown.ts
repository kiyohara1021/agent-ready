/**
 * Conservative Markdown/plain-text signal extraction.
 *
 * Detectors need three things from documentation: its section structure, the
 * commands it tells a reader to run, and the raw prose. A full Markdown parser
 * would be a heavy dependency for that, and hand-rolled heuristics are easier
 * to keep deterministic.
 *
 * Everything returned here is lowercased so callers can use plain lowercase
 * patterns without worrying about case handling.
 */

export interface DocumentSection {
  /** Lowercased heading text; empty for content before the first heading. */
  title: string;
  /** Heading level (1-6), or 0 for the implicit preamble section. */
  level: number;
  /** Lowercased section body, excluding the heading line itself. */
  text: string;
}

export interface DocumentSignals {
  /** Lowercased document text. Only ever a weak (prose-level) signal. */
  text: string;
  sections: readonly DocumentSection[];
  /** Lowercased heading titles, in document order. */
  headings: readonly string[];
  /**
   * Lowercased lines from fenced code blocks plus inline code spans. A command
   * found here is something the document actually tells a reader to run, which
   * is a much stronger signal than the same words appearing in prose.
   */
  code: readonly string[];
}

const FENCE = /^(?:```|~~~)/;
const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
/**
 * Only `=` underlines are treated as setext headings. `-` underlines are
 * ambiguous with horizontal rules and YAML front matter, and a false heading
 * would hand detectors evidence that the author never wrote.
 */
const SETEXT_UNDERLINE = /^={2,}\s*$/;
const INLINE_CODE = /`([^`\n]+)`/g;
const SHELL_PROMPT = /^[$>%]\s*/;
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const EMPHASIS = /[`*_~]/g;

/** Strips link syntax and emphasis so heading matching sees plain words. */
export function normalizeHeading(value: string): string {
  return value.replace(MARKDOWN_LINK, "$1").replace(EMPHASIS, "").trim().toLowerCase();
}

/** Length ignoring whitespace, used to tell real content from a stub file. */
export function contentLength(value: string): number {
  return value.replace(/\s+/g, "").length;
}

/** `true` when any heading matches. Patterns must be non-global. */
export function hasHeading(signals: DocumentSignals, pattern: RegExp): boolean {
  return signals.headings.some((heading) => pattern.test(heading));
}

/** Sections whose title matches. Patterns must be non-global. */
export function findSections(signals: DocumentSignals, pattern: RegExp): DocumentSection[] {
  return signals.sections.filter((section) => section.title !== "" && pattern.test(section.title));
}

/**
 * Extracts {@link DocumentSignals} from raw documentation text.
 *
 * Parsing is pure and deterministic: the same text always yields the same
 * signals, and nothing here touches the filesystem.
 */
export function parseDocument(raw: string): DocumentSignals {
  const lines = raw.split(/\r?\n/);
  const sections: DocumentSection[] = [];
  const code: string[] = [];

  let title = "";
  let level = 0;
  let body: string[] = [];
  let inFence = false;

  const flush = (): void => {
    sections.push({ title, level, text: body.join("\n").toLowerCase() });
  };

  const startSection = (nextTitle: string, nextLevel: number): void => {
    flush();
    title = nextTitle;
    level = nextLevel;
    body = [];
  };

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    if (FENCE.test(trimmed)) {
      inFence = !inFence;
      body.push(line);
      continue;
    }

    if (inFence) {
      body.push(line);
      const command = trimmed.replace(SHELL_PROMPT, "").trim();
      if (command !== "") code.push(command.toLowerCase());
      continue;
    }

    const atx = ATX_HEADING.exec(trimmed);
    const hashes = atx?.[1];
    const atxTitle = atx?.[2];
    if (hashes !== undefined && atxTitle !== undefined) {
      startSection(normalizeHeading(atxTitle), hashes.length);
      continue;
    }

    if (SETEXT_UNDERLINE.test(trimmed)) {
      const previous = (lines[index - 1] ?? "").trim();
      if (previous !== "" && !FENCE.test(previous)) {
        // The heading text was appended as body on the previous iteration.
        body.pop();
        startSection(normalizeHeading(previous), 1);
        continue;
      }
    }

    body.push(line);
    for (const match of trimmed.matchAll(INLINE_CODE)) {
      const span = match[1]?.trim();
      if (span !== undefined && span !== "") code.push(span.toLowerCase());
    }
  }

  flush();

  return {
    text: raw.toLowerCase(),
    sections,
    headings: sections.filter((section) => section.title !== "").map((section) => section.title),
    code,
  };
}
