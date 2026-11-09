'use client';

import {
  Button,
  Checkbox,
  Group,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useActionState } from 'react';
import { StateAlert } from '../../../../components/state-alert';
import { fieldError, IDLE } from '../../../../lib/action-state';
import { saveParty } from './actions';
import { CONTACT_FIELDS, type PartyDto, type PartyKind } from './config';

function has(party: PartyDto | undefined, key: string): boolean {
  return !party || key in party;
}

function value(party: PartyDto | undefined, key: string): string {
  const v = party ? (party as Record<string, unknown>)[key] : undefined;
  return typeof v === 'string' ? v : '';
}

export function PartyForm({
  kind,
  party,
}: {
  kind: PartyKind;
  party?: PartyDto;
}) {
  const [state, action, pending] = useActionState(saveParty, IDLE);
  const err = (key: string) => fieldError(state, key);

  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />
      {party ? (
        <>
          <input type="hidden" name="id" value={party.id} />
          <input type="hidden" name="version" value={party.version} />
        </>
      ) : null}
      <Stack>
        <StateAlert state={state} />
        <TextInput
          name="name"
          label="Name"
          required
          maxLength={150}
          defaultValue={party?.name ?? ''}
          error={err('name')}
          size="md"
        />
        {kind === 'supplier' ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {has(party, 'country') ? (
              <TextInput
                name="country"
                label="Country"
                maxLength={60}
                defaultValue={value(party, 'country')}
                error={err('country')}
                size="md"
              />
            ) : null}
            <div>
              <input type="hidden" name="isForeignShown" value="1" />
              <Checkbox
                name="isForeign"
                label="Foreign supplier (imports)"
                defaultChecked={party?.isForeign ?? false}
                mt={{ base: 0, sm: 34 }}
                size="md"
              />
            </div>
          </SimpleGrid>
        ) : null}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {CONTACT_FIELDS.filter((f) => !f.multiline && has(party, f.key)).map(
            (f) => (
              <TextInput
                key={f.key}
                name={f.key}
                label={f.label}
                type={
                  f.key === 'email'
                    ? 'email'
                    : f.key === 'phone'
                      ? 'tel'
                      : 'text'
                }
                defaultValue={value(party, f.key)}
                error={err(f.key)}
                size="md"
              />
            ),
          )}
        </SimpleGrid>
        {CONTACT_FIELDS.filter((f) => f.multiline && has(party, f.key)).map(
          (f) => (
            <Textarea
              key={f.key}
              name={f.key}
              label={f.label}
              autosize
              minRows={2}
              defaultValue={value(party, f.key)}
              error={err(f.key)}
              size="md"
            />
          ),
        )}
        <Group>
          <Button type="submit" loading={pending} size="md">
            {party ? 'Save changes' : 'Add'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
