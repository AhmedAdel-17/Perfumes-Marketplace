export * as schema from './schema/index';
export * from './schema/index';
export * from './repositories';

/*
 * `./migrate` is deliberately NOT re-exported here.
 *
 * It resolves the migrations directory from `import.meta.dirname`, which is
 * undefined once webpack bundles a module for React Server Components — so
 * merely having it in this barrel threw at module load on every server render,
 * and the failure named a `path` argument rather than the migrations.
 *
 * Nothing at request time runs a migration, so the tooling is reachable at
 * `@diyar/db/migrate` and stays out of the application bundle entirely.
 */
