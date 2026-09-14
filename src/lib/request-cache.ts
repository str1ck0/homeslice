import * as React from 'react'

type AnyFunction = (...args: never[]) => unknown

/**
 * React's cache(): memoise a server function for the length of one request.
 *
 * Next.js renders the app with its own bundled React, which has cache(). Plain
 * Node — the unit suite — resolves the react 18 in node_modules, which does
 * not, and importing it by name there is undefined rather than an error until
 * the first call. Outside a request there is nothing to share anyway, so the
 * function is used as it is.
 */
export const requestCache: <T extends AnyFunction>(fn: T) => T =
  (React as unknown as { cache?: <T extends AnyFunction>(fn: T) => T }).cache ??
  ((fn) => fn)
