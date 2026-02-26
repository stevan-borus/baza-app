import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type ResetEmailProps = {
  resetUrl: string;
};

export function ResetEmail({ resetUrl }: ResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Zahtev za izmenu lozinke</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>Baza Pilates</Heading>
          <Text style={styles.text}>Primili smo zahtev za izmenu lozinke.</Text>
          <Section style={styles.buttonWrapper}>
            <Button href={resetUrl} style={styles.button}>
              Postavi novu lozinku
            </Button>
          </Section>
          <Text style={styles.text}>Ako nisi tražio izmenu, slobodno ignoriši ovu poruku.</Text>
          <Text style={styles.mono}>{resetUrl}</Text>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>Link važi ogrančeno vreme iz bezbednosnih razloga.</Text>
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
    padding: "24px",
  },
  heading: {
    color: "#2e5b42",
    fontSize: "24px",
    margin: "0 0 16px",
  },
  text: {
    color: "#151e3f",
    fontSize: "15px",
    lineHeight: "1.5",
    margin: "0 0 12px",
  },
  buttonWrapper: {
    margin: "20px 0",
  },
  button: {
    backgroundColor: "#6e1644",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "bold",
    padding: "12px 18px",
    textDecoration: "none",
  },
  mono: {
    color: "#6e1644",
    fontFamily: "Menlo, monospace",
    fontSize: "13px",
    wordBreak: "break-all" as const,
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
