'use client';

import { Button } from '@mantine/core';
import { Icon } from '@dax/web-shell';

export function ExportButton({ href }: { href: string }) {
  return (
    <Button
      component="a"
      href={href}
      download
      variant="default"
      leftSection={<Icon name="download" size={18} />}
      className="dax-no-print"
    >
      Export CSV
    </Button>
  );
}

export function PrintButton() {
  return (
    <Button
      variant="default"
      leftSection={<Icon name="printer" size={18} />}
      onClick={() => window.print()}
      className="dax-no-print"
    >
      Print
    </Button>
  );
}
