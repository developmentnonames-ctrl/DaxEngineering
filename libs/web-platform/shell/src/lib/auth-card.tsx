'use client';

import { Container, Paper, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

export function AuthCard({
  product,
  title,
  description,
  children,
}: {
  product: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Container size={420} py={64}>
      <Stack gap="xs" mb="lg" align="center">
        <Text fw={700} c="dimmed" tt="uppercase" size="sm">
          {product}
        </Text>
        <Title order={2} ta="center">
          {title}
        </Title>
        {description ? (
          <Text c="dimmed" size="sm" ta="center">
            {description}
          </Text>
        ) : null}
      </Stack>
      <Paper withBorder shadow="sm" p="lg">
        {children}
      </Paper>
    </Container>
  );
}
