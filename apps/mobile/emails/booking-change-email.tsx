import { Body, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from "@react-email/components";

type BookingChangeEmailProps = {
  heading: string;
  lines: string[];
  /** Absolute URL to the Baza wordmark for LIGHT mode (green on cream). */
  logoUrl: string;
  /** Absolute URL to the Baza wordmark for DARK mode (cream on dark). */
  logoDarkUrl: string;
  /** Localized opt-out line — must follow the recipient's locale. */
  footer: string;
};

// Dark-mode handling for email is best-effort: clients that honour
// prefers-color-scheme (Apple Mail, iOS Mail) get a real dark card + light text
// + the cream logo via the <style> below; aggressive force-inverters (Gmail
// app, Outlook.com) ignore it and invert on their own — unavoidable, but the
// neutral colours degrade acceptably. color-scheme meta opts us in.
const darkModeCss = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .logo-dark { display: none; }
  @media (prefers-color-scheme: dark) {
    .email-bg   { background-color: #11151f !important; }
    .email-card { background-color: #1c2333 !important; }
    .email-heading, .email-text { color: #e8eaf0 !important; }
    .email-footer { color: #9aa3b2 !important; }
    .email-hr   { border-color: #2c3548 !important; }
    .logo-light { display: none !important; }
    .logo-dark  { display: inline-block !important; }
  }
`;

export function BookingChangeEmail({ heading, lines, logoUrl, logoDarkUrl, footer }: BookingChangeEmailProps) {
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: darkModeCss }} />
      </Head>
      <Preview>{heading}</Preview>
      <Body className="email-bg" style={styles.body}>
        <Container className="email-card" style={styles.container}>
          <Section style={styles.logoWrap}>
            <Img src={logoUrl} alt="Baza Pilates" width="132" className="logo-light" style={styles.logo} />
            <Img src={logoDarkUrl} alt="Baza Pilates" width="132" className="logo-dark" style={styles.logo} />
          </Section>
          {/* The event itself is the main header now (logo carries the brand). */}
          <Heading className="email-heading" style={styles.heading}>{heading}</Heading>
          {lines.map((line, i) => (
            <Text key={i} className="email-text" style={styles.text}>
              {line}
            </Text>
          ))}
          <Hr className="email-hr" style={styles.hr} />
          <Text className="email-footer" style={styles.footer}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#fdf7f4",
    fontFamily: "Arial, sans-serif",
    margin: 0,
    padding: "24px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "32px 24px 24px",
  },
  logoWrap: {
    textAlign: "center" as const,
    margin: "0 0 24px",
  },
  logo: {
    display: "inline-block",
    margin: "0 auto",
  },
  heading: {
    color: "#151e3f",
    fontSize: "22px",
    fontWeight: "bold" as const,
    margin: "0 0 14px",
  },
  text: {
    color: "#151e3f",
    fontSize: "15px",
    lineHeight: "1.5",
    margin: "0 0 12px",
  },
  hr: {
    borderColor: "#f0ebe7",
    margin: "20px 0 12px",
  },
  footer: {
    color: "#6b7280",
    fontSize: "12px",
    margin: 0,
  },
};
