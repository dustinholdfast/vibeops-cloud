import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import './globals.css';

export const metadata: Metadata = {
  title: 'VibeOps Cloud',
  description: 'Hosted multi-tenant vibe coding project tracker',
  icons: { icon: '/favicon.svg' },
};

// Auth/billing routes need a request; also avoids prerender crashing when
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not present at build time (local/CI).
export const dynamic = 'force-dynamic';

const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem('vibeops-theme');
    var theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const html = (
    <html lang="en" className="h-full dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full bg-background text-text antialiased">
        {children}
      </body>
    </html>
  );

  if (!publishableKey) {
    return html;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#8b7cf6',
          colorBackground: '#121214',
          colorInputBackground: '#1a1a1e',
          colorInputText: '#f4f4f5',
        },
      }}
    >
      {html}
    </ClerkProvider>
  );
}
