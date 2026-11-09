import { List, ListItem } from '@mantine/core';
import { NumberSeriesList } from '@dax/platform-contract';
import { canDo, Mono, PageHead, SectionCard } from '@dax/web-shell';
import { api, requirePermission } from '../../../lib/server';
import { SeriesTable } from './series-table';

export default async function NumberingPage() {
  const caps = await requirePermission('core.numbering.view');
  const { series } = await api.request('/admin/numbering', (d) =>
    NumberSeriesList.parse(d),
  );
  return (
    <>
      <PageHead
        eyebrow="Admin · Settings"
        title="Document numbering"
        lede="Each document type has its own number series. Changes apply to the next number issued. Numbers already used never change."
      />
      <SectionCard title="Pattern parts" note="A pattern can use:">
        <List size="sm" spacing={2}>
          <ListItem>
            <Mono>{'{DOC}'}</Mono> document type
          </ListItem>
          <ListItem>
            <Mono>{'{SUB}'}</Mono> document subtype
          </ListItem>
          <ListItem>
            <Mono>{'{FY}'}</Mono> financial year
          </ListItem>
          <ListItem>
            <Mono>{'{SEQ}'}</Mono> running number, padded with zeros (required)
          </ListItem>
        </List>
      </SectionCard>
      <SeriesTable
        series={series}
        canManage={canDo(caps, 'core.numbering.manage')}
      />
    </>
  );
}
