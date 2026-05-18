import Markdown, { MarkdownIt } from "react-native-markdown-display";
import { useThemeTokens } from "@/components/ui/tokens";

// Custom markdown-it: typographer OFF so "(c)" stays "(c)" instead of
// becoming © — legal docs use (a)/(b)/(c)/... as list enumerations and
// we don't want the typographer's smart substitutions there.
const markdownItInstance = MarkdownIt({
  typographer: false,
  linkify: true,
});

type Props = {
  body: string;
  /**
   * Optional substitutions applied to `{{key}}` placeholders in the source
   * markdown before parsing. Unmatched placeholders fall back to a visible
   * blank (`__________`) so it's obvious something needs to be filled
   * in, rather than leaking the literal placeholder syntax to the user.
   */
  substitutions?: Record<string, string>;
};

function applySubstitutions(
  body: string,
  subs: Record<string, string> | undefined,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = subs?.[key];
    return value && value.trim().length > 0 ? value : "__________";
  });
}

/**
 * Renders legal-document markdown using `react-native-markdown-display`.
 * Renders inline (no inner ScrollView) so the parent — typically AppSheet's
 * BottomSheetScrollView — owns vertical scroll and dynamic sizing measures
 * the content correctly. Styles are tokenized against the active theme.
 */
export function LegalDocumentViewer({ body, substitutions }: Props) {
  const tokens = useThemeTokens();
  const rendered = applySubstitutions(body, substitutions);

  const styles = {
    body: { color: tokens.foreground, fontSize: 14, lineHeight: 22 },
    heading1: {
      color: tokens.foreground,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: "700" as const,
      marginTop: 8,
      marginBottom: 8,
    },
    heading2: {
      color: tokens.foreground,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "700" as const,
      marginTop: 16,
      marginBottom: 6,
    },
    heading3: {
      color: tokens.foreground,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "600" as const,
      marginTop: 12,
      marginBottom: 4,
    },
    paragraph: {
      color: tokens.foreground,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 0,
      marginBottom: 10,
    },
    strong: { color: tokens.foreground, fontWeight: "700" as const },
    em: { color: tokens.foreground, fontStyle: "italic" as const },
    bullet_list: { marginBottom: 10 },
    ordered_list: { marginBottom: 10 },
    list_item: { color: tokens.foreground, marginBottom: 4 },
    blockquote: {
      backgroundColor: tokens.glass,
      borderLeftColor: tokens.accent,
      borderLeftWidth: 3,
      paddingLeft: 12,
      paddingVertical: 6,
      marginVertical: 8,
    },
    code_inline: {
      color: tokens.foreground,
      backgroundColor: tokens.glass,
      paddingHorizontal: 4,
      borderRadius: 4,
      fontSize: 13,
    },
    link: { color: tokens.accent, textDecorationLine: "underline" as const },
    hr: { backgroundColor: tokens.glassBorder, height: 1, marginVertical: 12 },
  };

  return (
    <Markdown style={styles} markdownit={markdownItInstance}>
      {rendered}
    </Markdown>
  );
}
