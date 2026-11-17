# Solid 2.0 official documentation — fetchable URLs

Canonical site: https://docs.solidjs.com/ — since the 2.0.0 release it serves
the Solid 2.0 documentation, every page as plain markdown, so agents fetch it
directly.

- Full index: https://docs.solidjs.com/llms.txt
- Single-file corpus: https://docs.solidjs.com/llms-full.txt
- Any docs path works with a `.md` suffix.

Only trust these Solid 2.0 sources. Pre-2.0 Solid material (the 1.x docs and
tutorials) does not apply.

This list is curated for agent work: core TSX first, then the app-stack pages that
exist when a project has routing, server functions, or document head tags.
It is not every Advanced reference page. When an API is missing here, look it up
in `llms.txt` rather than guessing from Solid 1.x or React.

## Read before using

The skill does not cover these; fetch the pages when the task needs them.

- Filesystem routing (`fileRoutes({ types: true })` from `filesystem-routing/vite`, `[id]` / `[[p]]` / `[...rest]` / `(group)/` names, `defineFileRoute`): https://docs.solidjs.com/reference/filesystem-routing.md, https://docs.solidjs.com/reference/filesystem-routing/vite.md, https://docs.solidjs.com/reference/filesystem-routing/conventions.md, https://docs.solidjs.com/reference/filesystem-routing/manifest.md, https://docs.solidjs.com/reference/solid-router/filesystem.md
- A route array in its own file (`defineRoutes`, `RouteProps<typeof Router.paths.x>`, `matchFilters`): https://docs.solidjs.com/reference/solid-router/router-factory.md, https://docs.solidjs.com/reference/solid-router/routes-and-paths.md
- Layout routes, pathless routes, where router hooks may run: https://docs.solidjs.com/routing/solid-router/nested-routes.md
- Auth guards and redirect-after-sign-in (`next` validation): https://docs.solidjs.com/guides/protected-routes.md
- Unsaved-changes guard (`useBeforeLeave`): https://docs.solidjs.com/routing/solid-router/navigation.md, https://docs.solidjs.com/reference/solid-router/navigation.md
- Row selection without `createSelector` (id-keyed projection): https://docs.solidjs.com/guides/lists.md, https://docs.solidjs.com/guides/performance.md
- Infinite scroll, polling, sharing one request: https://docs.solidjs.com/guides/data-fetching-patterns.md
- Writing a custom primitive (called under an owner, `MaybeAccessor`, `getOwner` / `runWithOwner` / `isDisposed` after async): https://docs.solidjs.com/guides/custom-primitives.md, https://docs.solidjs.com/reference/solid-js/advanced/owner-introspection/get-owner.md, https://docs.solidjs.com/reference/solid-js/advanced/owner-introspection/run-with-owner.md, https://docs.solidjs.com/reference/solid-js/advanced/owner-introspection/is-disposed.md
- Library code that must know whether it is hydrating, or write a keyed server-to-client value (`isHydrating`, `isHydratable`, `getHydrationWriter` / `takeHydrationValue`): https://docs.solidjs.com/reference/solid-js/advanced/manual-hydration/is-hydrating.md, https://docs.solidjs.com/reference/solid-js/advanced/manual-hydration/is-hydratable.md, https://docs.solidjs.com/reference/solid-web/rendering-ssr/get-hydration-writer.md, https://docs.solidjs.com/reference/solid-web/rendering-ssr/take-hydration-value.md
- Wrapping a non-Solid library, push feeds with a reactive argument, web components (`prop:`, event names): https://docs.solidjs.com/guides/integrate-non-solid-code.md
- Typed env (`env.ts` schema, `VITE_` client keys), `import "server-only"`, what compiles `"use server"`: https://docs.solidjs.com/building-apps/environment.md, https://docs.solidjs.com/reference/vite-plugin-solid/modules.md, https://docs.solidjs.com/reference/vite-plugin-solid/server-functions.md
- Sessions and cookies (`parseCookieHeader` / `serializeCookie`, `RequestEventLocals` typing, when a cookie write commits): https://docs.solidjs.com/building-apps/sessions-and-auth.md, https://docs.solidjs.com/reference/solid-web/request-response/cookies.md
- Middleware chains and API routes / webhooks (`createAPIHandler`, `httpMethods: true`): https://docs.solidjs.com/building-apps/middleware-and-api-routes.md, https://docs.solidjs.com/reference/filesystem-routing/api.md
- Auth headers for every call, per-call `signal` / `keepalive` (`configureServerFunctionsClient`, `invoke`): https://docs.solidjs.com/building-apps/server-functions/metadata-and-transport.md, https://docs.solidjs.com/reference/solid-web/server-functions/configure-client.md, https://docs.solidjs.com/reference/solid-web/server-functions/invoke.md
- Server-function limits (`bodySizeLimit`, `maxArguments`): https://docs.solidjs.com/reference/solid-web/server-functions/host-configuration.md
- Static prerendering (`prerender-crawler/vite`, `prerendered()`), choosing client / SSR / prerender: https://docs.solidjs.com/guides/choose-a-rendering-mode.md
- SSR-safe code (what runs on the server, hydration mismatches): https://docs.solidjs.com/guides/ssr-safe-code.md
- Type helpers (`VoidProps`, `FlowProps`, `ComponentProps<"button">`, `JSX.EventHandler`, generic `<T,>` components): https://docs.solidjs.com/guides/typescript.md, https://docs.solidjs.com/reference/solid-js/types/component-types.md, https://docs.solidjs.com/reference/solid-js/types/reactive-types.md, https://docs.solidjs.com/reference/solid-js/types/jsx-types.md
- Head tag identity (OG `property`, `key`, layout `<Head>` groups): https://docs.solidjs.com/building-apps/head-and-metadata.md
- Server-side tests (`createRequestEvent`, `provideRequestEvent` from `@solidjs/web/storage`, a Node Vitest project): https://docs.solidjs.com/guides/testing.md, https://docs.solidjs.com/reference/solid-web/request-response/provide-request-event.md
- Migrating 1.x data fetching (`createResource`, `resource.latest`): https://docs.solidjs.com/migration/data-fetching-from-solid-1.md
- Terms used across the docs: https://docs.solidjs.com/glossary.md; the mental model: https://docs.solidjs.com/guides/thinking-in-solid.md

## Getting started

- https://docs.solidjs.com/getting-started/quick-start.md
- https://docs.solidjs.com/getting-started/project-shapes.md

## Concepts

- https://docs.solidjs.com/concepts/reactivity.md
- https://docs.solidjs.com/concepts/stores.md
- https://docs.solidjs.com/concepts/components-and-jsx.md
- https://docs.solidjs.com/concepts/async-reactivity.md
- https://docs.solidjs.com/concepts/boundaries.md
- https://docs.solidjs.com/concepts/mutations.md
- https://docs.solidjs.com/concepts/rendering-and-ssr.md

## Building apps (start mode / fullstack)

Use these when the project has `@solidjs/vite-plugin` start mode, SSR, or server
functions. Do not invent Next.js / SolidStart 1.x equivalents.

- https://docs.solidjs.com/building-apps/app-structure.md
- https://docs.solidjs.com/building-apps/styling-and-assets.md
- https://docs.solidjs.com/building-apps/head-and-metadata.md
- https://docs.solidjs.com/building-apps/server-functions.md
- https://docs.solidjs.com/building-apps/server-functions/reads-and-live-data.md
- https://docs.solidjs.com/building-apps/server-functions/arguments-and-security.md
- https://docs.solidjs.com/building-apps/server-functions/mutations-and-responses.md
- https://docs.solidjs.com/building-apps/server-functions/metadata-and-transport.md
- https://docs.solidjs.com/building-apps/server-functions/progressive-enhancement.md
- https://docs.solidjs.com/building-apps/sessions-and-auth.md
- https://docs.solidjs.com/building-apps/environment.md
- https://docs.solidjs.com/building-apps/middleware-and-api-routes.md
- https://docs.solidjs.com/building-apps/deployment.md

## Routing

Routing is optional. If `@solidjs/router` or TanStack Router is in the project,
read these before writing route JSX.

- https://docs.solidjs.com/routing/overview.md
- https://docs.solidjs.com/routing/solid-router.md
- https://docs.solidjs.com/routing/solid-router/setup.md
- https://docs.solidjs.com/routing/solid-router/route-definitions.md
- https://docs.solidjs.com/routing/solid-router/nested-routes.md
- https://docs.solidjs.com/routing/solid-router/navigation.md
- https://docs.solidjs.com/routing/solid-router/data.md
- https://docs.solidjs.com/routing/solid-router/server-rendering.md
- https://docs.solidjs.com/routing/tanstack.md

## Guides and migration

- https://docs.solidjs.com/guides/avoid-unnecessary-effects.md
- https://docs.solidjs.com/guides/state-management.md
- https://docs.solidjs.com/guides/debugging-reactivity.md
- https://docs.solidjs.com/guides/performance.md
- https://docs.solidjs.com/guides/observability.md
- https://docs.solidjs.com/guides/observability-adapters.md
- https://docs.solidjs.com/guides/lists.md
- https://docs.solidjs.com/guides/data-fetching-patterns.md
- https://docs.solidjs.com/guides/forms.md
- https://docs.solidjs.com/guides/testing.md
- https://docs.solidjs.com/migration/from-react.md
- https://docs.solidjs.com/migration/from-solid-1.md
- https://docs.solidjs.com/migration/from-solid-start.md
- https://docs.solidjs.com/migration/from-solid-router.md
- https://docs.solidjs.com/migration/from-solid-meta.md

## Design posts (Solid 2 async model)

Official Solid 2 blog series. Use these for *why* the colorless/async graph works;
verify API names against the reference pages above.

- https://www.solidjs.com/blog/solid-2-0-rc-the-big-reveal
- https://www.solidjs.com/blog/async-solid-fetch-high-block-low
- https://www.solidjs.com/blog/async-solid-write-sync-run-async
- https://www.solidjs.com/blog/async-solid-one-graph-two-machines

## Reference: reactivity (solid-js)

- https://docs.solidjs.com/reference/solid-js/reactivity/create-signal.md
- https://docs.solidjs.com/reference/solid-js/reactivity/create-memo.md
- https://docs.solidjs.com/reference/solid-js/reactivity/create-deferred.md
- https://docs.solidjs.com/reference/solid-js/reactivity/create-effect.md
- https://docs.solidjs.com/reference/solid-js/reactivity/create-optimistic.md
- https://docs.solidjs.com/reference/solid-js/reactivity/flush.md
- https://docs.solidjs.com/reference/solid-js/reactivity/is-pending.md
- https://docs.solidjs.com/reference/solid-js/reactivity/latest.md
- https://docs.solidjs.com/reference/solid-js/reactivity/untrack.md

## Reference: stores (solid-js)

- https://docs.solidjs.com/reference/solid-js/stores/create-store.md
- https://docs.solidjs.com/reference/solid-js/stores/create-optimistic-store.md
- https://docs.solidjs.com/reference/solid-js/stores/create-projection.md
- https://docs.solidjs.com/reference/solid-js/stores/reconcile.md
- https://docs.solidjs.com/reference/solid-js/stores/merge.md
- https://docs.solidjs.com/reference/solid-js/stores/omit.md

## Reference: lifecycle and actions (solid-js)

- https://docs.solidjs.com/reference/solid-js/lifecycle-actions/action.md
- https://docs.solidjs.com/reference/solid-js/lifecycle-actions/affects.md
- https://docs.solidjs.com/reference/solid-js/lifecycle-actions/on-settled.md
- https://docs.solidjs.com/reference/solid-js/lifecycle-actions/refresh.md
- https://docs.solidjs.com/reference/solid-js/lifecycle-actions/until.md
- https://docs.solidjs.com/reference/solid-js/advanced/specialized-reactivity/on-cleanup.md
- https://docs.solidjs.com/reference/solid-js/advanced/store-advanced/snapshot.md

## Reference: diagnostics, attribution, and observability

`DEV` is dev builds only; `OBSERVE` and attribution exist on observe and dev builds;
the error hooks fire on every build. Every diagnostic code has a page of its own —
`reference/solid-js/diagnostics/<code-in-kebab-case>.md` (for example
`.../diagnostics/silent-hold.md`), the page the console footer links on a code's first report.

- https://docs.solidjs.com/reference/solid-js/diagnostics.md

- https://docs.solidjs.com/reference/solid-js/advanced/diagnostics-dev-hooks/dev.md
- https://docs.solidjs.com/reference/solid-js/advanced/diagnostics-dev-hooks/observe.md
- https://docs.solidjs.com/reference/solid-js/advanced/diagnostics-dev-hooks/attribution.md
- https://docs.solidjs.com/reference/solid-js/advanced/diagnostics-dev-hooks/configure-client-errors.md
- https://docs.solidjs.com/reference/solid-web/request-response/configure-server-errors.md
- https://docs.solidjs.com/reference/solid-web/request-response/get-trace-context.md
- https://docs.solidjs.com/reference/solid-web/performance-tracks/enable-performance-tracks.md

## Reference: components and JSX (solid-js)

- https://docs.solidjs.com/reference/solid-js/components-jsx/show.md
- https://docs.solidjs.com/reference/solid-js/components-jsx/for.md
- https://docs.solidjs.com/reference/solid-js/components-jsx/repeat.md
- https://docs.solidjs.com/reference/solid-js/components-jsx/loading.md
- https://docs.solidjs.com/reference/solid-js/components-jsx/errored.md
- https://docs.solidjs.com/reference/solid-js/components-jsx/reveal.md
- https://docs.solidjs.com/reference/solid-js/components-jsx/switch-and-match.md
- https://docs.solidjs.com/reference/solid-js/components-context/create-context.md
- https://docs.solidjs.com/reference/solid-js/components-context/use-context.md
- https://docs.solidjs.com/reference/solid-js/components-context/children.md
- https://docs.solidjs.com/reference/solid-js/components-context/lazy.md
- https://docs.solidjs.com/reference/solid-js/components-context/create-unique-id.md
- https://docs.solidjs.com/reference/solid-js/advanced/manual-hydration/no-hydration.md

## Reference: @solidjs/web

- https://docs.solidjs.com/reference/solid-web/rendering-ssr/render.md
- https://docs.solidjs.com/reference/solid-web/rendering-ssr/hydrate.md
- https://docs.solidjs.com/reference/solid-web/rendering-ssr/render-to-string.md
- https://docs.solidjs.com/reference/solid-web/rendering-ssr/render-to-stream.md
- https://docs.solidjs.com/reference/solid-web/rendering-ssr/is-server.md
- https://docs.solidjs.com/reference/solid-web/rendering-ssr/is-dev.md
- https://docs.solidjs.com/reference/solid-web/rendering-ssr/client-only.md
- https://docs.solidjs.com/reference/solid-web/rendering-ssr/http-status.md
- https://docs.solidjs.com/reference/solid-web/rendering-ssr/http-header.md
- https://docs.solidjs.com/reference/solid-web/head/use-head.md
- https://docs.solidjs.com/reference/solid-web/components/portal.md
- https://docs.solidjs.com/reference/solid-web/components/dynamic.md
- https://docs.solidjs.com/reference/solid-web/jsx-properties/ref.md
- https://docs.solidjs.com/reference/solid-web/jsx-properties/class.md
- https://docs.solidjs.com/reference/solid-web/jsx-properties/style.md
- https://docs.solidjs.com/reference/solid-web/jsx-properties/text-content.md
- https://docs.solidjs.com/reference/solid-web/jsx-properties/inner-html.md
- https://docs.solidjs.com/reference/solid-web/server-functions.md
- https://docs.solidjs.com/reference/solid-web/server-functions/get.md
- https://docs.solidjs.com/reference/solid-web/server-functions/rich-arguments.md
- https://docs.solidjs.com/reference/solid-web/request-response.md
- https://docs.solidjs.com/reference/solid-web/request-response/get-request-event.md
- https://docs.solidjs.com/reference/solid-web/request-response/redirect.md
- https://docs.solidjs.com/reference/solid-web/request-response/reload.md
- https://docs.solidjs.com/reference/solid-web/request-response/respond.md

## Reference: @solidjs/router, @solidjs/meta, @solidjs/vite-plugin

- https://docs.solidjs.com/reference/solid-router.md
- https://docs.solidjs.com/reference/solid-router/router-factory.md
- https://docs.solidjs.com/reference/solid-router/routes-and-paths.md
- https://docs.solidjs.com/reference/solid-router/navigation.md
- https://docs.solidjs.com/reference/solid-router/data.md
- https://docs.solidjs.com/reference/solid-router/types.md
- https://docs.solidjs.com/reference/solid-router/history.md
- https://docs.solidjs.com/reference/solid-router/filesystem.md
- https://docs.solidjs.com/reference/solid-meta/title.md
- https://docs.solidjs.com/reference/solid-meta/meta.md
- https://docs.solidjs.com/reference/solid-meta/link.md
- https://docs.solidjs.com/reference/solid-meta/script.md
- https://docs.solidjs.com/reference/solid-meta/head.md
- https://docs.solidjs.com/reference/vite-plugin-solid.md
- https://docs.solidjs.com/reference/vite-plugin-solid/options.md
- https://docs.solidjs.com/reference/vite-plugin-solid/start.md
