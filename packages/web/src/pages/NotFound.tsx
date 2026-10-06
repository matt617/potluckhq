import { Link } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { useSession } from '../lib/session';
import { buttonVariants } from '@/components/ui/button';

export function NotFound() {
  const { signedIn } = useSession();
  return (
    <main
      className="mx-[auto] mt-[14vh] mb-0 flex max-w-[600px] flex-col items-start gap-4 px-[var(--gutter)] py-0 [&_h1]:text-[clamp(2.4rem,_6vw,_3.8rem)]"
      id="main"
    >
      <p className="font-serif text-[1.4rem] text-accent-foreground italic">404</p>
      <h1>This page isn't on the menu.</h1>
      <p className="text-muted-foreground">The link may be old, or the recipe was removed from your community.</p>
      <Link className={buttonVariants({ variant: 'default' })} to={signedIn ? '/book' : '/'}>
        <ArrowLeft size={16} weight="bold" aria-hidden />
        {signedIn ? 'Back to your recipes' : 'Back to Potluck'}
      </Link>
    </main>
  );
}
