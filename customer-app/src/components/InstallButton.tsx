import { usePWAStore } from '../store/pwaStore';
import { C } from '../ui';

// Shows an "Install app" button when the browser offers installation.
// `variant="primary"` is the large button used on the login screen;
// `variant="chip"` is the compact pill used in the header.
export default function InstallButton({ variant = 'chip' }: { variant?: 'primary' | 'chip' }) {
  const canInstall = usePWAStore(s => s.canInstall);
  const promptInstall = usePWAStore(s => s.promptInstall);

  if (!canInstall) return null;

  if (variant === 'primary') {
    return (
      <button
        onClick={promptInstall}
        style={{
          width: '100%', padding: 12, marginTop: 12,
          background: '#fff', color: C.blue, border: `1.5px solid ${C.blue}`,
          borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <span aria-hidden>⬇</span> Install app on this device
      </button>
    );
  }

  return (
    <button
      onClick={promptInstall}
      title="Install this app"
      style={{
        background: C.blue, color: '#fff', border: 'none',
        borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      ⬇ Install
    </button>
  );
}
