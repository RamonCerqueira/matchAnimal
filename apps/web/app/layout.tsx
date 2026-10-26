import type { Metadata } from "next";
import "./globals.css";
import "./styles/product-system.css";
import "./styles/forms-refinement.css";
import "./styles/social-refinement.css";
import "./styles/commercial-admin.css";
import "./styles/hero-stamp.css";
import "./styles/community-feed.css";
import "./styles/settings-elevated.css";

export const metadata: Metadata = {
  title: "MatchAnimal — encontros que fazem bem",
  description: "Uma comunidade feita para criar encontros seguros e conexões de verdade entre pets e seus tutores.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
