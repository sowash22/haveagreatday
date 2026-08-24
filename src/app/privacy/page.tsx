import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Have a Great Day handles city searches, rounded coordinates, local preferences, forecast providers, and photo requests.",
};

export default function PrivacyPage() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to privacy details</a>
      <header className="app-bar-shell">
        <nav className="app-bar app-bar--simple page-shell" aria-label="Primary navigation">
          <Link className="wordmark" href="/">Have a Great Day</Link>
          <Link className="quiet-link" href="/">Planner</Link>
        </nav>
      </header>
      <main id="main" className="page-shell privacy-page">
        <header>
          <h1>Privacy, in plain language.</h1>
          <p>Have a Great Day works without an account, advertising, first-party analytics, or a database.</p>
        </header>
        <section>
          <h2>What leaves your browser</h2>
          <p>A city search is sent to Open-Meteo’s geocoding service. After you choose a result or permit browser location access, coordinates are rounded to two decimal places before they are sent to Open-Meteo’s weather and air-quality services. Some background photos load directly from Unsplash’s image service, which receives the ordinary request information needed to deliver and count a photo view. Your searched coordinates are not included in the photo URL.</p>
        </section>
        <section>
          <h2>What stays on this device</h2>
          <p>Your selected activity, units, and up to five recent rounded locations are stored in your browser. Use “Forget this place” on the planner to remove the current location from saved places.</p>
        </section>
        <section>
          <h2>Shared links</h2>
          <p>A shared link contains rounded latitude and longitude, units, and activity. Anyone with the link can see that approximate location. It never includes a street address or health information.</p>
        </section>
        <section>
          <h2>Provider terms</h2>
          <p>Open-Meteo and Unsplash receive requests under their own terms and privacy practices. Read <a href="https://open-meteo.com/en/terms" rel="noreferrer">Open-Meteo’s terms</a> and <a href="https://unsplash.com/terms" rel="noreferrer">Unsplash’s terms</a> before using the service for a sensitive purpose.</p>
        </section>
      </main>
      <footer className="statement-footer"><div className="page-shell"><p className="statement-footer__line">More good hours outside. Less guessing.</p><div className="statement-footer__meta"><span>Have a Great Day</span><nav aria-label="Footer navigation"><Link href="/">Planner</Link></nav></div></div></footer>
    </>
  );
}
