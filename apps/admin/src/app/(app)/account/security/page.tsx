import { Text } from '@mantine/core';
import {
  ChangePasswordForm,
  PageHead,
  Pill,
  SectionCard,
} from '@dax/web-shell';
import { requireReadyUser } from '../../../../lib/server';

export default async function SecurityPage() {
  const me = await requireReadyUser();
  const on = me.user.twoFactorEnabled;
  return (
    <>
      <PageHead
        eyebrow="Account"
        title="My security"
        lede="Your password and two-step sign-in."
        back={{ href: '/', label: 'Home' }}
      />
      <div className="dax-stack" style={{ maxWidth: 560 }}>
        <SectionCard title="Change password">
          <ChangePasswordForm afterPath="/account/security" />
        </SectionCard>
        <SectionCard
          title="Two-step sign-in"
          actions={
            <Pill tone={on ? 'ok' : undefined}>{on ? 'On' : 'Off'}</Pill>
          }
        >
          <Text size="sm">
            {on
              ? 'You enter a code from your authenticator app each time you sign in.'
              : 'Your roles do not require a code from an authenticator app.'}
          </Text>
        </SectionCard>
      </div>
    </>
  );
}
