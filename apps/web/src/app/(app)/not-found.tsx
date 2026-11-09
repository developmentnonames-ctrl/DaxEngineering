import { Empty, PageHead } from '@dax/web-shell';
import { LinkButton } from '../../components/links';

export default function NotFound() {
  return (
    <>
      <PageHead eyebrow="Not found" title="Nothing here" />
      <Empty title="This record doesn't exist, or you don't have access to it." />
      <div>
        <LinkButton href="/" variant="default">
          Go home
        </LinkButton>
      </div>
    </>
  );
}
