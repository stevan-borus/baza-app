import { ScrollView, Text, View } from "react-native";

type Props = {
  body: string;
  bottomPad?: number;
};

/**
 * Minimal renderer for legal-document markdown. v1 renders raw text in a
 * scroll view — readable, no dependency. Upgrade to a markdown library
 * (react-native-markdown-display) when designers want formatting beyond
 * "monospace paragraphs."
 */
export function LegalDocumentViewer({ body, bottomPad = 32 }: Props) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>
      <View className="px-6 py-4">
        <Text
          className="text-[14px] text-foreground"
          style={{ lineHeight: 22 }}
        >
          {body}
        </Text>
      </View>
    </ScrollView>
  );
}
