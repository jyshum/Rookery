import type { Metadata } from 'next'
import { Lora, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const lora = Lora({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-lora',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-jb',
})

export const metadata: Metadata = {
  title: 'Rookery',
  description: 'Lab image annotation for robot perception',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${lora.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
