import { createAuthProxy } from '@dax/web-data-access/server';
import { APP } from '../../../../lib/server';

export const dynamic = 'force-dynamic';
export const POST = createAuthProxy(APP);
