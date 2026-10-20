import type { SeasonSummary } from "@shared/api-types.ts";
import { useState } from "react";
import { Chat } from "./components/Chat.tsx";
import { Footer } from "./components/Footer.tsx";
import { Header } from "./components/Header.tsx";
import { SeasonSelector } from "./components/SeasonSelector.tsx";
import { WakeBanner } from "./components/WakeBanner.tsx";

/** The page: header with the season selector, wake-up banner, the chat and footer. */
export function App() {
  // True once the server has answered the wake-up ping. The season list waits for it.
  const [serverAwake, setServerAwake] = useState(false);
  // The season questions are about; null until the list of seasons has loaded.
  const [season, setSeason] = useState<SeasonSummary | null>(null);

  return (
    <>
      <Header>
        <SeasonSelector
          serverAwake={serverAwake}
          season={season?.season ?? null}
          onSeasonChange={setSeason}
        />
      </Header>
      <WakeBanner onAwake={() => setServerAwake(true)} />
      <main>
        <Chat season={season?.season ?? null} issue={season?.issue ?? null} />
      </main>
      <Footer />
    </>
  );
}
