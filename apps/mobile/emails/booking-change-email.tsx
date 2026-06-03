import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";

type BookingChangeEmailProps = { heading: string; lines: string[] };

export function BookingChangeEmail({ heading, lines }: BookingChangeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{heading}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>Baza Pilates</Heading>
          <Text style={styles.subheading}>{heading}</Text>
          {lines.map((line, i) => (
            <Text key={i} style={styles.text}>
              {line}
            </Text>
          ))}
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            Ovaj email možeš isključiti u podešavanjima obaveštenja u aplikaciji.
          </Text>
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
    margin: "0 0 8px",
  },
  subheading: {
    color: "#151e3f",
    fontSize: "17px",
    fontWeight: "bold" as const,
    margin: "0 0 12px",
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
