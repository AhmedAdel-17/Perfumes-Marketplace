/**
 * The HTTP boundary (WORK_PLAN 11.1).
 *
 * WHAT THIS PROVES, and why none of it can be proved by the other API tests:
 * every existing test calls `appRouter.createCaller(ctx)` and therefore never
 * crosses a transport at all. The claim this file exists to defend is that the
 * mobile apps get the SAME answers as the web app — not a similar shape, the
 * same bytes — and that the cross-origin policy refuses before the router runs
 * rather than after.
 *
 * It does NOT boot Next. `handleTrpcRequest` takes a Request and returns a
 * Response, so the whole boundary is testable with the standard web types and
 * a real Postgres underneath. The Next route on top of it is composition: three
 * lines and a context factory.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '@diyar/domain';
import { DrizzleUnitOfWork, schema, type ActorContext, type DiyarDatabase } from '@diyar/db';
import { applyMigrations } from '@diyar/db/migrate';
import { appRouter } from './routers/index';
import { corsHeaders, handleTrpcRequest, originVerdict, parseAllowedOrigins, TRPC_ENDPOINT } from './http';
import type { ApiContext } from './trpc';
import { testMediaStore } from './testing/media';

const CLOCK = new FixedClock(new Date('2026-09-16T09:00:00Z'));
const MEDIA = testMediaStore();
const PLATFORM = '99999999-9999-9999-9999-999999999999';
const STAFF = '11111111-1111-1111-1111-111111111111';

/** The origin this server believes it is served from. */
const SELF = 'http://localhost:3100';
/** A browser on another domain that configuration has allowed. */
const ALLOWED = 'https://studio.diyar.test';
/** A browser on another domain that has not been allowed. */
const STRANGER = 'https://evil.example';

const ALLOWED_ORIGINS = [ALLOWED];

let pg: PGlite;
let db: DiyarDatabase;
let productSlug: string;

/**
 * How many times a context was built.
 *
 * This is the instrument for the claim that a refused origin's request does not
 * happen. A 403 on its own proves only that the ANSWER was withheld — the
 * ordinary CORS behaviour, which runs the work and then hides the reply. A 403
 * with this counter unmoved proves the database was never opened.
 */
let contextsBuilt = 0;

const ANON: ActorContext = { role: 'anon', id: null };

function context(actor: ActorContext = ANON): ApiContext {
  return {
    actor,
    sellerId: null,
    platformStaffId: null,
    platformRole: null,
    platformLabel: null,
    uow: new DrizzleUnitOfWork(db, actor),
    checkoutUow: new DrizzleUnitOfWork(db, { role: 'checkout', id: null }),
    aftercareUow: new DrizzleUnitOfWork(db, { role: 'aftercare', id: null }),
    intakeUow: new DrizzleUnitOfWork(db, { role: 'intake', id: null }),
    analyticsUow: new DrizzleUnitOfWork(db, { role: 'analytics', id: null }),
    media: MEDIA,
    // This suite does not run payouts; the switch is on so it behaves as development.
    payoutsEnabled: true,
    clock: CLOCK,
  };
}

/** A GET in the shape a tRPC client actually sends: procedure in the path, input as JSON. */
function query(procedure: string, input: unknown, origin: string | null): Request {
  const url = `${SELF}${TRPC_ENDPOINT}/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
  return new Request(url, { headers: origin ? { origin } : {} });
}

function send(request: Request): Promise<Response> {
  return handleTrpcRequest({
    request,
    allowedOrigins: ALLOWED_ORIGINS,
    createContext: async () => {
      contextsBuilt += 1;
      return context();
    },
  });
}

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
  await pg.query(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'مشغّلة المنصّة','01000000001','admin')`, [PLATFORM]);

  const seller = await pg.query<{ id: string }>(
    `INSERT INTO sellers (trading_name,owner_name,slug,status)
     VALUES ('دار الورد','مالك','dar-al-ward','live') RETURNING id`);
  const sellerId = seller.rows[0]!.id;
  await pg.query(
    `INSERT INTO seller_staff (seller_id,auth_user_id,role,full_name) VALUES ($1,$2,'owner','مالك')`,
    [sellerId, STAFF]);

  const brand = await pg.query<{ id: string }>(
    `INSERT INTO brands (seller_id,name,slug) VALUES ($1,'دار الورد','dar-al-ward-b') RETURNING id`,
    [sellerId]);

  productSlug = 'dar-al-ward-product';
  const product = await pg.query<{ id: string }>(
    `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock,status,
       concentration,form,gender_positioning,scent_family,notes_top,notes_heart,notes_base,
       seasons,occasions,day_night,projection_band,longevity_band,performance_source,
       responsible_party_name,return_eligibility,defect_route)
     VALUES ($1,$2,'عطر',$3,'SKU-WARD',38000,50,25,'draft',
       'eau_de_parfum','spray','women','floral',ARRAY['برغموت'],ARRAY['ورد'],ARRAY['مسك'],
       ARRAY['spring']::season[],ARRAY['daily']::occasion[],'both','moderate','long','seller_provided',
       'دار الورد','sealed_only','استلام') RETURNING id`,
    [sellerId, brand.rows[0]!.id, productSlug]);

  // A verified primary at a real key — the 0024 publish gate refuses anything
  // whose facts the server never read, and the seeded catalogue learned that
  // the hard way in the September pass.
  await pg.query(
    `INSERT INTO product_media (product_id,storage_path,alt_text,is_primary,ownership_confirmed,
       content_type,byte_size,width,height)
     VALUES ($1,$2,'زجاجة',true,true,'image/jpeg',180000,1000,1250)`,
    [product.rows[0]!.id, `products/${product.rows[0]!.id}/${'a'.repeat(24)}.jpg`]);
  await pg.query(`UPDATE products SET status='published' WHERE id=$1`, [product.rows[0]!.id]);

  await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);
}, 180_000);

afterAll(async () => { await pg?.close(); });

describe('the wire answers exactly what the in-process caller answers', () => {
  it('returns the same perfume over HTTP as through createCaller', async () => {
    /*
     * THE POINT OF 11.1, in one assertion.
     *
     * The web app reaches the router in this process; the apps reach it over a
     * network. If those two ever disagree the marketplace has two prices, two
     * stock counts and two delivery promises — the September pass found exactly
     * that shape of defect between two screens, and this is the same mistake
     * with a transport in the middle instead of a formula.
     */
    const direct = await appRouter.createCaller(context()).catalogue.productBySlug({
      slug: productSlug,
    });

    const response = await send(query('catalogue.productBySlug', { slug: productSlug }, SELF));
    expect(response.status).toBe(200);

    const body = await response.json() as { result: { data: unknown } };
    expect(body.result.data).toEqual(direct);
    // Not merely equal in shape: the perfume is really there.
    expect(direct).toMatchObject({ slug: productSlug, pricePiastres: 38_000, inStock: true });
  });

  it('maps a refusal to its Arabic sentence over the wire too', async () => {
    // A slug that cannot pass validation. The Arabic mapping lives in a tRPC
    // middleware, and a middleware that works in-process and not over HTTP is
    // precisely the kind of gap a transport introduces.
    const response = await send(query('catalogue.productBySlug', { slug: 'ABC DEF' }, SELF));

    expect(response.status).toBe(400);
    const body = await response.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/[؀-ۿ]/);
  });
});

describe('who may call this from a browser', () => {
  it('answers a same-origin request without advertising cross-origin access', async () => {
    const response = await send(query('catalogue.productBySlug', { slug: productSlug }, SELF));

    expect(response.status).toBe(200);
    // The web app is same-origin and needs no header. Sending one anyway would
    // grant an origin we were never asked to grant.
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers an allowlisted origin, naming that origin and never a wildcard', async () => {
    const response = await send(query('catalogue.productBySlug', { slug: productSlug }, ALLOWED));

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('never allows credentials, so no cross-origin caller can ride on a cookie', async () => {
    const response = await send(query('catalogue.productBySlug', { slug: productSlug }, ALLOWED));

    /*
     * The whole reason cross-site request forgery is impossible on this surface
     * rather than merely mitigated. If this header ever appears, a browser will
     * attach the seller's session cookie to another site's request and the
     * endpoint becomes forgeable — with nothing else in the system changing.
     */
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('refuses a stranger BEFORE the router runs, not after', async () => {
    const before = contextsBuilt;
    const response = await send(query('catalogue.productBySlug', { slug: productSlug }, STRANGER));

    expect(response.status).toBe(403);
    // The evidence that nothing happened: no context was built, so no database
    // connection was opened and no procedure executed. A 403 alone would only
    // prove the answer was withheld.
    expect(contextsBuilt).toBe(before);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('is the refusal that stops the stranger, and nothing else', async () => {
    /*
     * The control test for the one above.
     *
     * "No context was built" is only evidence if a context WOULD have been
     * built had the origin been allowed — otherwise the counter might be
     * unmoved for some unrelated reason and the assertion would pass whatever
     * the policy did. Here the same request, from the same stranger, is sent
     * with that origin allowlisted: the counter moves and the answer is 200.
     * The two tests together distinguish the two worlds, which is what makes
     * either of them worth writing.
     */
    const before = contextsBuilt;
    const response = await handleTrpcRequest({
      request: query('catalogue.productBySlug', { slug: productSlug }, STRANGER),
      allowedOrigins: [STRANGER],
      createContext: async () => { contextsBuilt += 1; return context(); },
    });

    expect(response.status).toBe(200);
    expect(contextsBuilt).toBe(before + 1);
    expect(response.headers.get('access-control-allow-origin')).toBe(STRANGER);
  });

  it('allows a caller that sends no Origin at all — a native app is not a browser', async () => {
    const response = await send(query('catalogue.productBySlug', { slug: productSlug }, null));

    expect(response.status).toBe(200);
  });

  it('varies on Origin for every answer, including the ones it does not decorate', async () => {
    // Without this a shared cache in front of the API can hand a reply computed
    // for one origin to another — a bug that appears only once something is put
    // in front of this, which is long after anyone is thinking about CORS.
    for (const origin of [SELF, ALLOWED, null]) {
      const response = await send(query('catalogue.productBySlug', { slug: productSlug }, origin));
      expect(response.headers.get('vary')).toBe('Origin');
    }
  });

  it('answers a preflight without touching the database', async () => {
    const before = contextsBuilt;
    const response = await handleTrpcRequest({
      request: new Request(`${SELF}${TRPC_ENDPOINT}/catalogue.productBySlug`, {
        method: 'OPTIONS',
        headers: { origin: ALLOWED },
      }),
      allowedOrigins: ALLOWED_ORIGINS,
      createContext: async () => { contextsBuilt += 1; return context(); },
    });

    expect(response.status).toBe(204);
    expect(contextsBuilt).toBe(before);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    // The tRPC clients send these on every batched call; omitting them fails the
    // preflight with an error that names CORS and not the header.
    expect(response.headers.get('access-control-allow-headers')).toContain('trpc-accept');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
  });
});

describe('the policy functions, directly', () => {
  it('reads an allowlist and ignores blank entries', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins(' https://a.test , , https://b.test ')).toEqual([
      'https://a.test', 'https://b.test',
    ]);
  });

  it('decides same-origin from the request itself, not from configuration', () => {
    // Requiring a deployment to list its own domain is a configuration step
    // whose only outcomes are "correct" and "the site is broken".
    const request = new Request(`${SELF}${TRPC_ENDPOINT}/x`, { headers: { origin: SELF } });
    expect(originVerdict(request, [])).toBe('same-origin');
  });

  it('separates absent, allowed and refused', () => {
    const at = (origin: string | null) =>
      originVerdict(
        new Request(`${SELF}${TRPC_ENDPOINT}/x`, { headers: origin ? { origin } : {} }),
        ALLOWED_ORIGINS,
      );

    expect(at(null)).toBe('absent');
    expect(at(ALLOWED)).toBe('allowed');
    expect(at(STRANGER)).toBe('refused');
  });

  it('decorates nothing for an origin it does not allow', () => {
    const request = new Request(`${SELF}${TRPC_ENDPOINT}/x`, { headers: { origin: STRANGER } });
    expect(corsHeaders(request, ALLOWED_ORIGINS)).toEqual({ vary: 'Origin' });
  });
});
