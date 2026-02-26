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

type InviteEmailProps = {
  fullName: string;
  inviteUrl: string;
};

export function InviteEmail({ fullName, inviteUrl }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Pozivnica za aktivaciju Baza Pilates naloga</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>Baza Pilates</Heading>
          <Text style={styles.text}>Zdravo {fullName},</Text>
          <Text style={styles.text}>Naš tim ti je kreirao nalog za Baza Pilates aplikaciju.</Text>
          <Section style={styles.buttonWrapper}>
            <Button href={inviteUrl} style={styles.button}>
              Aktiviraj nalog
            </Button>
          </Section>
          <Text style={styles.text}>Ako dugme ne radi, kopiraj link:</Text>
          <Text style={styles.mono}>{inviteUrl}</Text>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>Ovaj link ističe prema podešavanjima pozivnice.</Text>
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
    backgroundColor: "#2e5b42",
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
