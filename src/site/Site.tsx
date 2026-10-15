import { useEffect, useRef, useState } from "react";
import {
  Apple,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Gauge,
  Github,
  Layers,
  Menu,
  Monitor,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Timer,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { navigate } from "../router";
import { siteApi, type SiteConfig } from "./api";
import { useAuth } from "./useAuth";

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const FEATURES = [
  { icon: Layers, title: "Parallel segments", body: "Splits a file into up to 16 byte-range segments and pulls them at once, so a fast link is actually used." },
  { icon: RotateCcw, title: "Resume anything", body: "Every segment is checkpointed. Close the app, lose Wi-Fi, or reboot — downloads pick up where they stopped." },
  { icon: Gauge, title: "Adaptive tuning", body: "Connection count reacts to throughput and latency, backing off when the server or your link is struggling." },
  { icon: Wifi, title: "Queue and limits", body: "Cap how many files run at once and set speed limits globally or per download, so browsing stays usable." },
  { icon: ShieldCheck, title: "Safe by default", body: "URLs are validated before they are touched, checksums are verified, and partial files are never mistaken for complete ones." },
  { icon: Timer, title: "Honest estimates", body: "Smoothed speed sampling gives a completion time that reflects recent performance instead of a best-case guess." },
];

const STEPS = [
  { title: "Install the app", body: "Grab the installer for Windows, macOS or Linux. No account, no telemetry, no bundled extras." },
  { title: "Add your links", body: "Paste one URL, drop a list of them, or send links straight from your browser with the optional extension." },
  { title: "Let it run", body: "The accelerator probes range support, chooses a strategy and keeps every transfer resumable in the background." },
];

const FAQ = [
  { q: "Is the accelerator free?", a: "Yes. The desktop app is free to download and use. Accounts on this site only exist to manage access and are optional for using the app itself." },
  { q: "Does it work with any server?", a: "It works with any public HTTP or HTTPS URL. If the server supports byte ranges you get parallel segments; otherwise it falls back to a single reliable stream." },
  { q: "Why sign in at all?", a: "Signing in is only needed if you want an account on this site — for example to be granted access to builds. The desktop app never requires it." },
  { q: "Where do downloads go?", a: "Into your system Downloads folder by default. You can point it somewhere else in Settings, and the desktop app never writes outside that folder." },
  { q: "Is it open source?", a: "The source lives on GitHub, and the installers are produced by the project's own build pipeline for each platform." },
];

const PLATFORMS = [
  { key: "windows" as const, label: "Windows", detail: "Windows 10 and 11 · 64-bit", icon: Monitor },
  { key: "mac" as const, label: "macOS", detail: "macOS 11 and later · Intel & Apple silicon", icon: Apple },
  { key: "linux" as const, label: "Linux", detail: "AppImage and .deb · x86-64", icon: Terminal },
];

export default function Site() {
  const { user } = useAuth();
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    siteApi.config().then(setConfig).catch(() => undefined);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const releaseHref = (key: keyof SiteConfig["releases"]) => config?.releases[key] ?? "#download";

  return (
    <div className="site">
      <header className={`site-nav ${menuOpen ? "open" : ""}`}>
        <div className="site-nav-inner">
          <button className="site-brand" onClick={() => navigate("/")}>
            <span className="site-brand-mark"><Zap size={17} fill="currentColor" /></span>
            <span><strong>smart<span>download</span></strong><small>ACCELERATOR</small></span>
          </button>
          <nav className="site-links">
            <button onClick={() => scrollTo("features")}>Features</button>
            <button onClick={() => scrollTo("download")}>Download</button>
            <button onClick={() => scrollTo("how")}>How it works</button>
            <button onClick={() => scrollTo("faq")}>FAQ</button>
          </nav>
          <div className="site-nav-actions">
            {user ? (
              <>
                <button className="site-ghost" onClick={() => navigate(user.role === "admin" ? "/admin" : "/app")}>
                  {user.role === "admin" ? "Admin" : "Dashboard"}
                </button>
                <button className="site-avatar" onClick={() => navigate("/login")} title={user.email}>
                  {user.avatar ? <img src={user.avatar} alt="" /> : user.name.slice(0, 1).toUpperCase()}
                </button>
              </>
            ) : (
              <button className="site-ghost" onClick={() => navigate("/login")}>Sign in</button>
            )}
            <button className="site-cta" onClick={() => scrollTo("download")}>
              <Download size={15} /> Get the app
            </button>
          </div>
          <button className="site-burger" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-glow" aria-hidden="true"><span /><span /><span /></div>
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="hero-badge"><Sparkles size={13} /> Free desktop app · Windows, macOS, Linux</span>
              <h1>Downloads that use <em>all</em> of your connection.</h1>
              <p>
                Smart Download Accelerator splits files into parallel segments, resumes anything that
                stalls, and keeps every transfer honest — no fake speed claims, no bundled junk.
              </p>
              <div className="hero-actions">
                <button className="site-cta large" onClick={() => scrollTo("download")}>
                  <Download size={17} /> Download for free
                </button>
                <button className="site-ghost large" onClick={() => navigate("/app")}>
                  Open web dashboard <ArrowRight size={15} />
                </button>
              </div>
              <ul className="hero-points">
                <li><Check size={14} /> Up to 16 parallel connections</li>
                <li><Check size={14} /> Resume after any interruption</li>
                <li><Check size={14} /> No account required</li>
              </ul>
            </div>

            <Reveal className="hero-visual" delay={120}>
              <div className="app-window">
                <div className="app-window-bar"><span /><span /><span /><b>smartdownload</b></div>
                <div className="app-window-body">
                  {[
                    { name: "ubuntu-24.04.1-desktop-amd64.iso", pct: 78, speed: "24.5 MB/s" },
                    { name: "nature-documentary-4k.mp4", pct: 52, speed: "12.1 MB/s" },
                    { name: "design-assets-bundle.zip", pct: 34, speed: "8.4 MB/s" },
                  ].map((row, index) => (
                    <div className="app-row" key={row.name} style={{ animationDelay: `${index * 0.35}s` }}>
                      <div className="app-row-top">
                        <span>{row.name}</span>
                        <b>{row.speed}</b>
                      </div>
                      <div className="app-bar"><div style={{ width: `${row.pct}%` }} /></div>
                      <small>{row.pct}% · {index + 4} connections</small>
                    </div>
                  ))}
                  <div className="app-foot"><Zap size={12} /> Adaptive mode · stable</div>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal className="stat-strip" delay={80}>
            {[
              { value: "16", label: "Parallel segments" },
              { value: "3", label: "Platforms supported" },
              { value: "0", label: "Accounts required" },
              { value: "100%", label: "Resumable transfers" },
            ].map((stat) => (
              <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>
            ))}
          </Reveal>
        </section>

        <section className="site-section" id="features">
          <Reveal className="section-head">
            <span className="kicker">WHAT IT DOES</span>
            <h2>Built for people who download a lot.</h2>
            <p>Every part of the engine exists to make a slow or flaky connection behave like a fast one.</p>
          </Reveal>
          <div className="feature-grid">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 60}>
                <article className="feature-card">
                  <span className="feature-icon"><feature.icon size={19} /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="site-section" id="download">
          <Reveal className="section-head">
            <span className="kicker">DOWNLOAD</span>
            <h2>Get the desktop app.</h2>
            <p>
              Installers are produced by the project's own build pipeline.
              {config ? ` Current version ${config.version}.` : ""}
            </p>
          </Reveal>
          <div className="platform-grid">
            {PLATFORMS.map((platform, index) => (
              <Reveal key={platform.key} delay={index * 80}>
                <article className="platform-card">
                  <span className="platform-icon"><platform.icon size={22} /></span>
                  <h3>{platform.label}</h3>
                  <p>{platform.detail}</p>
                  <a className="site-cta" href={releaseHref(platform.key)} target="_blank" rel="noreferrer">
                    <Download size={15} /> Download
                  </a>
                </article>
              </Reveal>
            ))}
          </div>
          <Reveal delay={120}>
            <p className="download-note">
              macOS builds are not yet code-signed, so the first launch shows the usual
              “unidentified developer” prompt. Verify you downloaded from the official source before opening it.
            </p>
          </Reveal>
        </section>

        <section className="site-section" id="how">
          <Reveal className="section-head">
            <span className="kicker">HOW IT WORKS</span>
            <h2>Three steps, then forget about it.</h2>
          </Reveal>
          <div className="step-grid">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 90}>
                <article className="step-card">
                  <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="site-section" id="faq">
          <Reveal className="section-head">
            <span className="kicker">FAQ</span>
            <h2>Questions people actually ask.</h2>
          </Reveal>
          <div className="faq-list">
            {FAQ.map((entry, index) => (
              <Reveal key={entry.q} delay={index * 50}>
                <div className={`faq-item ${openFaq === index ? "open" : ""}`}>
                  <button onClick={() => setOpenFaq(openFaq === index ? null : index)}>
                    <span>{entry.q}</span>
                    <ChevronDown size={17} />
                  </button>
                  <div className="faq-answer"><p>{entry.a}</p></div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="site-section">
          <Reveal>
            <div className="closing-cta">
              <div>
                <h2>Stop watching a progress bar crawl.</h2>
                <p>Install the accelerator and let your connection do what it was paid for.</p>
              </div>
              <button className="site-cta large" onClick={() => scrollTo("download")}>
                <Download size={17} /> Download the app
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="site-brand-mark"><Zap size={16} fill="currentColor" /></span>
            <div><strong>smart<span>download</span></strong><small>ACCELERATOR</small></div>
          </div>
          <div className="footer-links">
            <button onClick={() => scrollTo("features")}>Features</button>
            <button onClick={() => scrollTo("download")}>Download</button>
            <button onClick={() => scrollTo("faq")}>FAQ</button>
            <button onClick={() => navigate("/app")}>Web dashboard</button>
            <button onClick={() => navigate("/login")}>Sign in</button>
          </div>
          <a className="footer-social" href="https://github.com/ntseth993/extract-mbs" target="_blank" rel="noreferrer">
            <Github size={16} /> Source
          </a>
        </div>
        <p className="footer-note">
          Acceleration optimizes how your connection downloads. It does not create free mobile data or shrink an
          uncompressed file. Only download content you have the right to download.
        </p>
      </footer>
    </div>
  );
}
