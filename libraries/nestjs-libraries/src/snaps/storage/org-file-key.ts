import { createHash } from 'crypto';

/**
 * Turns an organisation id into a file-name-safe key for the snaps JSON stores.
 *
 * Every store built this with `organizationId.replace(/[^a-zA-Z0-9_-]/g, '_')`,
 * which is not injective: "org.1" and "org_1" both become "org_1", so two
 * organisations would read and write one file. Measured directly - records
 * written under one id came back under the other.
 *
 * Organisation ids are UUIDs today (`@default(uuid())`), and those contain only
 * hex digits and hyphens, so nothing is replaced and the collision cannot
 * happen. That is a property of the Prisma schema, though, a long way from
 * here: an imported id, a slug, or a different id strategy would turn this into
 * a silent cross-tenant leak.
 *
 * An id that needs no escaping keeps exactly the name it has today, so existing
 * deployments keep reading their existing files. Only an id that actually got
 * rewritten gains a digest of the original to tell it apart.
 */
export function snapsOrgFileKey(organizationId: string): string {
  const raw = String(organizationId ?? '');
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (safe === raw) {
    return safe;
  }
  return `${safe}-${createHash('sha256').update(raw).digest('hex').slice(0, 8)}`;
}
