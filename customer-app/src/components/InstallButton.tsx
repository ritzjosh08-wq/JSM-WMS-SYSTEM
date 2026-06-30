import { usePWAStore } from '../store/pwaStore';
import { C, IconInstall } from '../ui';

// Shows an "Install app" button when the browser offers installation.
export default function InstallButton({ variant = 'chip' }: { variant?: 'primary' | 'chip' }) {
  const canInstall = usePWAStore(s => s.canInstall);
  const promptInstall = usePWAStore(s => s.promptInstall);
  if (!canInstall) return null;

  if (variant === 'primary') {
    return (
      <button onClick={promptInstall} className="btn" style={{ width: '100%', marginTop: 12, justifyContent: 'center', background: '#fff', color: C.blue, border: `1.5px solid ${C.blue}` }}>
        <IconInstall size={16} /> Install app on this device
      </button>
    );
  }
  return (
    <button onClick={promptInstall} className="btn btn-primary" title="Install this app" style={{ padding: '8px 12px' }}>
      <IconInstall size={15} /> <span className="hide-mobile">Install</span>
    </button>
  );
}
