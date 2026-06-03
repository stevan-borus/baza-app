import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

type CampaignEmailProps = {
  title: string;
  body: string;
  unsubscribeUrl: string;
  chrome: { headerLabel: string; unsubscribeText: string; footerNote: string };
};

export function CampaignEmail({ title, body, unsubscribeUrl, chrome }: CampaignEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.overline}>{chrome.headerLabel}</Text>
          <Heading style={styles.heading}>{title}</Heading>
          {body.split("\n").map((line, i) => (
            <Text key={i} style={styles.text}>{line}</Text>
          ))}
          <Hr style={styles.hr} />
          <Section>
            <Text style={styles.footer}>{chrome.footerNote}</Text>
            <Link href={unsubscribeUrl} style={styles.unsubscribe}>{chrome.unsubscribeText}</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: { backgroundColor: "#fdf7f4", fontFamily: "Arial, sans-serif", margin: 0, padding: "24px 0" },
  container: { backgroundColor: "#ffffff", borderRadius: "12px", margin: "0 auto", maxWidth: "560px", padding: "24px" },
  overline: { color: "#8a8a8a", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase" as const, margin: "0 0 4px" },
  heading: { color: "#2e5b42", fontSize: "22px", margin: "0 0 16px" },
  text: { color: "#333333", fontSize: "15px", lineHeight: "22px", margin: "0 0 8px" },
  hr: { borderColor: "#eee", margin: "24px 0 12px" },
  footer: { color: "#999999", fontSize: "12px", margin: "0 0 6px" },
  unsubscribe: { color: "#999999", fontSize: "12px", textDecoration: "underline" },
};
