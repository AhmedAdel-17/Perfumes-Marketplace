import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  inspectClaims, isRefused, listingGaps, LISTING_STATES, MODERATION_REASONS,
  moveListing, nextListingStates, PRIMARY_PHOTO_BATCH_LIMIT, type ListingDraft,
  type ListingRecord, type PhotoRepository, type StoredPhoto,
} from '@diyar/domain';
import { platformProcedure, router, sellerProcedure } from '../trpc';
import { listingDraftSchema, newListingSchema } from '../listing-validation';
import type { MediaStore } from '../providers/media';

/**
 * Listings — a house writing them, and the platform deciding.
 *
 * TWO ACTORS, TWO SETS OF PROCEDURES, and the split is not organisational. A
 * house may write anything and submit it; only the platform may put it on the
 * shopfront. Doc 06 §4 puts the platform there because the trademark exposure
 * of a bad claim lands on the platform rather than the house that wrote it.
 *
 * The database says the same thing (migration 0010) and the domain says it a
 * third time. That is deliberate: this router is the readable copy, the domain
 * is the tested copy, and the trigger is the one that holds when somebody
 * reaches the tables another way.
 */

/** The house this request belongs to, or a refusal. */
function houseOrThrow(ctx: { sellerId: string | null }): string {
  if (!ctx.sellerId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
  }
  return ctx.sellerId;
}

/** Batch projection over already-owned listing IDs. Never accepts product IDs
 * from the browser; every bounded photo read stays in the seller's Unit of Work. */
async function catalogueRows(rows: readonly ListingRecord[], photos: PhotoRepository, media: MediaStore) {
  const primaryByProduct = new Map<string, StoredPhoto>();
  for (let offset = 0; offset < rows.length; offset += PRIMARY_PHOTO_BATCH_LIMIT) {
    const batch = rows.slice(offset, offset + PRIMARY_PHOTO_BATCH_LIMIT).map((listing) => listing.id);
    for (const photo of await photos.verifiedPrimariesForProducts(batch)) primaryByProduct.set(photo.productId, photo);
  }
  return rows.map((listing) => {
    const primary = primaryByProduct.get(listing.id);
    return {
      id: listing.id,
      name: listing.name ?? '',
      slug: listing.slug ?? '',
      sku: listing.sku ?? '',
      state: listing.state,
      // Preserve the legacy numeric contract while identifying unrecorded values.
      pricePiastres: listing.pricePiastres ?? 0,
      priceRecorded: listing.pricePiastres !== null && listing.pricePiastres !== undefined,
      stock: listing.stock ?? 0,
      stockRecorded: listing.stock !== null && listing.stock !== undefined,
      primaryPhoto: primary ? {
        url: media.publicUrl(primary.storageKey), alt: primary.alt,
        width: primary.width, height: primary.height,
      } : null,
      moderationReason: listing.moderationReason,
      canMoveTo: nextListingStates(listing.state, 'seller'),
    };
  });
}

export const listingsRouter = router({
  /* ------------------------------------------------------------- the house */

  // Backwards compatible: existing clients still receive the complete array.
  // Read cost is 1 + ceil(N / 100), rather than 1 + N per-listing photo queries.
  mine: sellerProcedure.query(async ({ ctx }) => {
    const sellerId = houseOrThrow(ctx);
    return ctx.uow.transaction(async (r) => catalogueRows(
      await r.listings.listForSeller(sellerId), r.photos, ctx.media,
    ));
  }),

  /** Opt-in page contract for larger catalogues; no silent truncation of mine. */
  minePage: sellerProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(PRIMARY_PHOTO_BATCH_LIMIT).default(50),
      cursor: z.object({ updatedAt: z.string().datetime({ offset: true }), id: z.string().uuid() }).strict().optional(),
    }).strict().optional())
    .query(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);
      return ctx.uow.transaction(async (r) => {
        const page = await r.listings.pageForSeller(sellerId, {
          limit: input?.limit ?? 50, ...(input?.cursor ? { cursor: input.cursor } : {}),
        });
        return { items: await catalogueRows(page.items, r.photos, ctx.media), nextCursor: page.nextCursor };
      });
    }),

  /**
   * The house's own brand, needed to create a listing.
   *
   * A listing belongs to a brand and a brand belongs to a house. Most houses
   * have exactly one, so the console does not ask — but it cannot invent one
   * either, and a house with none must be told rather than shown a form whose
   * submit will fail.
   */
  myBrand: sellerProcedure.query(async ({ ctx }) => {
    const sellerId = houseOrThrow(ctx);
    const brands = await ctx.uow.transaction((r) => r.sellers.brandsFor(sellerId));
    return brands[0] ? { id: brands[0].id, name: brands[0].name } : null;
  }),

  get: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      return ctx.uow.transaction(async (r) => {
        const listing = await r.listings.findForSeller(input.id, sellerId);
        if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'المنتج غير موجود' });

        const primaryImage = await r.listings.hasPrimaryImage(listing.id);

        return {
          ...listing,
          submittedAt: listing.submittedAt?.toISOString() ?? null,
          moderatedAt: listing.moderatedAt?.toISOString() ?? null,
          updatedAt: listing.updatedAt.toISOString(),
          primaryImage,
          canMoveTo: nextListingStates(listing.state, 'seller'),
          /*
           * What still stands between this draft and being submitted, and what
           * a moderator will see when it gets there.
           *
           * Both are computed for a DRAFT so a house learns them while they can
           * still act, rather than at the moment they press submit. The claims
           * findings especially: being told after submission that a sentence
           * was prohibited teaches nothing about which sentence.
           */
          gaps: listingGaps({ ...listing, primaryImage }),
          claims: inspectClaims(
            listing.name ?? '',
            listing.nameEn ?? '',
            ...(listing.notesTop ?? []),
            ...(listing.notesHeart ?? []),
            ...(listing.notesBase ?? []),
            listing.defectRoute ?? '',
          ),
        };
      });
    }),

  create: sellerProcedure
    .input(newListingSchema)
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      return ctx.uow.transaction(async (r) => {
        // Facade validation: a public brand UUID is not permission to sell it.
        // The composite FK in 0032 independently protects direct repository
        // writes and races; this check gives callers one non-enumerating error.
        const brands = await r.sellers.brandsFor(sellerId);
        if (!brands.some((brand) => brand.id === input.brandId)) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'العلامة التجارية غير متاحة' });
        }
        const listing = await r.listings.create(sellerId, input);
        return { id: listing.id };
      });
    }),

  save: sellerProcedure
    .input(z.object({ id: z.string().uuid(), draft: listingDraftSchema, expectedStock: z.number().int().min(0).max(100000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      return ctx.uow.transaction(async (r) => {
        const listing = await r.listings.findForSeller(input.id, sellerId);
        if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'المنتج غير موجود' });

        try {
          await r.listings.update(input.id, sellerId, input.draft as ListingDraft, input.expectedStock);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'LISTING_STOCK_CONFLICT') {
            throw new TRPCError({ code: 'CONFLICT', message: 'تغيّر المخزون منذ تحميل المنتج. أعد تحميله وراجع الكمية قبل الحفظ.' });
          }
          throw error;
        }

        const merged = { ...listing, ...input.draft } as ListingDraft;
        const primaryImage = await r.listings.hasPrimaryImage(input.id);
        return {
          gaps: listingGaps({ ...merged, primaryImage }),
          claims: inspectClaims(
            input.draft.name ?? '',
            input.draft.nameEn ?? '',
            ...(input.draft.notesTop ?? []),
            ...(input.draft.notesHeart ?? []),
            ...(input.draft.notesBase ?? []),
            input.draft.defectRoute ?? '',
          ),
        };
      });
    }),

  submit: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      return ctx.uow.transaction(async (r) => {
        const listing = await r.listings.findForSeller(input.id, sellerId);
        if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'المنتج غير موجود' });

        const primaryImage = await r.listings.hasPrimaryImage(input.id);
        const gaps = listingGaps({ ...listing, primaryImage });
        const claims = inspectClaims(
          listing.name ?? '',
          listing.nameEn ?? '',
          ...(listing.notesTop ?? []),
          ...(listing.notesHeart ?? []),
          ...(listing.notesBase ?? []),
          listing.defectRoute ?? '',
        );

        /*
         * Refused BEFORE it reaches a moderator, not by one.
         *
         * A percentage-similarity or replica claim is prohibited outright, so
         * sending it to the queue would waste a person's time on a decision
         * that has already been made. Everything else — including naming
         * another house — goes to the queue, because a rule cannot read
         * context and a person can.
         */
        if (gaps.length > 0 || isRefused(claims)) {
          return { submitted: false, gaps, claims };
        }

        // Throws if the move is illegal or this actor may not make it.
        moveListing(listing.state, 'pending_moderation', 'seller');
        await r.listings.move(input.id, 'pending_moderation', { at: ctx.clock.now() });

        return { submitted: true, gaps: [], claims };
      });
    }),

  withdraw: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      return ctx.uow.transaction(async (r) => {
        const listing = await r.listings.findForSeller(input.id, sellerId);
        if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'المنتج غير موجود' });

        // No reason required: a house withdrawing its own submission is not
        // being judged by anyone.
        moveListing(listing.state, 'draft', 'seller');
        await r.listings.move(input.id, 'draft', { at: ctx.clock.now() });
        return { ok: true };
      });
    }),

  archive: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      return ctx.uow.transaction(async (r) => {
        const listing = await r.listings.findForSeller(input.id, sellerId);
        if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'المنتج غير موجود' });

        moveListing(listing.state, 'archived', 'seller');
        await r.listings.move(input.id, 'archived', { at: ctx.clock.now() });
        return { ok: true };
      });
    }),

  /* ---------------------------------------------------------- the platform */

  queue: platformProcedure.query(async ({ ctx }) => {
    const rows = await ctx.uow.transaction((r) => r.listings.moderationQueue());
    const now = ctx.clock.now();

    return rows.map((listing) => ({
      id: listing.id,
      name: listing.name,
      brandName: listing.brandName,
      pricePiastres: listing.pricePiastres,
      volumeMl: listing.volumeMl,
      submittedAt: listing.submittedAt?.toISOString() ?? null,
      // How long it has been waiting. A queue without an age is a list — the
      // same lesson the operations queue learned.
      waitingHours: listing.submittedAt
        ? Math.floor((now.getTime() - listing.submittedAt.getTime()) / 3_600_000)
        : null,
      /*
       * The claims inspector runs HERE, on the way to the moderator's screen,
       * rather than being stored at submission.
       *
       * A stored finding is a finding from whenever the rules last changed. The
       * moderator has to see what today's rules say about this text, and the
       * text is right there.
       */
      claims: inspectClaims(...listing.claimText),
    }));
  }),

  decide: platformProcedure
    .input(z.object({
      id: z.string().uuid(),
      to: z.enum(LISTING_STATES),
      reason: z.enum(MODERATION_REASONS).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
      }

      return ctx.uow.transaction(async (r) => {
        const listing = await r.listings.findAnywhere(input.id);
        if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'المنتج غير موجود' });

        // The domain refuses an illegal move, and refuses a send-back or a
        // suspension with no coded reason.
        moveListing(listing.state, input.to, 'platform', input.reason ?? null);

        await r.listings.move(input.id, input.to, {
          reason: input.reason ?? null,
          moderatedBy: ctx.platformStaffId,
          at: ctx.clock.now(),
        });

        /*
         * Recorded in the SAME transaction as the decision.
         *
         * That is the whole reason the audit trail is a repository rather than
         * a logger: a decision that committed while its audit entry failed is a
         * decision nobody can account for, and nothing would have said so.
         *
         * Doc 04 §8 makes this a gate — "admin actions ... are auditable" — and
         * the table had existed since the first migration with nothing ever
         * writing to it, which is worse than not having one: a schema that
         * promises an audit trail gets read as having one.
         */
        await r.audit.record({
          action: 'listing_moderation',
          actorId: ctx.platformStaffId,
          actorLabel: ctx.platformLabel ?? 'platform',
          entityTable: 'products',
          entityId: input.id,
          before: JSON.stringify({ status: listing.state }),
          after: JSON.stringify({ status: input.to, reason: input.reason ?? null }),
        });

        return { state: input.to };
      });
    }),
});
