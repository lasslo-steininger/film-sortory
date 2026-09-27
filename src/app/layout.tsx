import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
export const metadata: Metadata = {
  title: "filmSortory",
  description:
    "Upload a list of films, choose between pairs, and download your ranking.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{let t;try{t=localStorage.getItem('sortory-theme')}catch{}document.documentElement.dataset.theme=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'})()`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
