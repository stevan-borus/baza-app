import { Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";

type CampaignEmailProps = {
  title: string;
  body: string;
  unsubscribeUrl: string;
  /** Light-mode wordmark (green on cream). */
  logoUrl: string;
  /** Dark-mode wordmark (cream on dark). */
  logoDarkUrl: string;
  chrome: { headerLabel: string; unsubscribeText: string; footerNote: string };
};

// Mirrors booking-change-email's dark-mode handling so the promo email matches
// the transactional one in a dark inbox (Apple Mail / iOS). Force-inverters
// (Gmail app, Outlook.com) ignore it and invert themselves — unavoidable.
const darkModeCss = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .logo-dark { display: none; }
  @media (prefers-color-scheme: dark) {
    .email-bg   { background-color: #11151f !important; }
    .email-card { background-color: #1c2333 !important; }
    .email-heading { color: #7fc59b !important; }
    .email-text { color: #e8eaf0 !important; }
    .email-overline, .email-footer { color: #9aa3b2 !important; }
    .email-hr   { border-color: #2c3548 !important; }
    .email-unsub { color: #9aa3b2 !important; }
    .logo-light { display: none !important; }
    .logo-dark  { display: inline-block !important; }
  }
`;

export function CampaignEmail({ title, body, unsubscribeUrl, logoUrl, logoDarkUrl, chrome }: CampaignEmailProps) {
  // Split into paragraphs on blank lines; drop empty lines so an admin's
  // blank-line spacing renders as paragraph breaks, not empty <Text> nodes.
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 0);

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: darkModeCss }} />
      </Head>
      <Preview>{title}</Preview>
      <Body className="email-bg" style={styles.body}>
        <Container className="email-card" style={styles.container}>
          <Section style={styles.logoWrap}>
            <Img src={logoUrl} alt="Baza Pilates" width="132" className="logo-light" style={styles.logo} />
            <Img src={logoDarkUrl} alt="Baza Pilates" width="132" className="logo-dark" style={styles.logo} />
          </Section>
          <Text className="email-overline" style={styles.overline}>{chrome.headerLabel}</Text>
          <Heading className="email-heading" style={styles.heading}>{title}</Heading>
          {paragraphs.map((p, i) => (
            <Text key={i} className="email-text" style={styles.text}>{p}</Text>
          ))}
          <Hr className="email-hr" style={styles.hr} />
          <Section>
            <Text className="email-footer" style={styles.footer}>{chrome.footerNote}</Text>
            <Link href={unsubscribeUrl} className="email-unsub" style={styles.unsubscribe}>{chrome.unsubscribeText}</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: { backgroundColor: "#fdf7f4", fontFamily: "Arial, sans-serif", margin: 0, padding: "24px 0" },
  container: { backgroundColor: "#ffffff", borderRadius: "12px", margin: "0 auto", maxWidth: "560px", padding: "32px 24px 24px" },
  logoWrap: { textAlign: "center" as const, margin: "0 0 24px" },
  logo: { display: "inline-block", margin: "0 auto" },
  overline: { color: "#8a8a8a", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase" as const, margin: "0 0 4px" },
  heading: { color: "#2e5b42", fontSize: "22px", margin: "0 0 16px" },
  text: { color: "#333333", fontSize: "15px", lineHeight: "22px", margin: "0 0 12px" },
  hr: { borderColor: "#eee", margin: "24px 0 12px" },
  footer: { color: "#999999", fontSize: "12px", margin: "0 0 6px" },
  unsubscribe: { color: "#999999", fontSize: "12px", textDecoration: "underline" },
};
