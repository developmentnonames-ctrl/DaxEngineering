'use client';

import type { Capabilities } from '@dax/platform-contract';
import { createContext, type ReactNode, useContext } from 'react';
import { canDo, canReadField, canWriteField } from './capability-rules';

type Scope = Capabilities['permissions'][string];

const CapabilityContext = createContext<Capabilities | null>(null);

export function CapabilityProvider({
  value,
  children,
}: {
  value: Capabilities;
  children: ReactNode;
}) {
  return (
    <CapabilityContext.Provider value={value}>
      {children}
    </CapabilityContext.Provider>
  );
}

export function useCapabilities(): Capabilities {
  const caps = useContext(CapabilityContext);
  if (!caps) throw new Error('useCapabilities needs a CapabilityProvider');
  return caps;
}

export function useCan(permission: string, atLeast?: Scope): boolean {
  return canDo(useCapabilities(), permission, atLeast);
}

export function useCanRead(entity: string, field: string): boolean {
  return canReadField(useCapabilities(), entity, field);
}

export function useCanWrite(entity: string, field: string): boolean {
  return canWriteField(useCapabilities(), entity, field);
}

export function Can({
  permission,
  atLeast,
  fallback = null,
  children,
}: {
  permission: string;
  atLeast?: Scope;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return useCan(permission, atLeast) ? children : fallback;
}
