import { redirect } from 'next/navigation';
import { AuthCard, LoginForm } from '@dax/web-shell';
import { api, PRODUCT } from '../../../lib/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await api.getMe()) redirect('/');
  const { next } = await searchParams;
  return (
    <AuthCard product={PRODUCT} title="Sign in">
      <LoginForm next={next} />
    </AuthCard>
  );
}
