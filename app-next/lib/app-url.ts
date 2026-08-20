/**
 * Base URL for links we hand to a human.
 *
 * Trimmed on purpose. The production value of NEXT_PUBLIC_APP_URL has carried a
 * trailing space, which put a literal space inside every link the product
 * generates: "Copy" on the Coaches page produced
 * "https://offpitchos.com /join/<token>", which breaks the moment it is pasted
 * into a message, and the same string went out in invite emails.
 *
 * Env vars are hand-typed strings. Treat them as untrusted input rather than
 * fixing one dashboard field and hoping nobody retypes it.
 */
export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return raw.trim().replace(/\/+$/, '')
}
