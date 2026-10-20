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
  const [season, setSeason] = useState<number | null>(null);
  // Changing Chat's key makes React replace it with a fresh one: the start screen, no questions or answers.
  const [chatKey, setChatKey] = useState(0);

  function goHome() {
    setChatKey((key) => key + 1);
    window.scrollTo(0, 0);
  }

  return (
    <>
      <Header onHome={goHome}>
        <SeasonSelector serverAwake={serverAwake} season={season} onSeasonChange={setSeason} />
      </Header>
      <WakeBanner onAwake={() => setServerAwake(true)} />
      <main>
        <Chat key={chatKey} season={season} />
      </main>
      <Footer />
    </>
  );
}
