import "./globals.css";

export const metadata = {
  title: "Pirates Babaz Panel",
  description: "Pirates Babaz Device Console",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
