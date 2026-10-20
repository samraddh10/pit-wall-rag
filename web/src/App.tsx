import { useState } from "react";
import { Footer } from "./components/Footer.tsx";
import { Header } from "./components/Header.tsx";
import { SeasonSelector } from "./components/SeasonSelector.tsx";
import { WakeBanner } from "./components/WakeBanner.tsx";

/** The page: header with the season selector, wake-up banner, main area and footer. */
export function App() {
  // True once the server has answered the wake-up ping. The season list waits for it.
  const [serverAwake, setServerAwake] = useState(false);
  // The season questions are about; null until the list of seasons has loaded.
  const [season, setSeason] = useState<number | null>(null);

  return (
    <>
      <Header>
        <SeasonSelector serverAwake={serverAwake} season={season} onSeasonChange={setSeason} />
      </Header>
      <WakeBanner onAwake={() => setServerAwake(true)} />
      <main>
        <h2>Ask the rulebook</h2>
        <p>
          Ask a question about the {season !== null && `${season} `}FIA Formula 1 Sporting
          Regulations. Every answer cites the article it came from, and each citation is checked
          before it's shown.
        </p>
      </main>
      <Footer />
    </>
  );
}
