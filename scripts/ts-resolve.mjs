// Lets Node import the app's extensionless relative specifiers (`./date`) by
// retrying them as `./date.ts`. Metro resolves these at build time; Node's ESM
// resolver does not, so the check scripts need this hook to load src modules.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // Fall through to the default resolution and let it report the error.
    }
  }
  return next(specifier, context);
}
