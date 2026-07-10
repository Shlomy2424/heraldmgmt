import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  inviteLink: string
}

const Email = ({ name, inviteLink }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're invited to Herald Property Management</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You're invited to Herald Property Management</Heading>
        <Text style={p}>{name ? `Hi ${name},` : 'Hi,'}</Text>
        <Text style={p}>An administrator invited you to create an account. Choose your password using the secure invite link below.</Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={inviteLink} style={btn}>Accept invite</Button>
        </Section>
        <Text style={pSmall}>Or paste this link into your browser:</Text>
        <Link href={inviteLink} style={linkStyle}>{inviteLink}</Link>
        <Text style={pSmall}>This invite expires in 7 days.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: "You're invited to Herald Property Management",
  displayName: 'User invite',
  previewData: { name: 'Jane', inviteLink: 'https://example.com/accept-invite?token=demo' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#172033' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px 24px' }
const h1 = { fontSize: '22px', margin: '0 0 16px', color: '#0e4a6b' }
const p = { fontSize: '15px', lineHeight: '1.6', margin: '0 0 12px' }
const pSmall = { fontSize: '13px', lineHeight: '1.5', color: '#586174', margin: '16px 0 6px' }
const btn = { background: '#0e4a6b', color: '#ffffff', padding: '12px 22px', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }
const linkStyle = { fontSize: '13px', color: '#0e4a6b', wordBreak: 'break-all' as const }
