import { router } from '../trpc';
import { analyticsRouter } from './analytics';
import { applicationsRouter } from './applications';
import { auditRouter } from './audit';
import { cartRouter } from './cart';
import { catalogueRouter } from './catalogue';
import { contentRouter } from './content';
import { contentImagesRouter } from './content-images';
import { glossaryRouter } from './glossary';
import { insightsRouter } from './insights';
import { listingsRouter } from './listings';
import { ordersRouter } from './orders';
import { photosRouter } from './photos';
import { platformRouter } from './platform';
import { returnsRouter } from './returns';
import { reviewsRouter } from './reviews';
import { sellerRouter } from './seller';
import { siteRouter } from './site';
import { supportRouter } from './support';

export const appRouter = router({
  analytics: analyticsRouter,
  applications: applicationsRouter,
  audit: auditRouter,
  cart: cartRouter,
  catalogue: catalogueRouter,
  content: contentRouter,
  contentImages: contentImagesRouter,
  glossary: glossaryRouter,
  insights: insightsRouter,
  listings: listingsRouter,
  orders: ordersRouter,
  photos: photosRouter,
  platform: platformRouter,
  returns: returnsRouter,
  reviews: reviewsRouter,
  seller: sellerRouter,
  site: siteRouter,
  support: supportRouter,
});

export type AppRouter = typeof appRouter;

/**
 * The server-side caller type, named HERE so consumers never have to.
 *
 * Without this a workspace app that calls `appRouter.createCaller` gets
 * TS2742: the inferred type reaches into a tRPC internal .d.ts that resolves
 * inside THIS package's node_modules and is unnameable from anywhere else under
 * pnpm's strict layout. Exporting the alias keeps that detail where it belongs.
 */
export type ApiCaller = ReturnType<typeof appRouter.createCaller>;
