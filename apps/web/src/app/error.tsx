'use client';

import { Button } from '@mantine/core';
import { AuthCard } from '@dax/web-shell';

export default function RootError({ reset }: { reset: () => void }) {
  return (
    <AuthCard
      product="DAX"
      title="Can't load this page"
      description="The server may still be starting up, or the connection dropped. Wait a moment and try again."
    >
      <Button fullWidth onClick={reset}>
        Try again
      </Button>
    </AuthCard>
  );
}
