import { Code, List, ListItem, Paper, Text, Title } from '@mantine/core';
import { NumberSeriesList } from '@dax/platform-contract';
import { canDo } from '@dax/web-shell';
import { api, requirePermission } from '../../../lib/server';
import { SeriesTable } from './series-table';

export default async function NumberingPage() {
  const caps = await requirePermission('core.numbering.view');
  const { series } = await api.request('/admin/numbering', (d) =>
    NumberSeriesList.parse(d),
  );
  return (
    <>
      <Title order={2}>Document numbering</Title>
      <Paper withBorder p="md">
        <Text size="sm" mb="xs">
          Each document type has its own number series. A pattern can use:
        </Text>
        <List size="sm" spacing={2}>
          <ListItem>
            <Code>{'{DOC}'}</Code> document type
          </ListItem>
          <ListItem>
            <Code>{'{SUB}'}</Code> document subtype
          </ListItem>
          <ListItem>
            <Code>{'{FY}'}</Code> financial year
          </ListItem>
          <ListItem>
            <Code>{'{SEQ}'}</Code> running number, padded with zeros (required)
          </ListItem>
        </List>
        <Text size="xs" c="dimmed" mt="xs">
          Changes apply to the next number issued. Numbers already used never
          change.
        </Text>
      </Paper>
      <SeriesTable
        series={series}
        canManage={canDo(caps, 'core.numbering.manage')}
      />
    </>
  );
}
