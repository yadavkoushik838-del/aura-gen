import "./globals.css";

export const metadata = {
  title: "AuraGen | Adaptive Experience Intelligence",
  description: "An AI-assisted adaptive user experience platform that reduces interaction friction.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
