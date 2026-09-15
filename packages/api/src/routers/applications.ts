/**
 * Houses applying to join.
 *
 * The public half runs as the `intake` SERVICE role, which migration 0018
 * restricts to inserting a seller with `status = 'applied'` and nothing else.
 * That restriction is in the database's WITH CHECK rather than in this file, so
 * a bug here cannot put an unvetted house on the shopfront — the worst it can
 * do is create an application nobody asked for.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  APPLICATION_NOTE_MAX, VERIFICATION_CONTROLS,
  houseSlug, objectionsToApplying,
  type ApplicationObjection, type ApplicationRecord,
} from '@diyar/domain';
import { errorMessages } from '../errors';
import { platformProcedure, publicProcedure, router } from '../trpc';
import { phoneSchema, uuidSchema } from '../validation';
import { consume, rateLimitMessage } from '../rate-limit';

const OBJECTION_COPY: Readonly<Record<ApplicationObjection, string>> = {
  trading_name_required: 'اكتب اسم الدار',
  latin_name_required: 'اكتب اسم الدار بالحروف اللاتينية',
  latin_name_not_latin: 'الاسم اللاتيني يُكتب بحروف إنجليزية — هو ما سيظهر في رابط متجرك',
  owner_name_required: 'اكتب اسم المسؤول',
  city_required: 'اكتب المدينة',
  note_too_short: 'اكتب فقرة قصيرة عن دارك',
  note_too_long: `الوصف أطول من ${APPLICATION_NOTE_MAX} حرفًا`,
  unusable_slug: 'هذا الاسم اللاتيني لا يصلح عنوانًا لمتجر. جرّب اسمًا آخر.',
};

const applicationOut = (a: ApplicationRecord) => ({
  id: a.id,
  tradingName: a.tradingName,
  slug: a.slug,
  ownerName: a.ownerName,
  contactPhone: a.contactPhone,
  contactEmail: a.contactEmail,
  city: a.city,
  status: a.status,
  applicationNote: a.applicationNote,
  appliedAt: a.appliedAt?.toISOString() ?? null,
  approvedControls: a.approvedControls,
  totalControls: VERIFICATION_CONTROLS.length,
});
/**
 * Rate limit, keyed on the phone.
 *
 * Counted before anything is written, and counted whether or not the write
 * succeeds — see `rate-limit.ts` for why that matters on paths that
 * deliberately return the same answer to a valid and an invalid caller.
 */
const limit = (name: Parameters<typeof consume>[0], key: string): void => {
  const verdict = consume(name, key);
  if (!verdict.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: rateLimitMessage(verdict.retryAfterSeconds),
    });
  }
};


export const applicationsRouter = router({
  /*
   * `submit`, not `apply`.
   *
   * tRPC refuses `apply` as a procedure name — it collides with
   * `Function.prototype.apply` on the generated caller — and the refusal is a
   * hard error at router construction, so the whole API fails to build rather
   * than one route misbehaving. Worth the name.
   */
  submit: publicProcedure
    .input(z.object({
      tradingName: z.string().trim().min(1).max(120),
      latinName: z.string().trim().min(1).max(120),
      ownerName: z.string().trim().min(2).max(120),
      contactPhone: phoneSchema,
      contactEmail: z.string().trim().email('بريد إلكتروني غير صالح').max(160).nullish(),
      city: z.string().trim().min(1).max(80),
      note: z.string().trim().max(APPLICATION_NOTE_MAX),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      limit('application', input.contactPhone);

      const objections = objectionsToApplying({
        tradingName: input.tradingName,
        latinName: input.latinName,
        ownerName: input.ownerName,
        city: input.city,
        note: input.note,
      });
      if (objections.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: objections.map((o) => OBJECTION_COPY[o]).join(' · '),
        });
      }

      const created = await ctx.intakeUow.transaction((r) => r.applications.apply({
        tradingName: input.tradingName,
        // Derived from the wordmark by the DOMAIN, never accepted from the
        // request — a slug is a permanent URL and it should not be something a
        // form can set to an arbitrary string.
        slug: houseSlug(input.latinName),
        ownerName: input.ownerName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail ?? null,
        city: input.city,
        note: input.note,
        now: ctx.clock.now(),
      }));

      if (!created) {
        // Named, because the applicant can fix it: a different wordmark.
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'هذا الاسم اللاتيني مستخدم بالفعل. جرّب اسمًا آخر.',
        });
      }

      return { slug: created.slug };
    }),

  /* ---------------------------------------------------------- the platform */

  queue: platformProcedure.query(async ({ ctx }) => {
    const rows = await ctx.uow.transaction((r) => r.applications.listApplications());
    return rows.map(applicationOut);
  }),

  detail: platformProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const application = await r.applications.findApplication(input.id);
        if (!application) return null;
        const controls = await r.applications.verifications(input.id);
        return {
          ...applicationOut(application),
          controls: controls.map((c) => ({
            control: c.control,
            status: c.status,
            notes: c.notes,
            reviewedAt: c.reviewedAt?.toISOString() ?? null,
          })),
        };
      });
    }),

  /**
   * Mark one of the eight controls.
   *
   * Recorded in the audit trail in the same transaction. Doc 04 §8 names a
   * verification decision as auditable, and it is the record that answers "who
   * said this house was who it claimed to be".
   */
  verify: platformProcedure
    .input(z.object({
      sellerId: uuidSchema,
      control: z.enum(VERIFICATION_CONTROLS),
      status: z.enum(['pending', 'submitted', 'approved', 'rejected']),
      notes: z.string().trim().max(500).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
      }
      const staffId = ctx.platformStaffId;

      return ctx.uow.transaction(async (r) => {
        const ok = await r.applications.setVerification({
          sellerId: input.sellerId,
          control: input.control,
          status: input.status,
          notes: input.notes?.trim() || null,
          reviewedBy: staffId,
          now: ctx.clock.now(),
        });
        if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'الضابط غير موجود' });

        await r.audit.record({
          action: 'verification_decision',
          actorId: staffId,
          actorLabel: ctx.platformLabel ?? 'platform',
          entityTable: 'seller_verifications',
          entityId: input.sellerId,
          before: null,
          after: JSON.stringify({ control: input.control, status: input.status }),
        });

        return { status: input.status };
      });
    }),

  /**
   * Move a house's status.
   *
   * `live` is the one that matters, and it is not this router that guarantees
   * it: migration 0001's trigger refuses the transition unless all eight
   * controls have passed. So this attempts the move and reports the database's
   * answer rather than pre-judging it — which means the rule holds even if this
   * procedure is wrong.
   */
  setStatus: platformProcedure
    .input(z.object({
      id: uuidSchema,
      status: z.enum(['under_review', 'approved', 'live', 'suspended', 'terminated']),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
      }
      const staffId = ctx.platformStaffId;

      return ctx.uow.transaction(async (r) => {
        const before = await r.applications.findApplication(input.id);
        if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'الدار غير موجودة' });

        /*
         * The database is the gate; this translates its answer.
         *
         * 0001's trigger raises when a house tries to reach `approved` or
         * `live` with an unfinished checklist, and that exception reaches
         * `toTRPCError` as an unrecognised error — which maps everything
         * unknown to "something went wrong". So the operator was told nothing,
         * on the one screen where the reason is the whole point.
         *
         * Caught HERE rather than pre-checked, because a pre-check would make
         * the router the authority and leave the trigger as decoration. The
         * count comes from the row we already read.
         */
        let moved: boolean;
        try {
          moved = await r.applications.setStatus({
            id: input.id, status: input.status, now: ctx.clock.now(),
          });
        } catch (error) {
          // The whole cause chain: the trigger's words are under the driver's
          // wrapper, not in its own message. See `errorMessages`.
          if (/incomplete checklist/i.test(errorMessages(error))) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `لا يمكن تشغيل الدار قبل اكتمال بنود المراجعة — ${
                before.approvedControls} من ${VERIFICATION_CONTROLS.length} معتمدة.`,
            });
          }
          throw error;
        }
        if (!moved) throw new TRPCError({ code: 'NOT_FOUND', message: 'الدار غير موجودة' });

        await r.audit.record({
          action: 'seller_status_change',
          actorId: staffId,
          actorLabel: ctx.platformLabel ?? 'platform',
          entityTable: 'sellers',
          entityId: input.id,
          before: JSON.stringify({ status: before.status }),
          after: JSON.stringify({ status: input.status }),
        });

        return { status: input.status };
      });
    }),
});
