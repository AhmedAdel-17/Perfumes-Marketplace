import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AUDIT_ACTIONS, type AuditAction } from '@diyar/domain';
import { OpsNav } from '@/features/ops/OpsNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { AuditLog } from '@/features/ops/AuditLog';
import { fetchAuditPage } from '@/features/ops/audit-actions';
import { activeOperator } from '@/features/ops/actions';

export const metadata: Metadata = {
  title: 'سجل القرارات | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who decided what — doc 04 §8 gate 6, the half that says "without database
 * work".
 *
 * The query string is read defensively. It is a URL an operator can edit and
 * paste, so an unknown action or a malformed cursor is IGNORED rather than
 * passed on: the router would refuse it, and a refused query here is a crashed
 * page on a screen whose whole job is to be there when something went wrong.
 */
export default async function OpsAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await activeOperator();
  if (!session) redirect('/ops');

  const params = await searchParams;
  const rawAction = typeof params.action === 'string' ? params.action : undefined;
  const rawBefore = typeof params.before === 'string' ? params.before : undefined;

  const action = (AUDIT_ACTIONS as readonly string[]).includes(rawAction ?? '')
    ? rawAction as AuditAction
    : undefined;
  const before = rawBefore && UUID.test(rawBefore) ? rawBefore : undefined;

  const page = await fetchAuditPage({
    ...(action === undefined ? {} : { action }),
    ...(before === undefined ? {} : { before }),
  });

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <ConsoleHead
        kicker="Operations"
        title="سجل القرارات"
        nav={<OpsNav current="audit" />}
        intro="كل قرار يمسّ مال دار أو ظهورها يُكتب هنا في اللحظة نفسها، باسم من اتخذه. لا يُعدَّل هذا السجل ولا يُحذف منه شيء."
      />

      <AuditLog
        entries={page?.entries ?? []}
        nextBefore={page?.nextBefore ?? null}
        action={action}
        paged={before !== undefined}
      />
    </main>
  );
}
