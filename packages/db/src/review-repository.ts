/**
 * Reviews, on Drizzle.
 *
 * THE INSERT IS A SELECT. `record` does not look an order up, read a customer
 * id out of the result and pass it back down to a second statement — it writes
 * `INSERT INTO reviews ... SELECT ... WHERE reference = $1 AND contact_phone = $2`,
 * so every column that establishes identity is derived by the database from the
 * two factors, in the same statement that writes the row.
 *
 * That is the difference between a rule and a habit. The two-statement version
 * has a comparison in the middle of it, and a comparison is a step a later
 * refactor can drop — which is exactly how the first version of order lookup
 * came to accept any phone. Here there is nothing to drop: a line item that
 * does not belong to that order matches no row, and the insert affects none.
 *
 * The database then checks the same thing again from the other side. Migration
 * 0015's trigger refuses any review whose customer is not the buyer, whose
 * product is not the one on the line, or whose sub-order was never delivered.
 * Two independent mechanisms, neither relying on the other being right.
 */
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import {
  publicAuthorName, summarise,
  type ModeratedReview, type PublishedReview, type Ratings,
  type ReviewRepository, type ReviewSummary, type ReviewableLine,
} from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

/**
 * The six columns, in one place.
 *
 * Named here rather than spelled out at each call site because there are four
 * of those, and a dimension added to the domain and forgotten in one of them
 * would silently average five things while claiming to average six.
 */
const RATING_COLUMNS_SELECT = {
  ratingScent: schema.reviews.ratingScent,
  ratingLongevity: schema.reviews.ratingLongevity,
  ratingProjection: schema.reviews.ratingProjection,
  ratingValue: schema.reviews.ratingValue,
  ratingPackaging: schema.reviews.ratingPackaging,
  ratingDescriptionAccuracy: schema.reviews.ratingDescriptionAccuracy,
} as const;

interface RatingRow {
  readonly ratingScent: number;
  readonly ratingLongevity: number;
  readonly ratingProjection: number;
  readonly ratingValue: number;
  readonly ratingPackaging: number;
  readonly ratingDescriptionAccuracy: number;
}

const toRatings = (row: RatingRow): Ratings => ({
  scent: row.ratingScent,
  longevity: row.ratingLongevity,
  projection: row.ratingProjection,
  value: row.ratingValue,
  packaging: row.ratingPackaging,
  descriptionAccuracy: row.ratingDescriptionAccuracy,
});

/**
 * Averaging happens in the DOMAIN, not in SQL.
 *
 * `avg()` per column would be one round trip and would also be a second
 * implementation of a rule the domain already states — and the two would drift
 * the first time a dimension is added or weighted. The number of visible
 * reviews on one perfume is small by construction, so the cost of reading them
 * is a cost worth paying to keep one definition of an average.
 */
const summariseRows = (rows: readonly RatingRow[]): ReviewSummary =>
  summarise(rows.map(toRatings));

/**
 * A raw statement that returns rows.
 *
 * `PgDatabase` is typed against the DRIVER's result type, which is deliberately
 * unresolved here so the same adapter serves PGlite in tests and postgres-js in
 * production — so `execute` hands back `unknown`. The shape is fixed by the
 * RETURNING list at the call site and asserted by the contract running on a
 * real database, which is where a mismatch would actually be caught; a cast
 * that pretended otherwise at every call site would be the same lie repeated.
 */
const execute = async <T>(db: DiyarDatabase, statement: SQL): Promise<readonly T[]> => {
  const result = await db.execute(statement) as { rows?: readonly T[] } | readonly T[];
  // node-postgres and PGlite return `{ rows }`; some drivers return the array.
  return Array.isArray(result) ? result : (result as { rows?: readonly T[] }).rows ?? [];
};

export const reviewRepository = (db: DiyarDatabase): ReviewRepository => ({
  async listReviewable({ reference, phone }) {
    /*
     * Both factors in the WHERE clause, and `state = 'delivered'` beside them.
     *
     * The delivered predicate is not politeness: migration 0001's trigger
     * refuses an insert against anything else, so a form offered for an
     * undelivered line is a form that throws after the customer has written
     * three paragraphs into it.
     */
    const rows = await db
      .select({
        lineItemId: schema.orderLineItems.id,
        productId: schema.orderLineItems.productId,
        productSlug: schema.products.slug,
        productName: schema.orderLineItems.productName,
        brandName: schema.orderLineItems.brandName,
        volumeMl: schema.orderLineItems.volumeMl,
        reviewId: schema.reviews.id,
      })
      .from(schema.orderLineItems)
      .innerJoin(schema.subOrders, eq(schema.subOrders.id, schema.orderLineItems.subOrderId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.subOrders.orderId))
      .innerJoin(schema.products, eq(schema.products.id, schema.orderLineItems.productId))
      .leftJoin(schema.reviews, eq(schema.reviews.lineItemId, schema.orderLineItems.id))
      .where(and(
        eq(schema.orders.reference, reference),
        eq(schema.orders.contactPhone, phone),
        eq(schema.subOrders.state, 'delivered'),
      ))
      .orderBy(schema.orderLineItems.createdAt);

    return rows.map((r): ReviewableLine => ({
      lineItemId: r.lineItemId,
      productId: r.productId,
      productSlug: r.productSlug,
      productName: r.productName,
      brandName: r.brandName,
      volumeMl: r.volumeMl,
      reviewed: r.reviewId !== null,
    }));
  },

  async record({ reference, phone, lineItemId, ratings, body, incentiveDisclosed, now }) {
    const trimmed = (body ?? '').trim();

    /*
     * The byline, resolved under the SAME predicate and masked by the domain.
     *
     * A read before the write, and deliberately not an authorisation step: if
     * this finds nothing the insert below inserts nothing either, because it
     * carries the identical WHERE clause. Nothing here compares a value the
     * caller supplied against one it read, which is the property the whole
     * module is built around.
     *
     * It exists because the mask is a rule, not a string operation — see
     * `publicAuthorName` — and a rule implemented once in TypeScript and again
     * in SQL is a rule that eventually says two things.
     */
    const [buyer] = await execute<{ contact_name: string }>(db, sql`
      SELECT o.contact_name
      FROM order_line_items li
      JOIN sub_orders s ON s.id = li.sub_order_id
      JOIN orders o     ON o.id = s.order_id
      WHERE li.id = ${lineItemId}
        AND o.reference = ${reference}
        AND o.contact_phone = ${phone}
        AND s.state = 'delivered'
    `);
    const authorLabel = publicAuthorName(buyer?.contact_name ?? null);

    /*
     * INSERT ... SELECT. Read the module header before changing this.
     *
     * `ON CONFLICT DO NOTHING` covers the unique index on `line_item_id`: a
     * customer who double-taps has done nothing wrong, and the second attempt
     * must not overwrite the first review with a blank body. It returns no row,
     * which the caller reports as the same undifferentiated null it gives for
     * a line item belonging to somebody else — telling those two apart would
     * let a prober learn which line items exist.
     */
    const inserted = await execute<{ id: string; slug: string }>(db, sql`
      WITH written AS (
        INSERT INTO reviews (
          sub_order_id, line_item_id, product_id, customer_id,
          rating_scent, rating_longevity, rating_projection,
          rating_value, rating_packaging, rating_description_accuracy,
          body, author_label, incentive_disclosed, created_at
        )
        SELECT
          li.sub_order_id, li.id, li.product_id, o.customer_id,
          ${ratings.scent}, ${ratings.longevity}, ${ratings.projection},
          ${ratings.value}, ${ratings.packaging}, ${ratings.descriptionAccuracy},
          ${trimmed.length === 0 ? null : trimmed}, ${authorLabel},
          ${incentiveDisclosed}, ${now}
        FROM order_line_items li
        JOIN sub_orders s ON s.id = li.sub_order_id
        JOIN orders o     ON o.id = s.order_id
        WHERE li.id = ${lineItemId}
          AND o.reference = ${reference}
          AND o.contact_phone = ${phone}
          AND s.state = 'delivered'
        ON CONFLICT (line_item_id) DO NOTHING
        RETURNING id, product_id
      )
      SELECT written.id, p.slug
      FROM written JOIN products p ON p.id = written.product_id
    `);

    const row = inserted[0];
    return row ? { id: row.id, productSlug: row.slug } : null;
  },

  async summaryFor(productId) {
    const rows = await db.select(RATING_COLUMNS_SELECT)
      .from(schema.reviews)
      .where(and(
        eq(schema.reviews.productId, productId),
        // Doc 06 §10: hidden reviews stay hidden — including from the average,
        // which would otherwise keep punishing a house for something the
        // platform decided nobody should read.
        isNull(schema.reviews.hiddenAt),
      ));
    return summariseRows(rows);
  },

  async summariesFor(productIds) {
    // `IN ()` is a syntax error in Postgres, and a grid with no tiles must ask
    // for nothing rather than for everything.
    if (productIds.length === 0) return new Map();

    const rows = await db.select({
      productId: schema.reviews.productId,
      ...RATING_COLUMNS_SELECT,
    })
      .from(schema.reviews)
      .where(and(
        inArray(schema.reviews.productId, [...productIds]),
        isNull(schema.reviews.hiddenAt),
      ));

    const grouped = new Map<string, RatingRow[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.productId) ?? [];
      bucket.push(row);
      grouped.set(row.productId, bucket);
    }

    const out = new Map<string, ReviewSummary>();
    for (const [id, bucket] of grouped) out.set(id, summariseRows(bucket));
    return out;
  },

  async listForProduct({ productId, limit }) {
    const rows = await db.select({
      id: schema.reviews.id,
      body: schema.reviews.body,
      createdAt: schema.reviews.createdAt,
      authorLabel: schema.reviews.authorLabel,
      ...RATING_COLUMNS_SELECT,
    })
      .from(schema.reviews)
      // NO JOIN. `customers` has no policy for anonymous traffic and must not
      // have one; joining it here returned zero rows to every visitor and hid
      // the whole reviews section on the shopfront.
      .where(and(
        eq(schema.reviews.productId, productId),
        isNull(schema.reviews.hiddenAt),
      ))
      .orderBy(desc(schema.reviews.createdAt))
      .limit(limit);

    return rows.map((r): PublishedReview => ({
      id: r.id,
      ratings: toRatings(r),
      body: r.body,
      // The DOMAIN's masking rule, called here and in the in-memory adapter.
      // A rule that exists in one implementation leaks from the other.
      // Masked when it was written, so nothing here has to remember to.
      authorName: r.authorLabel,
      createdAt: r.createdAt,
    }));
  },

  async listForModeration({ limit }) {
    const rows = await db.select({
      id: schema.reviews.id,
      body: schema.reviews.body,
      createdAt: schema.reviews.createdAt,
      hiddenAt: schema.reviews.hiddenAt,
      moderationNote: schema.reviews.moderationNote,
      authorLabel: schema.reviews.authorLabel,
      productId: schema.reviews.productId,
      productSlug: schema.products.slug,
      productName: schema.orderLineItems.productName,
      brandName: schema.orderLineItems.brandName,
      ...RATING_COLUMNS_SELECT,
    })
      .from(schema.reviews)
      .innerJoin(schema.products, eq(schema.products.id, schema.reviews.productId))
      .innerJoin(schema.orderLineItems, eq(schema.orderLineItems.id, schema.reviews.lineItemId))
      .orderBy(desc(schema.reviews.createdAt))
      .limit(limit);

    return rows.map((r): ModeratedReview => ({
      id: r.id,
      ratings: toRatings(r),
      body: r.body,
      authorName: r.authorLabel,
      createdAt: r.createdAt,
      productId: r.productId,
      productSlug: r.productSlug,
      productName: r.productName,
      brandName: r.brandName,
      hiddenAt: r.hiddenAt,
      moderationNote: r.moderationNote,
    }));
  },

  async hide({ id, note, moderatorId, now }) {
    /*
     * `hidden_at IS NULL` in the WHERE, not a read-then-check.
     *
     * Without it a second hide would overwrite the note explaining the first —
     * and that note is the record of why a piece of criticism was removed,
     * which is the only thing standing between moderation and suppression.
     */
    const updated = await db.update(schema.reviews)
      .set({
        hiddenAt: now,
        moderationNote: note.trim(),
        moderatedBy: moderatorId,
        moderatedAt: now,
      })
      .where(and(eq(schema.reviews.id, id), isNull(schema.reviews.hiddenAt)))
      .returning({ id: schema.reviews.id });

    return updated.length > 0;
  },

  async restore({ id, moderatorId, now }) {
    const updated = await db.update(schema.reviews)
      .set({
        hiddenAt: null,
        // The note STAYS. It is the record of a decision that was made and then
        // reversed, and erasing it would leave the reversal unexplained too.
        moderatedBy: moderatorId,
        moderatedAt: now,
      })
      .where(and(eq(schema.reviews.id, id), sql`${schema.reviews.hiddenAt} IS NOT NULL`))
      .returning({ id: schema.reviews.id });

    return updated.length > 0;
  },
});
