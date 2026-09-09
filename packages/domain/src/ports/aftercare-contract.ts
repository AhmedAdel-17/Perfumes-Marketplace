/**
 * Support and application repository contracts.
 *
 * WHY THIS FILE EXISTS. Both ports had two implementations and no contract, so
 * the in-memory adapters were never compared with the Drizzle ones — they were
 * code that satisfied a type and nothing more. Every other port in this
 * directory is held to "if a rule holds in both, the rule is in the contract",
 * and two ports quietly opting out of that is how the claim stops being true of
 * any of them.
 *
 * The cases are the ones where the two could plausibly disagree: an order link
 * that is RESOLVED rather than trusted, a first-response stamp written once,
 * and a checklist counted from rows that exist.
 */
import type { UnitOfWork } from './repositories';
import { VERIFICATION_CONTROLS } from './application-repository';
import { priorityFor } from '../trust/support';

export interface AftercareContractWorld {
  readonly uow: UnitOfWork;
  /**
   * An order that exists, with the phone it was placed on.
   *
   * The support contract needs one to prove that quoting somebody else's order
   * reference does not attach a ticket to it.
   */
  readonly order: { readonly reference: string; readonly phone: string };
  /** A platform staff id a decision can be attributed to. */
  readonly staffId: string;
}

export type AftercareHarness = () => Promise<AftercareContractWorld>;

export interface AftercareContractCase {
  readonly name: string;
  run(setup: AftercareHarness): Promise<void>;
}

class ContractViolation extends Error {}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new ContractViolation(message);
};

const equal = <T>(actual: T, expected: T, what: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${what}: expected ${e}, received ${a}`);
};

const NOW = new Date('2026-09-09T10:00:00.000Z');
const LATER = new Date('2026-09-09T14:00:00.000Z');

let counter = 0;
const uniqueReference = () => `DS-CONTRACT${(counter += 1)}`;

export const supportContract: readonly AftercareContractCase[] = [
  {
    name: 'a ticket is opened and read back with its reference AND phone',
    async run(setup) {
      const { uow } = await setup();
      const reference = uniqueReference();

      const opened = await uow.transaction((r) => r.support.open({
        reference,
        category: 'product_question',
        subject: 'هل تشحنون لأسوان؟',
        message: 'أفكّر في الطلب.',
        contactName: 'سلمى',
        contactPhone: '01099990001',
        priority: priorityFor('product_question'),
        orderReference: null,
        now: NOW,
      }));

      equal(opened.reference, reference, 'the reference');
      equal(opened.status, 'open', 'a new ticket');
      equal(opened.firstResponseAt, null, 'nobody has answered yet');

      const found = await uow.transaction((r) => r.support.find({
        reference, phone: '01099990001',
      }));
      assert(found !== null, 'a ticket must be findable by its own two factors');
      equal(found!.subject, 'هل تشحنون لأسوان؟', 'the subject');
      equal(found!.message, 'أفكّر في الطلب.', 'the message');
    },
  },

  {
    name: 'a WRONG PHONE finds nothing, exactly as an unknown reference does',
    async run(setup) {
      const { uow } = await setup();
      const reference = uniqueReference();
      await uow.transaction((r) => r.support.open({
        reference,
        category: 'other',
        subject: 'سؤال',
        message: 'نص.',
        contactName: 'نادر',
        contactPhone: '01099990002',
        priority: priorityFor('other'),
        orderReference: null,
        now: NOW,
      }));

      equal(await uow.transaction((r) => r.support.find({
        reference, phone: '01099998888',
      })), null, 'a ticket read with the wrong phone');

      equal(await uow.transaction((r) => r.support.find({
        reference: 'DS-NOTHING', phone: '01099990002',
      })), null, 'a ticket read with an unknown reference');
    },
  },

  {
    name: 'the order link is RESOLVED against the caller’s own phone',
    async run(setup) {
      const { uow, order } = await setup();

      const mine = uniqueReference();
      await uow.transaction((r) => r.support.open({
        reference: mine,
        category: 'order_status',
        subject: 'أين طلبي؟',
        message: 'مرّ أسبوع.',
        contactName: 'صاحب الطلب',
        contactPhone: order.phone,
        priority: priorityFor('order_status'),
        orderReference: order.reference,
        now: NOW,
      }));

      const theirs = uniqueReference();
      await uow.transaction((r) => r.support.open({
        reference: theirs,
        category: 'order_status',
        subject: 'سؤال',
        message: 'أريد معرفة حالة الطلب.',
        contactName: 'شخص آخر',
        contactPhone: '01099997777',
        // The SAME reference, quoted by somebody who did not place it.
        orderReference: order.reference,
        priority: priorityFor('order_status'),
        now: NOW,
      }));

      const owner = await uow.transaction((r) => r.support.find({
        reference: mine, phone: order.phone,
      }));
      equal(owner!.orderReference, order.reference, 'the buyer’s own ticket');

      /*
       * A reference typed into a public form is a claim about somebody else's
       * order until it is checked. It links to NOTHING — and the ticket is
       * still opened, because a customer mistyping their own order number
       * should still reach a human.
       */
      const stranger = await uow.transaction((r) => r.support.find({
        reference: theirs, phone: '01099997777',
      }));
      assert(stranger !== null, 'a mistyped order number must still open a ticket');
      equal(stranger!.orderReference, null, 'a stranger’s ticket must link to no order');
    },
  },

  {
    name: 'the open queue is ordered by PRIORITY, then by age',
    async run(setup) {
      const { uow } = await setup();

      // The low-priority one arrives FIRST, so arrival order and the right
      // order disagree — which is the only arrangement that tests anything.
      const quiet = uniqueReference();
      await uow.transaction((r) => r.support.open({
        reference: quiet,
        category: 'product_question',
        subject: 'سؤال هادئ',
        message: 'نص.',
        contactName: 'أ',
        contactPhone: '01099990003',
        priority: priorityFor('product_question'),
        orderReference: null,
        now: NOW,
      }));

      const urgent = uniqueReference();
      await uow.transaction((r) => r.support.open({
        reference: urgent,
        category: 'damaged_or_wrong',
        subject: 'وصلت مكسورة',
        message: 'نص.',
        contactName: 'ب',
        contactPhone: '01099990004',
        priority: priorityFor('damaged_or_wrong'),
        orderReference: null,
        now: LATER,
      }));

      const queue = await uow.transaction((r) => r.support.listOpen({ limit: 50 }));
      const urgentAt = queue.findIndex((t) => t.reference === urgent);
      const quietAt = queue.findIndex((t) => t.reference === quiet);

      assert(urgentAt >= 0 && quietAt >= 0, 'both tickets must be in the open queue');
      // Sorted by arrival, this morning's broken bottle sits behind twelve
      // questions from last week.
      assert(urgentAt < quietAt, 'a broken bottle must come before a question');
    },
  },

  {
    name: 'the FIRST RESPONSE is stamped once and never moves',
    async run(setup) {
      const { uow, staffId } = await setup();
      const reference = uniqueReference();
      const opened = await uow.transaction((r) => r.support.open({
        reference,
        category: 'payment',
        subject: 'الدفع',
        message: 'نص.',
        contactName: 'كريم',
        contactPhone: '01099990005',
        priority: priorityFor('payment'),
        orderReference: null,
        now: NOW,
      }));

      await uow.transaction((r) => r.support.update({
        id: opened.id, status: 'waiting', nextAction: 'أول ردّ', ownerId: staffId, now: NOW,
      }));
      const first = (await uow.transaction((r) => r.support.find({
        reference, phone: '01099990005',
      })))!.firstResponseAt;
      assert(first !== null, 'answering must stamp a first response');

      await uow.transaction((r) => r.support.update({
        id: opened.id, status: 'resolved', nextAction: 'ردّ ثانٍ', ownerId: staffId, now: LATER,
      }));
      const second = (await uow.transaction((r) => r.support.find({
        reference, phone: '01099990005',
      })))!;

      /*
       * The number that says how long somebody waited to hear from a human. A
       * field overwritten on every update measures the LAST touch instead,
       * which is a metric that always looks excellent.
       */
      equal(second.firstResponseAt?.getTime(), first?.getTime(), 'the first response');
      equal(second.nextAction, 'ردّ ثانٍ', 'what the customer now reads');
      equal(second.status, 'resolved', 'the status');
    },
  },

  {
    name: 'a resolved ticket leaves the open queue but not the record',
    async run(setup) {
      const { uow, staffId } = await setup();
      const reference = uniqueReference();
      const opened = await uow.transaction((r) => r.support.open({
        reference,
        category: 'other',
        subject: 'انتهى',
        message: 'نص.',
        contactName: 'ج',
        contactPhone: '01099990006',
        priority: priorityFor('other'),
        orderReference: null,
        now: NOW,
      }));

      await uow.transaction((r) => r.support.update({
        id: opened.id, status: 'closed', nextAction: null, ownerId: staffId, now: LATER,
      }));

      const open = await uow.transaction((r) => r.support.listOpen({ limit: 100 }));
      equal(open.some((t) => t.reference === reference), false, 'a closed ticket in the open queue');

      const all = await uow.transaction((r) => r.support.listAll({ limit: 100 }));
      equal(all.some((t) => t.reference === reference), true, 'a closed ticket in the record');
    },
  },

  {
    name: 'updating something that does not exist changes nothing',
    async run(setup) {
      const { uow, staffId } = await setup();
      equal(await uow.transaction((r) => r.support.update({
        id: '00000000-0000-4000-8000-000000000000',
        status: 'resolved', nextAction: null, ownerId: staffId, now: NOW,
      })), false, 'updating a ticket that does not exist');
    },
  },
];

export const applicationContract: readonly AftercareContractCase[] = [
  {
    name: 'an application is recorded, with the eight controls pending',
    async run(setup) {
      const { uow } = await setup();

      const created = await uow.transaction((r) => r.applications.apply({
        tradingName: 'أتيليه سيوة',
        slug: 'atelier-siwa',
        ownerName: 'سلمى عبد الله',
        contactPhone: '01088880001',
        contactEmail: null,
        city: 'سيوة',
        note: 'دار صغيرة نصنع بالزيوت المحلية.',
        now: NOW,
      }));
      assert(created !== null, 'an application must be recordable');

      const found = await uow.transaction((r) => r.applications.findApplication(created!.id));
      assert(found !== null, 'and readable back');
      equal(found!.status, 'applied', 'a new application');
      equal(found!.approvedControls, 0, 'nothing is approved yet');

      /*
       * Eight rows that EXIST, not a number computed from nothing. Migration
       * 0001 seeds them by trigger for exactly this reason: "6 of 8" has to be
       * a count of rows, so a control can never be silently skipped by never
       * being created.
       */
      const controls = await uow.transaction((r) => r.applications.verifications(created!.id));
      equal(controls.length, VERIFICATION_CONTROLS.length, 'the checklist');
      for (const control of VERIFICATION_CONTROLS) {
        assert(controls.some((c) => c.control === control), `${control} is missing`);
      }
    },
  },

  {
    name: 'the storefront address is unique, and a clash is a NULL not a throw',
    async run(setup) {
      const { uow } = await setup();
      const base = {
        tradingName: 'دار',
        slug: 'taken-slug',
        ownerName: 'مالك',
        contactEmail: null,
        city: 'القاهرة',
        note: 'نص.',
        now: NOW,
      };

      assert(await uow.transaction((r) => r.applications.apply({
        ...base, contactPhone: '01088880002',
      })) !== null, 'the first application');

      /*
       * Two houses choosing the same wordmark is an ordinary thing that
       * happens, not an exceptional one. The applicant needs to be told which
       * field to change, which a thrown error does not do.
       */
      equal(await uow.transaction((r) => r.applications.apply({
        ...base, contactPhone: '01088880003',
      })), null, 'a second application on a taken address');
    },
  },

  {
    name: 'marking a control moves the count, and only that control',
    async run(setup) {
      const { uow, staffId } = await setup();
      const created = await uow.transaction((r) => r.applications.apply({
        tradingName: 'دار تتحقق',
        slug: 'dar-verify',
        ownerName: 'مالك',
        contactPhone: '01088880004',
        contactEmail: null,
        city: 'القاهرة',
        note: 'نص.',
        now: NOW,
      }));

      equal(await uow.transaction((r) => r.applications.setVerification({
        sellerId: created!.id,
        control: 'owner_identity',
        status: 'approved',
        notes: 'بطاقة مطابقة',
        reviewedBy: staffId,
        now: NOW,
      })), true, 'marking a control');

      const after = await uow.transaction((r) => r.applications.findApplication(created!.id));
      equal(after!.approvedControls, 1, 'the count');

      const controls = await uow.transaction((r) => r.applications.verifications(created!.id));
      const identity = controls.find((c) => c.control === 'owner_identity')!;
      equal(identity.status, 'approved', 'the control that was marked');
      equal(identity.notes, 'بطاقة مطابقة', 'the note');
      assert(identity.reviewedAt !== null, 'a decision has a date');

      // And nothing else moved.
      equal(
        controls.filter((c) => c.status === 'approved').length,
        1,
        'controls approved',
      );
    },
  },

  {
    name: 'the intake queue holds what is not yet trading, oldest first',
    async run(setup) {
      const { uow } = await setup();

      const older = await uow.transaction((r) => r.applications.apply({
        tradingName: 'الأقدم',
        slug: 'older-house',
        ownerName: 'مالك',
        contactPhone: '01088880005',
        contactEmail: null,
        city: 'القاهرة',
        note: 'نص.',
        now: NOW,
      }));
      const newer = await uow.transaction((r) => r.applications.apply({
        tradingName: 'الأحدث',
        slug: 'newer-house',
        ownerName: 'مالك',
        contactPhone: '01088880006',
        contactEmail: null,
        city: 'القاهرة',
        note: 'نص.',
        now: LATER,
      }));

      const queue = await uow.transaction((r) => r.applications.listApplications());
      const olderAt = queue.findIndex((a) => a.id === older!.id);
      const newerAt = queue.findIndex((a) => a.id === newer!.id);

      assert(olderAt >= 0 && newerAt >= 0, 'both applications must be queued');
      // The applicant who has been waiting three weeks is the one most likely
      // to give up, and newest-first hides exactly them.
      assert(olderAt < newerAt, 'the older application must come first');
    },
  },

  {
    name: 'a house that has been turned away leaves the queue',
    async run(setup) {
      const { uow } = await setup();
      const created = await uow.transaction((r) => r.applications.apply({
        tradingName: 'مرفوضة',
        slug: 'refused-house',
        ownerName: 'مالك',
        contactPhone: '01088880007',
        contactEmail: null,
        city: 'القاهرة',
        note: 'نص.',
        now: NOW,
      }));

      equal(await uow.transaction((r) => r.applications.setStatus({
        id: created!.id, status: 'terminated', now: LATER,
      })), true, 'turning an application away');

      const queue = await uow.transaction((r) => r.applications.listApplications());
      equal(queue.some((a) => a.id === created!.id), false, 'a refused house in the intake queue');
    },
  },

  {
    name: 'acting on something that does not exist changes nothing',
    async run(setup) {
      const { uow, staffId } = await setup();
      const absent = '00000000-0000-4000-8000-000000000000';

      equal(await uow.transaction((r) => r.applications.findApplication(absent)), null,
        'reading an application that does not exist');
      equal(await uow.transaction((r) => r.applications.setStatus({
        id: absent, status: 'live', now: NOW,
      })), false, 'moving one that does not exist');
      equal(await uow.transaction((r) => r.applications.setVerification({
        sellerId: absent, control: 'owner_identity', status: 'approved',
        notes: null, reviewedBy: staffId, now: NOW,
      })), false, 'marking a control on one that does not exist');
    },
  },
];
