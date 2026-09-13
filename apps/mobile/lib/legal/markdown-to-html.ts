// Markdown -> HTML for the public, server-rendered legal pages.
//
// Scope is the syntax the documents under docs/legal/** actually contain:
// h1-h3, paragraphs, `-` bullets, `>` blockquotes, `**bold**` and pipe tables.
// No links, images, code or ordered lists appear in any of them, so none are
// handled — an unsupported construct renders as escaped text rather than
// silently dropping a clause.
//
// The in-app viewer keeps using react-native-markdown-display; that renders to
// RN nodes, not an HTML string, so it cannot serve this path.

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Escape first, then apply emphasis, so bold content can never carry a tag. */
function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function tableCells(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const DELIMITER_ROW = /^\|?[\s:-]*-[\s:|-]*\|?$/;

function isTableRow(line: string): boolean {
  return line.startsWith("|");
}

export function markdownToHtml(source: string): string {
  const lines = source.split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "") {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(`<li>${inline(lines[i].trim().slice(2))}</li>`);
        i++;
      }
      i--;
      blocks.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      i--;
      blocks.push(`<blockquote><p>${inline(quoted.join(" "))}</p></blockquote>`);
      continue;
    }

    if (isTableRow(line)) {
      flushParagraph();
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        const raw = lines[i].trim();
        if (!DELIMITER_ROW.test(raw)) rows.push(tableCells(raw));
        i++;
      }
      i--;
      const [header, ...body] = rows;
      const headerHtml = `<tr>${header.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`;
      const bodyHtml = body
        .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("\n");
      blocks.push(
        `<table>\n<thead>\n${headerHtml}\n</thead>\n<tbody>\n${bodyHtml}\n</tbody>\n</table>`,
      );
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks.join("\n");
}
