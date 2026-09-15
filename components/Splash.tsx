import Logo from './Logo';

/**
 * Brand splash shown while the Zoho queries run: on first load through
 * app/loading.tsx, and as an overlay while switching week.
 */
export default function Splash({ overlay = false }: { overlay?: boolean }) {
  return (
    <div className={overlay ? 'splash is-overlay' : 'splash'} role="status" aria-live="polite">
      <Logo className="splash-logo" height={56} />
      <p className="splash-text">
        Loading data
        <span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
        please wait
        <span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
      </p>
    </div>
  );
}
