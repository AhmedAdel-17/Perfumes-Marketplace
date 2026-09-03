import { router } from '../trpc';
import { cartRouter } from './cart';
import { catalogueRouter } from './catalogue';
import { sellerRouter } from './seller';

export const appRouter = router({
  cart: cartRouter,
  catalogue: catalogueRouter,
  seller: sellerRouter,
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
