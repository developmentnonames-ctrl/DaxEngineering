import { redirect } from 'next/navigation';
import { AuthCard, ChangePasswordForm, TwoFactorSetup } from '@dax/web-shell';
import { PRODUCT, requireUser } from '../../../../lib/server';

export default async function AccountSetupPage() {
  const me = await requireUser();
  if (me.pending === 'change_password') {
    return (
      <AuthCard
        product={PRODUCT}
        title="Choose a new password"
        description="Your password was set by someone else. Replace it with one only you know."
      >
        <ChangePasswordForm afterPath="/account/setup" />
      </AuthCard>
    );
  }
  if (me.pending === 'setup_2fa') {
    return (
      <AuthCard
        product={PRODUCT}
        title="Turn on two-step sign-in"
        description="Administrator accounts need a code from your phone at every sign-in."
      >
        <TwoFactorSetup afterPath="/" />
      </AuthCard>
    );
  }
  redirect('/');
}
