import { useEffect, useState } from 'react';

// Shows the LAN URL(s) to type into a phone when the app is opened on localhost,
// so GPS/geofence attendance can be tested from an actual mobile device (HTTPS).
// The IP list comes from the Vite dev server's /__lan-info endpoint, so the
// URL is always correct even when the router re-assigns the machine's IP.
export default function LanInfoBanner() {
  const [urls, setUrls] = useState([]);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('lan_banner_dismissed') === '1');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const host = window.location.hostname || '';
    // Only desktop/localhost viewers need to know the phone URL; phones already have it.
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!loopback) return;

    (async () => {
      try {
        const res = await fetch('/__lan-info', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !Array.isArray(data.ips) || !data.ips.length) return;
        setUrls(data.ips.map(ip => `https://${ip}:${data.port}/`));
      } catch { /* endpoint missing (e.g. production build) — just hide the banner */ }
    })();
    return () => { active = false; };
  }, []);

  if (dismissed || urls.length === 0) return null;

  const dismiss = () => {
    sessionStorage.setItem('lan_banner_dismissed', '1');
    setDismissed(true);
  };

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — user can still read/type the URL */ }
  };

  return (
    <div className="lan-info-banner">
      <div className="lan-info-top">
        <span className="lan-info-title">📱 Phone Access</span>
        <button className="lan-info-close" onClick={dismiss} title="Hide">×</button>
      </div>
      {urls.map(u => (
        <button key={u} className="lan-info-url" title="Tap to copy" onClick={() => copy(u)}>
          {copied ? '✓ Copied!' : u}
        </button>
      ))}
      <span className="lan-info-hint">Open on your phone (same WiFi) to use GPS attendance</span>
    </div>
  );
}