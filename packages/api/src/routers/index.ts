import { router } from '../trpc';
import { catalogueRouter } from './catalogue';
import { sellerRouter } from './seller';

export const appRouter = router({
  catalogue: catalogueRouter,
  seller: sellerRouter,
});

export type AppRouter = typeof appRouter;
