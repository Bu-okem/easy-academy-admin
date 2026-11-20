/**
 * Tells Convex which identity provider to trust.
 *
 * CLERK_JWT_ISSUER_DOMAIN is set on the Convex deployment, not in .env.local:
 *
 *   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
 *
 * It is the "Issuer" of a Clerk JWT template named `convex`.
 *
 * With it unset the provider list is empty, which is a deliberate state rather
 * than a broken one: no request can ever be authenticated, so every guarded
 * function refuses unless DEV_UNAUTHENTICATED_ROLE has been set to open the
 * deployment on purpose. Naming the variable unconditionally would instead stop
 * the project deploying at all before Clerk is provisioned.
 */
/**
 * Convex requires every variable named here to exist on the deployment, even
 * inside a conditional, so it is set to `unset` until Clerk is provisioned. That
 * sentinel is treated as no provider at all - preferable to a plausible-looking
 * issuer that could never verify a token.
 */
const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN
const configured = issuerDomain && issuerDomain !== 'unset'

export default {
  providers: configured ? [{ domain: issuerDomain, applicationID: 'convex' }] : [],
}
