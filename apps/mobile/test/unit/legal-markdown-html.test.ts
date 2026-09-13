import { describe, it, expect } from "vitest";
import { markdownToHtml } from "@/lib/legal/markdown-to-html";

describe("markdownToHtml", () => {
  it("renders the heading levels the documents use", () => {
    expect(markdownToHtml("# Title")).toBe("<h1>Title</h1>");
    expect(markdownToHtml("## Section")).toBe("<h2>Section</h2>");
    expect(markdownToHtml("### Sub")).toBe("<h3>Sub</h3>");
  });

  it("renders paragraphs and keeps blank-line separation", () => {
    expect(markdownToHtml("One.\n\nTwo.")).toBe("<p>One.</p>\n<p>Two.</p>");
  });

  it("joins consecutive lines into one paragraph", () => {
    expect(markdownToHtml("One\nstill one.")).toBe("<p>One still one.</p>");
  });

  it("renders bold runs inline", () => {
    expect(markdownToHtml("**Version:** 1")).toBe(
      "<p><strong>Version:</strong> 1</p>",
    );
  });

  it("groups consecutive bullets into a single list", () => {
    expect(markdownToHtml("- a;\n- b.")).toBe(
      "<ul>\n<li>a;</li>\n<li>b.</li>\n</ul>",
    );
  });

  it("renders a blockquote", () => {
    expect(markdownToHtml("> Note.")).toBe("<blockquote><p>Note.</p></blockquote>");
  });

  it("renders a pipe table with a header row", () => {
    const md = ["| A | B |", "|---|---|", "| 1 | 2 |"].join("\n");
    expect(markdownToHtml(md)).toBe(
      "<table>\n<thead>\n<tr><th>A</th><th>B</th></tr>\n</thead>\n" +
        "<tbody>\n<tr><td>1</td><td>2</td></tr>\n</tbody>\n</table>",
    );
  });

  it("escapes HTML in text, bold, list items and table cells", () => {
    expect(markdownToHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
    expect(markdownToHtml('He said "hi" & left')).toBe(
      "<p>He said &quot;hi&quot; &amp; left</p>",
    );
    expect(markdownToHtml("- <b>x</b>")).toBe("<ul>\n<li>&lt;b&gt;x&lt;/b&gt;</li>\n</ul>");
    expect(markdownToHtml("| <i> |\n|---|\n| & |")).toContain("&lt;i&gt;");
  });

  it("escapes before emphasis so bold content cannot inject tags", () => {
    expect(markdownToHtml("**<img onerror=x>**")).toBe(
      "<p><strong>&lt;img onerror=x&gt;</strong></p>",
    );
  });

  it("leaves an unmatched asterisk alone rather than emitting a stray tag", () => {
    expect(markdownToHtml("a * b")).toBe("<p>a * b</p>");
    expect(markdownToHtml("**unclosed")).toBe("<p>**unclosed</p>");
  });

  it("returns an empty string for empty input", () => {
    expect(markdownToHtml("")).toBe("");
    expect(markdownToHtml("\n\n  \n")).toBe("");
  });
});
