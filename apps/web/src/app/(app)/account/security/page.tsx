import {
  ChangePasswordForm,
  PageHead,
  Pill,
  SectionCard,
  TwoFactorSetup,
} from '@dax/web-shell';
import { requireReadyUser } from '../../../../lib/server';

export default async function SecurityPage() {
  const me = await requireReadyUser();
  return (
    <>
      <PageHead
        back={{ href: '/', label: 'Home' }}
        eyebrow="Your account"
        title="Password and two-step sign-in"
      />
      <div className="dax-grid2">
        <SectionCard title="Change password">
          <ChangePasswordForm afterPath="/account/security" />
        </SectionCard>
        <SectionCard
          title="Two-step sign-in"
          actions={
            me.user.twoFactorEnabled ? (
              <Pill tone="ok">On</Pill>
            ) : (
              <Pill>Off</Pill>
            )
          }
        >
          {me.user.twoFactorEnabled ? (
            <p style={{ margin: 0 }}>
              You enter a code from your authenticator app at every sign-in.
            </p>
          ) : (
            <TwoFactorSetup afterPath="/account/security" />
          )}
        </SectionCard>
      </div>
    </>
  );
}
