import { redirect } from 'next/navigation';
import { AuthCard, LoginForm } from '@dax/web-shell';
import { api, PRODUCT, safePath } from '../../../lib/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await api.getMe()) redirect(safePath(next) ?? '/');
  return (
    <AuthCard product={PRODUCT} title="Sign in">
      <LoginForm next={next} />
    </AuthCard>
  );
}
