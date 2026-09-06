import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { BackButton } from '@/presentation/ui/BackButton';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { ThemeSwitchButton } from '@/presentation/ui/ThemeSwitchButton';
import { EncryptionInfoModal } from '@/presentation/components/EncryptionInfoModal';
import { routes } from '@/presentation/lib/routes';
import { type AppHeaderOverride, resolveAppHeaderMeta } from './app-header-meta';

/**
 * Where the escape hatch is needed. The shell knows which navs it renders at
 * which width, so it decides; the header only draws it.
 */
export type AppHeaderBack = 'always' | 'below-md' | 'from-md';

const BACK_CLASS: Record<AppHeaderBack, string> = {
  always: '',
  'below-md': 'md:hidden',
  'from-md': 'hidden md:flex',
};

/**
 * The Sidebar carries the Zelo mark from md up, but below it a screen with no
 * back control (Home, Você, Configurações...) has nothing identifying the app
 * in its own header. Shown only where the mobile header would otherwise have
 * no back button to compete with it.
 */
function AppHeaderLogo() {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <Link
      to={routes.home}
      aria-label="Zelo"
      className="flex min-h-11 min-w-11 flex-none items-center justify-center rounded-icon md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-icon bg-brand-fill">
        {logoFailed ? (
          <span aria-hidden="true" className="font-serif text-logo-mark leading-none text-on-fill">
            Z
          </span>
        ) : (
          <picture>
            <source srcSet={`${import.meta.env.BASE_URL}zelo_logo.webp`} type="image/webp" />
            <img
              src={`${import.meta.env.BASE_URL}zelo_logo.png`}
              alt="Zelo Logo"
              width={36}
              height={36}
              onError={() => setLogoFailed(true)}
              className="h-full w-full object-contain"
            />
          </picture>
        )}
      </span>
    </Link>
  );
}

interface AppHeaderProps {
  override?: AppHeaderOverride;
  column?: string;
  className?: string;
  back?: AppHeaderBack;
  // Where the back button goes. Defaults to the médico's own home, which is
  // wrong for a chrome shown to someone who isn't a médico — a peer partner
  // has no access to that route at all.
  backTo?: string;
  // The anonymity badge is a promise to the médico. A manager is authenticated
  // by name and role, so showing it on the panel is untrue for that session and
  // dilutes the badge for the audience it was built for.
  chrome?: 'doctor' | 'manager';
}

export function AppHeader({
  override,
  column = '',
  className = '',
  back,
  backTo = routes.home,
  chrome = 'doctor',
}: AppHeaderProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isEncryptionInfoOpen, setIsEncryptionInfoOpen] = useState(false);

  const meta = resolveAppHeaderMeta(pathname);
  const title = override?.title ?? meta?.title;

  if (!title) {
    return null;
  }

  const subtitle = override?.subtitle ?? meta?.subtitle;
  // A back button that shows on mobile (always, or below-md) already fills
  // this slot there; anywhere else the mobile header has room for the mark.
  const showMobileLogo = back !== 'always' && back !== 'below-md';

  return (
    <div
      data-testid="app-header"
      className={`flex flex-none border-b border-surface-brand bg-surface px-4 md:min-h-app-header ${className}`}
    >
      <div
        data-testid="app-header-row"
        className={`flex w-full items-center gap-2 py-3.5 short:py-2 md:py-2.5 ${column}`}
      >
        {back && (
          <BackButton className={BACK_CLASS[back]} onClick={() => navigate(backTo)} />
        )}
        {showMobileLogo && <AppHeaderLogo />}
        <div className="min-w-0">
          <h1 className="font-sans text-body-strong text-ink">{title}</h1>
          {/* Rendered only when there is something to say: an empty paragraph
              still occupies its line box and pushes the title off optical
              centre on every route without a subtitle. */}
          {subtitle && (
            <p
              data-testid="app-header-subtitle"
              className="min-w-0 text-pretty text-caption text-brand line-clamp-2"
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-none items-center">
          <ThemeSwitchButton />
          {chrome === 'doctor' && <PrivacyBadge onClick={() => setIsEncryptionInfoOpen(true)} />}
        </div>
      </div>
      <EncryptionInfoModal
        isOpen={isEncryptionInfoOpen}
        onClose={() => setIsEncryptionInfoOpen(false)}
      />
    </div>
  );
}
