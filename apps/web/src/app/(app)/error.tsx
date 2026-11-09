'use client';

import { Button, Group } from '@mantine/core';
import { Empty, PageHead } from '@dax/web-shell';

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHead eyebrow="Error" title="Something went wrong" />
      <Empty title="This page could not be loaded.">
        Check your connection and try again. If it keeps happening, tell your
        manager or the system administrator.
      </Empty>
      <Group>
        <Button onClick={reset}>Try again</Button>
        <Button component="a" href="/" variant="default">
          Go home
        </Button>
      </Group>
    </>
  );
}
