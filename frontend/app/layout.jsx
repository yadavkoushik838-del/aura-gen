
import "./globals.css";

export const metadata = {
  title: {
    default: "AuraGen | Adaptive Experience Intelligence",
    template: "%s | AuraGen",
  },
  applicationName: "AuraGen",
  description:
    "AuraGen is an AI-powered adaptive user experience platform designed to optimize interaction flow and reduce interface friction.",
  keywords: [
    "AuraGen",
    "Artificial Intelligence",
    "Adaptive User Experience",
    "Cognitive Load Optimization",
    "Interaction Friction",
    "AI-Powered Interface",
  ],
  authors: [
    {
      name: "AuraGen Development Team",
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
