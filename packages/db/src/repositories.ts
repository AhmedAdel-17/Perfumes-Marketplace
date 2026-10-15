/**
 * Drizzle adapter for the domain's repository ports.
 *
 * Pattern — Ports & Adapters (ENGINEERING_PRINCIPLES §4).
 *
 * The domain declares what it needs; this is one way of providing it. The
 * in-memory adapter in `@diyar/domain/testing` is another, and both run the
 * identical contract — see `repositories.contract.test.ts`.
 *
 * Typed against Drizzle's driver-agnostic `PgDatabase`, so the same code serves
 * PGlite in tests and postgres-js in production. Nothing here is driver-specific.
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import {
  Money, SubOrderLifecycle, InvalidTransition,
  type Actor, type OrderSource, type ReasonCode, type SettlementSubOrder,
  type SubOrderState, type TransitionRecord,
  type CustomerRepository, type PayoutRepository,
  type DraftOrder, type OrderRepository, type PersistedOrder, type ProductRecord,
  type ProductRepository, type Repositories, type SellerRecord, type SellerRepository,
  type SubOrderRecord, type SubOrderRepository, type UnitOfWork,
} from '@diyar/domain';
import * as schema from './schema/index';
import { contentRepository } from './content-repository';
import { siteRepository } from './site-repository';
import { listingRepository } from './listing-repository';
import { reviewRepository } from './review-repository';
import { returnRepository } from './return-repository';
import { supportRepository } from './support-repository';
import { applicationRepository } from './application-repository';
import { catalogueReadModel } from './catalogue-read-model';
import { noteGlossaryRepository } from './note-glossary-repository';
import { identityRepository } from './identity-repository';
import { auditTrail } from './audit-trail';
import { ownerReportRepository, settlementFacts } from './owner-report-repository';
import { photoRepository } from './photo-repository';
import { contentImageRepository } from './content-image-repository';
import { analyticsRepository } from './analytics-repository';

export type DiyarDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Any handle that can run queries — the root db or an open transaction. */
type Executor = DiyarDatabase;

// ------------------------------------------------------------------ mappers

const toSeller = (r: typeof schema.sellers.$inferSelect): SellerRecord => ({
  id: r.id,
  slug: r.slug,
  tradingName: r.tradingName,
  status: r.status,
  confirmationSlaHours: r.confirmationSlaHours,
  dispatchSlaHours: r.dispatchSlaHours,
  payoutReserveDays: r.payoutReserveDays,
  disputeWindowDays: r.disputeWindowDays,
});

const toProduct = (r: typeof schema.products.$inferSelect): ProductRecord => ({
  id: r.id,
  sellerId: r.sellerId,
  slug: r.slug,
  name: r.name,
  sku: r.sku,
  // Money crosses the boundary as Money. A bare number would let a caller do
  // float arithmetic on it, which is the whole reason the value object exists.
  price: Money.fromMinor(r.pricePiastres),
  volumeMl: r.volumeMl,
  stock: r.stock,
  status: r.status,
});

const toSubOrder = (r: typeof schema.subOrders.$inferSelect): SubOrderRecord => ({
  id: r.id,
  reference: r.reference,
  sellerId: r.sellerId,
  orderId: r.orderId,
  state: r.state,
  merchandise: Money.fromMinor(r.merchandisePiastres),
  shipping: Money.fromMinor(r.shippingPiastres),
});

// ------------------------------------------------------------- repositories

const sellerRepository = (db: Executor): SellerRepository => ({
  async brandsFor(sellerId) {
    return db.select({ id: schema.brands.id, name: schema.brands.name })
      .from(schema.brands)
      .where(eq(schema.brands.sellerId, sellerId))
      .orderBy(schema.brands.name);
  },

  async findById(id) {
    const [row] = await db.select().from(schema.sellers).where(eq(schema.sellers.id, id)).limit(1);
    return row ? toSeller(row) : null;
  },
  async findBySlug(slug) {
    const [row] = await db.select().from(schema.sellers).where(eq(schema.sellers.slug, slug)).limit(1);
    return row ? toSeller(row) : null;
  },
});

const customerRepository = (db: Executor): CustomerRepository => ({
  async findOrCreateByPhone({ phone, fullName }) {
    // ON CONFLICT rather than SELECT-then-INSERT: two tabs checking out at once
    // would both see "no such customer" and both insert, and one would lose to
    // the unique index. The name is refreshed because the most recent checkout
    // is the best thing we know about how to address them.
    const [row] = await db
      .insert(schema.customers)
      .values({ phone, fullName })
      .onConflictDoUpdate({
        target: schema.customers.phone,
        set: { fullName, updatedAt: new Date() },
      })
      .returning({
        id: schema.customers.id,
        phone: schema.customers.phone,
        fullName: schema.customers.fullName,
        authUserId: schema.customers.authUserId,
      });

    return {
      id: row!.id,
      phone: row!.phone,
      fullName: row!.fullName,
      authUserId: row!.authUserId,
    };
  },

  async listPriorPurchaseSellerIds(customerId) {
    const rows = await db
      .selectDistinct({ sellerId: schema.subOrders.sellerId })
      .from(schema.subOrders)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.subOrders.orderId))
      .where(eq(schema.orders.customerId, customerId));
    return new Set(rows.map((r) => r.sellerId));
  },
});

const productRepository = (db: Executor): ProductRepository => ({
  async findBySlug(slug) {
    const [row] = await db.select().from(schema.products).where(eq(schema.products.slug, slug)).limit(1);
    return row ? toProduct(row) : null;
  },
  async listPublishedBySeller(sellerId) {
    const rows = await db.select().from(schema.products).where(
      and(eq(schema.products.sellerId, sellerId), eq(schema.products.status, 'published')),
    );
    return rows.map(toProduct);
  },

  async snapshotForCart(productIds) {
    // `inArray` with an empty list generates `IN ()`, which is a syntax error in
    // Postgres rather than an empty result. An empty cart is the most ordinary
    // state a cart has, so it must not be able to take the page down.
    if (productIds.length === 0) return [];

    const rows = await db
      .select({
        p: schema.products,
        brandName: schema.brands.name,
        brandEn: schema.brands.nameEn,
        sellerStatus: schema.sellers.status,
        photoKey: schema.productMedia.storagePath,
        photoAlt: schema.productMedia.altText,
        photoWidth: schema.productMedia.width,
        photoHeight: schema.productMedia.height,
      })
      .from(schema.products)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .innerJoin(schema.sellers, eq(schema.sellers.id, schema.products.sellerId))
      // In the SAME read as the price, so a bag line cannot show one moment's
      // photograph beside another moment's price. A left join, because a line
      // without a photograph is still a line; at most one row joins, because
      // `product_media_one_primary` allows one primary per product. Verified
      // rows only (0021) — the storefront's rule.
      .leftJoin(schema.productMedia, and(
        eq(schema.productMedia.productId, schema.products.id),
        eq(schema.productMedia.isPrimary, true),
        isNotNull(schema.productMedia.contentType),
      ))
      .where(inArray(schema.products.id, [...productIds]));

    return rows.map((r) => ({
      productId: r.p.id,
      sellerId: r.p.sellerId,
      slug: r.p.slug,
      name: r.p.name,
      nameEn: r.p.nameEn,
      brandName: r.brandName,
      brandNameEn: r.brandEn,
      brandLatin: (r.brandEn ?? r.brandName).toUpperCase(),
      sku: r.p.sku,
      volumeMl: r.p.volumeMl,
      scentFamily: r.p.scentFamily ?? 'amber',
      unitPrice: Money.fromMinor(r.p.promoPricePiastres ?? r.p.pricePiastres),
      stock: r.p.stock,
      // Reported honestly rather than assumed true. RLS already hides rows an
      // anonymous visitor may not see, but the platform role sees everything,
      // and a cart priced as platform must reach the same verdict as one priced
      // as a shopper.
      isPublished: r.p.status === 'published',
      isHouseLive: r.sellerStatus === 'live',
      fulfilmentHours: r.p.fulfilmentHours,
      // All four facts or none, by 0021's CHECK — so a key with a null width
      // is not a state this can meet.
      primaryPhoto: r.photoKey === null
        ? null
        : { storageKey: r.photoKey, alt: r.photoAlt!, width: r.photoWidth!, height: r.photoHeight! },
    }));
  },
});

const orderRepository = (db: Executor): OrderRepository => ({
  async save(draft: DraftOrder, sellerIdBySlug) {
    const a = draft.address;

    const [order] = await db.insert(schema.orders).values({
      reference: draft.reference,
      customerId: draft.customerId,
      contactPhone: draft.contactPhone,
      contactName: draft.contactName,
      governorate: a.governorate,
      city: a.city,
      area: a.area,
      street: a.street,
      building: a.building,
      floor: a.floor ?? null,
      apartment: a.apartment ?? null,
      landmark: a.landmark ?? null,
      source: draft.source,
      merchandisePiastres: draft.merchandise.minor,
      shippingPiastres: draft.shipping.minor,
      discountPiastres: draft.discount.minor,
      totalPiastres: draft.total.minor,
      paymentMethod: draft.paymentMethod,
      placedAt: draft.placedAt,
    }).returning({ id: schema.orders.id });

    const orderId = order!.id;
    const subOrderIds: string[] = [];

    // Read once, outside the loop. N queries inside it would make a three-house
    // order three round trips slower for a value that cannot change between
    // them — and this runs on the checkout path.
    const sellerIds = [...new Set([...sellerIdBySlug.values()])];
    const deliveryModes = new Map<string, 'seller' | 'platform'>();
    if (sellerIds.length > 0) {
      const modes = await db
        .select({ id: schema.sellers.id, mode: schema.sellers.deliveryFulfilledBy })
        .from(schema.sellers)
        .where(inArray(schema.sellers.id, sellerIds));
      for (const row of modes) deliveryModes.set(row.id, row.mode);
    }

    for (const sub of draft.subOrders) {
      const sellerId = sellerIdBySlug.get(sub.sellerId);
      if (!sellerId) throw new Error(`No seller id for slug "${sub.sellerId}"`);

      const [row] = await db.insert(schema.subOrders).values({
        orderId,
        sellerId,
        reference: sub.reference,
        merchandisePiastres: sub.merchandise.minor,
        shippingPiastres: sub.shipping.minor,
        confirmDueAt: sub.confirmDueAt,
        // Sent explicitly, from the domain's snapshot. The 0020 trigger fills
        // the column only when a writer does not.
        dispatchSlaHours: sub.dispatchSlaHours,
        // The house cannot read the parent order — that would show it what the
        // customer bought from competing houses — so everything it needs to
        // pack and label is written onto its own row. Migration 0004.
        //
        // The delivery arrangement is snapshotted here for the same reason the
        // commission rate is: what the house is owed for a parcel it sent this
        // month must not change when its arrangement changes next month.
        deliveryFulfilledBy: deliveryModes.get(sellerId) ?? 'seller',
        recipientName: draft.contactName,
        recipientPhone: draft.contactPhone,
        governorate: a.governorate,
        city: a.city,
        area: a.area,
        street: a.street,
        building: a.building,
        floor: a.floor ?? null,
        apartment: a.apartment ?? null,
        landmark: a.landmark ?? null,
      }).returning({ id: schema.subOrders.id });

      subOrderIds.push(row!.id);

      for (const li of sub.lineItems) {
        await db.insert(schema.orderLineItems).values({
          subOrderId: row!.id,
          productId: li.productId,
          productName: li.productName,
          brandName: li.brandName,
          sku: li.sku,
          volumeMl: li.volumeMl,
          quantity: li.quantity,
          unitPricePiastres: li.unitPrice.minor,
          linePiastres: li.line.minor,
          commissionSource: li.commission.source,
          commissionBps: li.commission.bps,
          commissionRuleSetVersion: li.commission.ruleSetVersion,
          commissionPiastres: li.commissionAmount.minor,
        });
      }
    }

    return {
      id: orderId,
      reference: draft.reference,
      source: draft.source,
      total: draft.total,
      subOrderIds,
    };
  },

  async findByReference(reference) {
    const [row] = await db.select().from(schema.orders)
      .where(eq(schema.orders.reference, reference)).limit(1);
    if (!row) return null;

    const subs = await db.select({ id: schema.subOrders.id })
      .from(schema.subOrders).where(eq(schema.subOrders.orderId, row.id));

    return {
      id: row.id,
      reference: row.reference,
      source: row.source as OrderSource,
      total: Money.fromMinor(row.totalPiastres),
      subOrderIds: subs.map((s) => s.id),
    };
  },

  async findForCustomerLookup({ reference, phone }) {
    // Both factors in the WHERE clause. Matching the phone afterwards in
    // TypeScript is the version of this that shipped and disclosed every order
    // to anyone holding a reference.
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(and(
        eq(schema.orders.reference, reference),
        eq(schema.orders.contactPhone, phone),
      ))
      .limit(1);

    if (!order) return null;

    const subs = await db
      .select({ sub: schema.subOrders, brandName: schema.sellers.tradingName })
      .from(schema.subOrders)
      .innerJoin(schema.sellers, eq(schema.sellers.id, schema.subOrders.sellerId))
      .where(eq(schema.subOrders.orderId, order.id));

    const items = await db
      .select()
      .from(schema.orderLineItems)
      .where(inArray(schema.orderLineItems.subOrderId, subs.map((s) => s.sub.id)));

    const parcels = await db
      .select({
        subOrderId: schema.shipments.subOrderId,
        trackingNumber: schema.shipments.trackingNumber,
      })
      .from(schema.shipments)
      .where(inArray(schema.shipments.subOrderId, subs.map((s) => s.sub.id)));

    return {
      reference: order.reference,
      contactName: order.contactName,
      placedAt: order.placedAt,
      paymentMethod: order.paymentMethod,
      total: Money.fromMinor(order.totalPiastres),
      houses: subs.map((s) => ({
        subOrderId: s.sub.id,
        trackingNumber:
          parcels.find((p) => p.subOrderId === s.sub.id)?.trackingNumber ?? null,
        reference: s.sub.reference,
        sellerId: s.sub.sellerId,
        brandName: s.brandName,
        state: s.sub.state,
        merchandise: Money.fromMinor(s.sub.merchandisePiastres),
        shipping: Money.fromMinor(s.sub.shippingPiastres),
        items: items
          .filter((i) => i.subOrderId === s.sub.id)
          .map((i) => ({
            name: i.productName,
            brandName: i.brandName,
            quantity: i.quantity,
            unitPrice: Money.fromMinor(i.unitPricePiastres),
          })),
      })),
    };
  },
});

const subOrderRepository = (db: Executor): SubOrderRepository => ({
  async findById(id) {
    const [row] = await db.select().from(schema.subOrders)
      .where(eq(schema.subOrders.id, id)).limit(1);
    return row ? toSubOrder(row) : null;
  },

  async recordShipment({ subOrderId, courier, trackingNumber, labelUrl, codAmountPiastres, dispatchedAt }) {
    await db.insert(schema.shipments).values({
      subOrderId,
      courier,
      trackingNumber,
      labelUrl,
      codAmountPiastres,
      dispatchedAt,
    });
    // Mirrored onto the sub-order so the queue and the tracking page do not
    // have to join to shipments for a single timestamp.
    await db.update(schema.subOrders)
      .set({ dispatchedAt })
      .where(eq(schema.subOrders.id, subOrderId));
  },

  async findShipment(subOrderId) {
    const [row] = await db
      .select({
        courier: schema.shipments.courier,
        trackingNumber: schema.shipments.trackingNumber,
        dispatchedAt: schema.shipments.dispatchedAt,
      })
      .from(schema.shipments)
      .where(eq(schema.shipments.subOrderId, subOrderId))
      .limit(1);
    return row ?? null;
  },

  async listOpsQueue() {
    // Dispatched or delivered only. Anything earlier belongs to the house, and
    // anything closed needs nobody.
    const rows = await db
      .select({
        sub: schema.subOrders,
        brandName: schema.sellers.tradingName,
        trackingNumber: schema.shipments.trackingNumber,
        remittedAt: schema.shipments.codRemittedAt,
      })
      .from(schema.subOrders)
      .innerJoin(schema.sellers, eq(schema.sellers.id, schema.subOrders.sellerId))
      .leftJoin(schema.shipments, eq(schema.shipments.subOrderId, schema.subOrders.id))
      .where(inArray(schema.subOrders.state, ['dispatched', 'delivered']));

    return rows.map((r) => ({
      id: r.sub.id,
      reference: r.sub.reference,
      state: r.sub.state,
      sellerId: r.sub.sellerId,
      brandName: r.brandName,
      recipientName: r.sub.recipientName,
      total: Money.fromMinor(r.sub.merchandisePiastres + r.sub.shippingPiastres),
      dispatchedAt: r.sub.dispatchedAt,
      deliveredAt: r.sub.deliveredAt,
      trackingNumber: r.trackingNumber,
      remitted: r.remittedAt !== null,
    }));
  },

  async listQueueForSeller(sellerId) {
    const rows = await db
      .select()
      .from(schema.subOrders)
      .where(eq(schema.subOrders.sellerId, sellerId));

    if (rows.length === 0) return [];

    const items = await db
      .select()
      .from(schema.orderLineItems)
      .where(inArray(schema.orderLineItems.subOrderId, rows.map((r) => r.id)));

    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      state: r.state,
      merchandise: Money.fromMinor(r.merchandisePiastres),
      shipping: Money.fromMinor(r.shippingPiastres),
      placedAt: r.createdAt,
      confirmDueAt: r.confirmDueAt,
      dispatchDueAt: r.dispatchDueAt,
      recipientName: r.recipientName,
      recipientPhone: r.recipientPhone,
      governorate: r.governorate,
      city: r.city,
      area: r.area,
      street: r.street,
      building: r.building,
      floor: r.floor,
      apartment: r.apartment,
      landmark: r.landmark,
      items: items
        .filter((i) => i.subOrderId === r.id)
        .map((i) => ({
          name: i.productName,
          sku: i.sku,
          volumeMl: i.volumeMl,
          quantity: i.quantity,
        })),
    }));
  },

  async listBySeller(sellerId) {
    const rows = await db.select().from(schema.subOrders)
      .where(eq(schema.subOrders.sellerId, sellerId));
    return rows.map(toSubOrder);
  },

  async applyTransition(
    id: string,
    to: SubOrderState,
    actor: Actor,
    reason: ReasonCode | null,
    record: TransitionRecord,
  ) {
    const [current] = await db.select({
      state: schema.subOrders.state,
      dispatchSlaHours: schema.subOrders.dispatchSlaHours,
    })
      .from(schema.subOrders).where(eq(schema.subOrders.id, id)).limit(1);
    if (!current) throw new Error(`Unknown sub-order ${id}`);

    // The adapter enforces the table too. A caller passing a hand-built record
    // must not be able to write a state the machine forbids — the database
    // trigger is a third line of defence, not the only one.
    if (!SubOrderLifecycle.rule(current.state, to)) {
      throw new InvalidTransition(current.state, to);
    }

    await db.update(schema.subOrders)
      .set({
        state: to,
        // Confirming starts the dispatch clock, from the hours snapshotted at
        // placement. Computed by the domain so both adapters agree exactly.
        ...(to === 'confirmed'
          ? {
            confirmedAt: record.at,
            dispatchDueAt: SubOrderLifecycle.dispatchDueAt(record.at, current.dispatchSlaHours),
          }
          : {}),
        ...(to === 'dispatched' ? { dispatchedAt: record.at } : {}),
        ...(to === 'delivered' ? { deliveredAt: record.at } : {}),
      })
      .where(eq(schema.subOrders.id, id));

    await db.insert(schema.subOrderTransitions).values({
      subOrderId: id,
      fromState: current.state,
      toState: to,
      actor,
      reason,
      occurredAt: record.at,
    });
  },

  async recordRemittance({ subOrderId, collectedPiastres, remittedAt }) {
    // Written on the SHIPMENT, not the sub-order, because remittance is a fact
    // about the parcel and the courier — how much came back and when. The
    // sub-order's state says where the order is; this says where the money is.
    await db.update(schema.shipments)
      .set({ codCollectedPiastres: collectedPiastres, codRemittedAt: remittedAt })
      .where(eq(schema.shipments.subOrderId, subOrderId));
  },

  async listForSettlement(sellerId) {
    const subs = await db.select().from(schema.subOrders)
      .where(eq(schema.subOrders.sellerId, sellerId));
    if (subs.length === 0) return [];

    /*
     * The commission snapshot and the remittance are read by the helper the
     * owner report uses as well, so a payout and the owner's dashboard cannot
     * disagree about what has been earned. See `settlementFacts` for why "cash
     * in hand" means ANY shipment remitted.
     */
    const facts = await settlementFacts(db, subs);
    return subs.map((r) => facts.get(r.id)!);
  },
});


const payoutRepository = (db: Executor): PayoutRepository => ({
  async save({ sellerId, reference, statement }) {
    const [payout] = await db.insert(schema.payouts).values({
      sellerId,
      reference,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      grossPiastres: statement.gross.minor,
      commissionPiastres: statement.commission.minor,
      shippingPiastres: statement.shipping.minor,
      adjustmentsPiastres: statement.adjustments.minor,
      netPiastres: statement.net.minor,
      disputeDeadline: statement.disputeDeadline,
    }).returning({ id: schema.payouts.id });

    const payoutId = payout!.id;

    // Only money that actually moved this period. A held line is not owed yet
    // and reappears in a later run once the hold clears; persisting it now
    // would double-count it then.
    for (const line of statement.lines) {
      if (line.outcome !== 'earned' && line.outcome !== 'reversed') continue;
      await db.insert(schema.payoutLines).values({
        payoutId,
        subOrderId: line.subOrderId,
        grossPiastres: line.gross.minor,
        commissionPiastres: line.commission.minor,
        commissionSource: line.commissionSource,
        commissionBps: line.commissionBps,
        shippingPiastres: line.shipping.minor,
        netPiastres: line.net.minor,
      });
    }

    return { id: payoutId, reference };
  },

  async listForSeller(sellerId) {
    const rows = await db.select().from(schema.payouts)
      .where(eq(schema.payouts.sellerId, sellerId));
    return rows.map(toPayoutSummary);
  },

  async findWithLines({ payoutId, sellerId }) {
    // Scoped by seller as well as id. RLS refuses another house's payout
    // anyway; matching on both means the query cannot even express the ask.
    const [row] = await db.select().from(schema.payouts)
      .where(and(eq(schema.payouts.id, payoutId), eq(schema.payouts.sellerId, sellerId)))
      .limit(1);
    if (!row) return null;

    const lines = await db
      .select({ line: schema.payoutLines, reference: schema.subOrders.reference })
      .from(schema.payoutLines)
      .innerJoin(schema.subOrders, eq(schema.subOrders.id, schema.payoutLines.subOrderId))
      .where(eq(schema.payoutLines.payoutId, payoutId));

    return {
      ...toPayoutSummary(row),
      lines: lines.map((l) => ({
        subOrderReference: l.reference,
        gross: Money.fromMinor(l.line.grossPiastres),
        commission: Money.fromMinor(l.line.commissionPiastres),
        commissionSource: l.line.commissionSource,
        commissionBps: l.line.commissionBps,
        shipping: Money.fromMinor(l.line.shippingPiastres),
        net: Money.fromMinor(l.line.netPiastres),
      })),
    };
  },
});

const toPayoutSummary = (row: typeof schema.payouts.$inferSelect) => ({
  id: row.id,
  reference: row.reference,
  status: row.status,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  gross: Money.fromMinor(row.grossPiastres),
  commission: Money.fromMinor(row.commissionPiastres),
  net: Money.fromMinor(row.netPiastres),
  disputeDeadline: row.disputeDeadline,
  paidAt: row.paidAt,
});

export const repositoriesFor = (db: Executor): Repositories => ({
  sellers: sellerRepository(db),
  customers: customerRepository(db),
  products: productRepository(db),
  orders: orderRepository(db),
  subOrders: subOrderRepository(db),
  payouts: payoutRepository(db),
  content: contentRepository(db),
  site: siteRepository(db),
  listings: listingRepository(db),
  reviews: reviewRepository(db),
  returns: returnRepository(db),
  support: supportRepository(db),
  applications: applicationRepository(db),
  audit: auditTrail(db),
  ownerReport: ownerReportRepository(db),
  photos: photoRepository(db),
  contentImages: contentImageRepository(db),
  analytics: analyticsRepository(db),
  catalogue: catalogueReadModel(db),
  glossary: noteGlossaryRepository(db),
  identity: identityRepository(db),
});

/** Who is making the request. Drives every RLS policy in migration 0002. */
export interface ActorContext {
  /**
   * `checkout`, `aftercare`, `intake`, `analytics` and `identity` are SERVICE
   * roles, not user roles. Each is set only inside one server-side transaction,
   * after the router has validated the request, and none is reachable from a
   * browser. See 0003, 0015, 0018, 0023 and 0025.
   *
   * Each exists because some visitor who is nobody — a guest checking out, a
   * guest reviewing what they bought, a house that does not exist yet, a
   * visitor browsing, somebody asking for a sign-in code before they are signed
   * in — has to write exactly one thing, and every other policy is keyed on an
   * identity they do not have.
   *
   * `app.actor_role()` reads a free-text GUC and accepts any string, so a role
   * misspelled here would produce policies that silently never match rather
   * than an error. That is why this union is closed.
   */
  readonly role:
    | 'anon' | 'customer' | 'seller' | 'platform'
    | 'checkout' | 'aftercare' | 'intake' | 'analytics' | 'identity';
  /** The Supabase auth user id. Null for anonymous traffic. */
  readonly id: string | null;
}

export const ANONYMOUS: ActorContext = { role: 'anon', id: null };

/** A request id is a UUID or it is not a request id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Unit of Work over a real transaction, carrying the actor.
 *
 * Two jobs, and the second is easy to forget:
 *
 *  1. Order + sub-orders + line items commit together or not at all. A partially
 *     written multi-seller order is unrecoverable — a house sees work it is not
 *     paid for, and the customer's total reconciles to nothing.
 *
 *  2. It sets `app.actor_role` and `app.actor_id` inside the transaction, which
 *     is what makes the RLS policies in 0002 apply to THIS request. Without it
 *     every policy evaluates against an empty actor and the isolation proved in
 *     rls.test.ts does nothing in production. `set_config(..., true)` scopes the
 *     setting to the transaction, so it cannot leak to the next request sharing
 *     the connection.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(
    private readonly db: DiyarDatabase,
    private readonly actor: ActorContext = ANONYMOUS,
    /**
     * The unprivileged role every request runs as.
     *
     * Postgres NEVER applies row-level security to a superuser, or to a role
     * with BYPASSRLS — whatever the policies say and whatever GUCs are set. A
     * pool that happens to connect as the owner therefore bypasses every policy
     * in 0002 silently, and an API test caught exactly that: one house
     * successfully confirmed a competitor's sub-order.
     *
     * In Supabase this is `authenticated`/`anon`; here it is `app_user`, created
     * in 0002. Setting it per transaction means the guarantee holds no matter
     * which role the connection pool was opened with.
     */
    private readonly databaseRole: string = 'app_user',
    /**
     * Which request this work belongs to (task P1.4.3).
     *
     * A SOURCE, resolved inside `transaction()`, because the composition root
     * builds its Units of Work synchronously and the request id comes from a
     * header that Next only gives up asynchronously. Set as `app.request_id`
     * beside the actor, and migration 0029's column default stamps it on every
     * audit entry the transaction writes — no router has to remember it.
     */
    private readonly requestId: () => Promise<string | null> = async () => null,
  ) {}

  /** A view of the same database as a different actor, in the same request. */
  as(actor: ActorContext): DrizzleUnitOfWork {
    return new DrizzleUnitOfWork(this.db, actor, this.databaseRole, this.requestId);
  }

  async transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Executor;
      // Order matters: set the actor while still privileged, then drop the role.
      await t.execute(sql`SELECT set_config('app.actor_role', ${this.actor.role}, true)`);
      await t.execute(sql`SELECT set_config('app.actor_id', ${this.actor.id ?? ''}, true)`);
      /*
       * Only a well-formed UUID is ever set. The audit column casts it, so a
       * malformed value would not be a bad log line — it would make every audit
       * write in this transaction FAIL, and the trail would start refusing to
       * record decisions. Anything else is treated as "no request".
       */
      const requestId = await this.requestId();
      if (requestId && UUID.test(requestId)) {
        await t.execute(sql`SELECT set_config('app.request_id', ${requestId}, true)`);
      }
      await t.execute(sql.raw(`SET LOCAL ROLE ${this.databaseRole}`));
      return work(repositoriesFor(t));
    });
  }
}
