import { AuthCard, ResetPasswordForm } from '@dax/web-shell';
import { PRODUCT } from '../../../lib/server';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard product={PRODUCT} title="Choose a password">
      <ResetPasswordForm token={token ?? null} />
    </AuthCard>
  );
}
