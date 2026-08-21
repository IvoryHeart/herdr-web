# Versioned Foundation-to-World surface composition

- **Spec ID:** `011-surface-composition`
- **Status:** In review
- **Created:** 2026-08-12
- **Revised:** 2026-08-21
- **Owner:** Herdr World Foundation / Herdr World
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

### Review reset 2026-08-21

The 2026-08-20 draft correctly reduced the design to trusted compile-time
composition, but it still assumed generic Web and World assemblies lived in one
repository. The owner has now selected immediate physical separation:
`herdr-world-foundation` publishes the host, generic shell, and public surface
contract; `herdr-world` consumes an exact version and contributes Office.

This revision keeps the existing typed registration, host ownership, cleanup,
capability admission, and error-containment requirements while making the seam
a real cross-repository package API.

## 1. Purpose

Today generic browser behavior and World orchestration meet inside the same
`App.tsx` and source graph. Merely moving files inside one repository cannot
prove that World is an independently maintained product or that Foundation can
track Herdr Web without importing Office.

This specification defines the smallest versioned package boundary needed for
Foundation to run by itself and for World to add trusted compiled surfaces. It
uses the existing bridge manager, multi-bridge profiles, federated runtime,
commands, and terminal services. It does not invent a runtime browser plugin
system.

## 2. Assemblies and package identities

```text
herdr-world-foundation repository
  @herdr-world/foundation
    shell + Spaces + bridge/runtime host + public surface API
  herdr-world-bridge
    host-local bridge executable
  Foundation conformance application
    shell + Spaces only

herdr-world repository
  herdr-world application
    @herdr-world/foundation + Office + future approved surfaces
```

The canonical npm package is `@herdr-world/foundation`. Registry publication
MAY be deferred: a content-addressed `npm pack` tarball is a valid initial
artifact. The surface API SHALL be exported from a documented public subpath
such as `@herdr-world/foundation/surfaces`; consumers MUST NOT import repository
source paths or unexported modules.

Foundation's package version and bridge release version SHALL be coordinated in
one Foundation compatibility record. World SHALL use an exact Foundation
version and integrity hash in its lockfile and assembly manifest.

## 3. Scope

This feature includes:

- a public, versioned TypeScript API binding each surface definition, context
  factory, lazy component, and cleanup function;
- a minimal `SurfaceHostV1` adapter over existing Foundation services;
- a Foundation conformance assembly containing Spaces but no World code;
- a World assembly that contributes Office only through the public package API;
- one optional assembly-owned product-settings contribution preserving Office
  settings without placing World imports in Foundation;
- exact route, surface-ID, API-version, and bridge-feature validation;
- host-owned commands, navigation, terminal sessions, and cancellation;
- route-local loading, unavailable, and error containment;
- package tarball, emitted-module, asset, and cross-repository tests; and
- characterization of current Spaces and Office behavior before extraction.

## 4. Non-goals

- No dynamic third-party JavaScript loading, browser marketplace, public plugin
  SDK, iframe/worker sandbox, hot installation, or remote module URL.
- No representation of Office as a Herdr runtime plugin.
- No replacement for bridge profiles, `/api/capabilities`, runtime polling,
  caches, generation keys, commands, or terminal WebSockets.
- No second capability catalogue or exact generic `GET /api/extensions` index;
  approved observability-specific child routes are unchanged by this spec.
- No generalized slot system, route grammar, policy language, or version
  negotiation protocol beyond one integer Foundation surface API version.
- No requirement for Foundation to understand Office, Graph, City,
  observability providers, or World branding.
- No Graph or City implementation in this work.

## 5. Terms and trust model

| Term | Meaning |
| --- | --- |
| Foundation | The independently versioned generic browser/bridge dependency derived from Herdr Web. |
| Surface | A trusted browser view compiled into a selected product assembly. |
| Registration | One typed value binding metadata, context creation, lazy code, and cleanup. |
| Host | A least-purpose API over Foundation-owned runtime, command, navigation, and terminal services. |
| Assembly | The compile-time list of surfaces and optional product settings for one application. |
| Conformance application | Foundation's runnable shell + Spaces proof, not the World product. |

Compiled surfaces execute in the same JavaScript realm and are trusted product
code. Public types, import audits, CSP, and least-purpose host adapters reduce
accidental authority; they are not a security sandbox.

## 6. Requirements

### Requirement: Publish one explicit surface API version

Foundation SHALL export a constant equivalent to:

```ts
export const FOUNDATION_SURFACE_API_VERSION = 1 as const;
```

The Foundation release manifest SHALL record that version. World SHALL declare
the same version in its assembly and fail at build time or application startup
with a clear diagnostic if they do not match. There is no range negotiation in
v1: World pins one exact Foundation package release and one exact surface API
version.

#### Scenario: World installs an incompatible Foundation tarball

- **GIVEN** World's assembly expects surface API `1`
- **WHEN** its dependency exposes another API version or no version
- **THEN** the build or startup fails before mounting Office and identifies the
  expected and observed package/API versions.

### Requirement: Bind each definition to its typed context and component

The public API SHALL preserve the following semantics; exact TypeScript names
may differ after review:

```ts
type SurfaceDefinition = {
  id: string;
  label: string;
  route: "/" | `/${string}`;
  semanticIcon: string;
  requiredBridgeFeatures: readonly string[];
};

type SurfaceRegistration<Context> = {
  definition: SurfaceDefinition;
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{
    default: React.ComponentType<{ context: Context }>;
  }>;
  dispose: (context: Context) => void | Promise<void>;
};
```

The registration generic MUST remain bound internally. A surface component
MUST NOT receive another surface's context through `unknown`, `any`, or an
unpaired cast. The host MAY erase the generic only behind an internal object
that keeps the context, component, and disposer from the same registration.

Each mount attempt SHALL have a fresh abort controller whose signal is exposed
through the generation's host adapter. Foundation SHALL complete `load` before
calling `createContext`, and SHALL call `createContext` at most once for that
generation. A load failure therefore owns no context and invokes no disposer.

If `createContext` throws before returning a context, Foundation SHALL abort
the generation and MUST NOT call `dispose` with a partial value. The factory
owns strong exception safety: before propagating, it MUST release every
subscription or resource acquired during that invocation. It MUST establish a
local cleanup guard before acquiring any non-abortable resource whose later
construction steps can fail. The abort signal is a backstop for abort-aware
work; it does not transfer ownership of a partial context to Foundation.

On navigation, admission loss, render failure, retry, or assembly teardown,
Foundation SHALL mark the generation closing, abort it, invoke its disposer
exactly once if context creation returned, and await the disposer promise's
settlement before starting a retry or replacement generation. A disposer
rejection SHALL be caught, reported through the route-local error boundary,
and treated as settled cleanup; it MUST NOT skip remaining host cleanup or tear
down unrelated services. Late load/context results from a closed generation
MUST be ignored. A delayed disposer keeps that registration in its explicit
closing state rather than allowing overlapping generations.

#### Scenario: Context creation partially succeeds and then throws

- **GIVEN** a registration has subscribed to one host service
- **WHEN** later context construction fails
- **THEN** the factory releases the partial subscription before propagating,
  Foundation aborts without passing a partial value to `dispose`, a route-local
  error renders, and Foundation polling and unrelated terminals remain active.

#### Scenario: A stale lazy import resolves after navigation

- **GIVEN** Office is loading and the user switches to Spaces
- **WHEN** the old import resolves
- **THEN** it is not mounted, no context is created for the closed generation,
  and Spaces remains the active surface.

#### Scenario: Async disposal is delayed or rejects

- **GIVEN** a mounted Office generation is being replaced
- **WHEN** its disposer remains pending and then either fulfills or rejects
- **THEN** no replacement context starts while it is pending, the disposer is
  invoked once, rejection is contained after settlement, and the fresh
  generation cannot overlap the old one.

### Requirement: Keep Foundation services authoritative

`SurfaceHostV1` SHALL be a read-only or allow-listed adapter over the existing
Foundation owners. It SHALL expose only the qualified semantic operations a
surface needs, including as applicable:

- available and enabled bridge runtimes with stable `bridgeId` identity;
- connection/capability state and retry through the existing bridge manager;
- qualified workspace, tab, pane, activity, and selection facts;
- allow-listed command dispatch;
- navigation to an existing qualified target; and
- host-managed terminal conversation acquisition and release.

All cross-host identity SHALL include `bridgeId`. Surface code MUST NOT create
raw Herdr sockets, duplicate polling loops, persist bridge profiles, construct
terminal WebSocket URLs, or assume pane IDs are globally unique.

Host subscriptions SHALL return cleanup functions and accept cancellation
where asynchronous work is possible. A surface may derive presentation state,
but Foundation remains authoritative for transport, availability, retry,
generation, command validation, and shared terminal fanout.

#### Scenario: Two hosts contain pane `1`

- **GIVEN** Office observes `(host-a, pane-1)` and `(host-b, pane-1)`
- **WHEN** it opens a conversation for the second agent
- **THEN** it asks the host for `(host-b, pane-1)` and cannot attach to the
  first pane by using the unqualified ID.

### Requirement: Keep commands and terminals host-owned

A registration SHALL request commands through a semantic, allow-listed host
API. Raw method names and arbitrary JSON payloads MUST NOT cross the surface
contract. Existing bridge-side authorization and validation remain in force.

A registration SHALL acquire terminals through a host handle whose lifecycle
supports attach, input where authorized, resize, scroll, focus ownership,
detach, and release. Surface unmount MUST release its view without closing the
underlying Herdr pane or disrupting another view of the same terminal.

#### Scenario: Office opens and closes an agent conversation

- **GIVEN** a Spaces terminal view already observes the same pane
- **WHEN** Office opens and later closes its conversation bubble
- **THEN** both views use Foundation's shared terminal owner, Office releases
  only its handle, and the Spaces view and Herdr pane remain intact.

### Requirement: Keep the registration descriptive and deterministic

For each assembly, surface IDs and routes SHALL be exact, unique, and validated
before the application mounts. Initial v1 routes are `/` for Spaces and
`/world` for Office. Duplicate or malformed entries fail the build/test rather
than being resolved by registration order.

Registrations SHALL contain presentation metadata and binding functions only.
They MUST NOT become a second store for bridge profiles, credentials, provider
configuration, runtime state, or plugin discovery.

#### Scenario: Two surfaces claim `/world`

- **GIVEN** an assembly contains duplicate routes
- **WHEN** it is validated
- **THEN** the build/test fails with both surface IDs and no last-writer-wins
  behavior.

### Requirement: Compose products outside Foundation core

Foundation SHALL publish a documented application/assembly constructor that
can produce its conformance application with Spaces only. World SHALL invoke
that public constructor with the Office registration from World-owned source.

Foundation source and artifacts MUST NOT contain World registrations, Office
lazy imports, `web/src/world` compatibility shims, World art, World providers,
or World branding. World MUST NOT patch Foundation source during its build.

The package SHALL declare React and other singleton UI runtimes as peer
dependencies where duplication would break context or hooks. Foundation-owned
styles and assets SHALL be explicit public exports or URLs; World MUST NOT
reach into an unpacked dependency directory for private CSS or assets.

#### Scenario: The World repository is unavailable

- **GIVEN** a clean Foundation checkout with only locked public dependencies
- **WHEN** its conformance application is built and served
- **THEN** shell + Spaces work without a World checkout, World package, Office
  string, World asset, or provider implementation in the emitted graph.

### Requirement: Keep World orchestration behind the Office registration

World SHALL own Office settings, World projection state, observability
adaptation, selection/handoff state, conversations, completion-seen state,
Office assets, and any World-only provider wiring. Those modules SHALL be
reachable from the Office registration or an explicitly World-owned assembly
contribution, not from Foundation's generic `App` source.

The one v1 product-settings seam SHALL preserve a typed binding equivalent to:

```ts
type ProductSettingsContribution<Context> = {
  id: string;
  label: string;
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{
    default: React.ComponentType<{
      context: Context;
      onClose: () => void;
    }>;
  }>;
  dispose: (context: Context) => void | Promise<void>;
};

type ProductAssembly = {
  surfaceApiVersion: typeof FOUNDATION_SURFACE_API_VERSION;
  surfaces: readonly OpaqueSurfaceRegistration[];
  productSettings?: OpaqueProductSettingsContribution;
};
```

The settings contribution generic MUST remain bound through opaque storage so
its factory, component, close callback, context, and disposer cannot be mixed
with another contribution. Foundation owns the `onClose` callback passed to
the loaded component. Invoking it marks that settings generation closing; the
same result occurs when the settings shell closes it externally.

Settings loading, context creation, cancellation, failure, retry, and disposal
SHALL follow the surface ordering above. In particular, Foundation loads before
creating context; a throwing factory releases partial acquisitions itself; and
close/failure/retry performs abort, exactly-once disposal, and awaited/contained
promise settlement before another settings generation opens. A disposer
rejection MUST NOT prevent the generic settings shell from closing. A delayed
disposer MUST prevent overlapping settings generations.

This seam exists only to preserve the Office settings entry. It MUST NOT grow
into a generic settings marketplace, and Foundation's settings view continues
to own generic bridge and display settings.

#### Scenario: Office is omitted from World during a diagnostic build

- **GIVEN** an assembly excludes its Office registration and settings
  contribution
- **WHEN** the emitted graph is audited
- **THEN** Office orchestration, settings, providers, and art are absent while
  Foundation shell + Spaces still build and run.

#### Scenario: Office settings closes while async cleanup is pending

- **GIVEN** the typed settings component invokes its Foundation-owned
  `onClose` callback
- **WHEN** its disposer is delayed and later rejects
- **THEN** Foundation aborts the settings generation, invokes the bound
  disposer once, prevents a second Office settings generation until settlement,
  contains the rejection, and keeps generic settings usable.

### Requirement: Use existing bridge capabilities for admission

`requiredBridgeFeatures` SHALL contain existing `/api/capabilities` feature
names only. The host evaluates requirements per enabled runtime and gives the
surface qualified available/unavailable information. The registry MUST NOT
invent a second capability namespace or treat one incompatible runtime as a
reason to hide compatible runtimes.

#### Scenario: One enabled runtime lacks an Office feature

- **GIVEN** host A satisfies Office requirements and host B does not
- **WHEN** Office mounts
- **THEN** host A remains usable, host B receives a qualified unavailable
  state, and Foundation's bridge manager retains retry/version diagnostics.

### Requirement: Contain surface failures locally

Foundation SHALL provide route-local loading, unavailable, and error states.
A lazy import, render, context, settings, or disposal failure in Office MUST
NOT tear down the application shell, bridge observation, Spaces, or unrelated
terminal handles. Retry SHALL begin with a fresh attempt and SHALL NOT reuse a
failed context.

#### Scenario: Office render throws

- **GIVEN** the Foundation shell and Spaces are healthy
- **WHEN** Office throws during render
- **THEN** `/world` displays a local recovery action, Foundation services stay
  active, and navigation back to Spaces succeeds.

### Requirement: Prove the boundary using packed artifacts

CI SHALL test the consumer boundary, not only same-worktree TypeScript paths:

1. build Foundation from a clean checkout;
2. run its conformance tests and produce `npm pack` plus the bridge artifact;
3. record package name, version, integrity hash, surface API, bridge API,
   `web_compat`, supported Herdr version, and terminal protocol;
4. install that exact tarball into a clean World checkout without a Foundation
   sibling or source-path alias;
5. build and test World; and
6. audit emitted JavaScript, CSS, assets, source maps, and package metadata.

The audit SHALL prove Foundation excludes World and that World contains no
private Foundation source imports. Characterization tests SHALL preserve
current Spaces, Office, navigation, settings, completion, conversation, focus,
multi-bridge, terminal, and accessibility behavior.

#### Scenario: A developer adds a source alias to make local builds pass

- **GIVEN** World resolves `@herdr-world/foundation` to an adjacent source tree
- **WHEN** the clean packed-artifact job runs
- **THEN** the job fails unless the same import is satisfied entirely by the
  declared package exports and exact tarball.

### Requirement: Add generality only from demonstrated use

The v1 contract SHALL remain limited to the operations needed by Spaces and
Office. Graph, City, or another concrete surface MAY justify an additive API
revision. New slots, contributions, provider abstractions, or policy mechanisms
require a separate approved spec with at least two demonstrated consumers.

#### Scenario: Graph needs a persistent sidebar

- **GIVEN** v1 only supports a main surface and one product-settings
  contribution
- **WHEN** Graph demonstrates a persistent-sidebar requirement
- **THEN** the team proposes an additive surface API change rather than hiding
  the behavior in Office metadata or a private Foundation import.

## 7. Privacy and security

- Surface contexts MUST NOT expose provider credentials, raw socket handles,
  unrestricted fetch, or arbitrary bridge commands.
- Error diagnostics MUST omit terminal content, note content, credentials, and
  absolute home-directory paths.
- A remote bridge remains subject to its existing origin/host policy;
  compiling a surface does not grant network authority.
- Package install scripts MUST NOT fetch mutable code or silently patch the
  consumer checkout.

## 8. Acceptance evidence

Approval requires review of:

1. the one-package public boundary and exact-version policy;
2. `SurfaceHostV1` authority and terminal lifecycle;
3. the Foundation-only and World assemblies; and
4. the clean packed-artifact test.

Implementation completion later requires:

- type-level negative tests for mismatched registration/context pairs;
- strong-exception-safety tests for surface and settings factories that throw
  after partial acquisition;
- cancellation, delayed-disposer, rejecting-disposer, awaited ordering, and
  exactly-once cleanup tests for surface and settings races;
- command validation and qualified multi-bridge identity tests;
- shared-terminal acquisition/release regression tests;
- duplicate-ID/route and API-version rejection tests;
- route-local load/render/retry tests;
- Foundation conformance and World browser acceptance tests; and
- a clean two-checkout package/bundle audit with no source alias or undeclared
  sibling dependency.

## 9. Deferred decisions

- Publishing `@herdr-world/foundation` to a public npm registry. A verified
  tarball is sufficient for the first extraction.
- A second contracts-only npm package. It is created only if a non-browser
  consumer demonstrates the need.
- Dynamic/untrusted browser plugins and their sandbox.
- Graph/City-specific contributions.
- Broad settings, navigation, command, or provider registries.
