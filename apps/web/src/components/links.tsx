'use client';

import {
  Anchor,
  type AnchorProps,
  Button,
  type ButtonProps,
} from '@mantine/core';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function AppLink({
  href,
  children,
  ...props
}: AnchorProps & { href: string; children: ReactNode }) {
  return (
    <Anchor component={Link} href={href} {...props}>
      {children}
    </Anchor>
  );
}

export function LinkButton({
  href,
  children,
  ...props
}: ButtonProps & { href: string; children: ReactNode }) {
  return (
    <Button component={Link} href={href} {...props}>
      {children}
    </Button>
  );
}
