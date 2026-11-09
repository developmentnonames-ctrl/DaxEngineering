'use client';

import { Switch } from '@mantine/core';
import { startTransition, useActionState } from 'react';
import { Pill } from '@dax/web-shell';
import { StateAlert } from '../../../components/state-alert';
import { IDLE } from '../../../lib/action-state';
import { toggleModule } from './actions';

export function ModuleCard({
  moduleKey,
  name,
  description,
  enabled,
  toggleable,
  locked,
  dependsOn,
  requiredBy,
}: {
  moduleKey: string;
  name: string;
  description: string | null;
  enabled: boolean;
  toggleable: boolean;
  locked: boolean;
  dependsOn: string[];
  requiredBy: string[];
}) {
  const [state, dispatch, pending] = useActionState(toggleModule, IDLE);
  return (
    <section className="dax-card dax-module">
      <div className="dax-module-top">
        <h2>{name}</h2>
        <Switch
          aria-label={`${name} on or off`}
          checked={enabled}
          disabled={!toggleable || pending}
          onChange={(e) => {
            const next = e.currentTarget.checked;
            startTransition(() =>
              dispatch({ key: moduleKey, input: { enabled: next } }),
            );
          }}
        />
      </div>
      {description ? <p className="dax-module-text">{description}</p> : null}
      <div className="dax-module-foot">
        {locked ? (
          <Pill tone="int">Always on</Pill>
        ) : (
          <Pill tone={enabled ? 'ok' : undefined}>
            {enabled ? 'On' : 'Off'}
          </Pill>
        )}
        {dependsOn.length ? <Pill>Needs {dependsOn.join(', ')}</Pill> : null}
        {requiredBy.length ? (
          <Pill>Needed by {requiredBy.join(', ')}</Pill>
        ) : null}
      </div>
      <StateAlert state={state} />
    </section>
  );
}
