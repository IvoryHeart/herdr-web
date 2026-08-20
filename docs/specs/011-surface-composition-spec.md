# Minimal compiled-in Web surface composition

- **Spec ID:** `011-surface-composition`
- **Status:** Draft
- **Created:** 2026-08-12
- **Revised:** 2026-08-20
- **Owner:** Herdr World downstream project
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

### Review reset 2026-08-20

The previous in-review draft attempted to define a general surface platform:
context-version negotiation, a new capability catalogue, per-target policies,
three slots, route grammar, minimum-host rules, and a detailed lifecycle state
machine. The current upstream audit found no second browser surface requiring
most of those mechanisms and confirmed that Herdr Web already owns multi-bridge
profiles, capability probes, runtime caches, and terminal transport.

This revision returns the specification to Draft and keeps only the boundary
needed to remove World imports and orchestration from the generic application.
New generality must be justified by a second concrete surface rather than by a
hypothetical plugin system.

> This draft defines trusted, compile-time composition for Herdr Web and Herdr
> World. It does not define Herdr plugins, runtime-installed browser code, or a
> second bridge/runtime layer.

## 1. Purpose

The current registry records surface labels, routes, feature requirements, and
lazy imports, but it is not a package boundary. The core registry registers
Office, its context is `unknown`, and `App.tsx` imports and orchestrates World
state, settings, observability, selection, handoff, and conversation terminals.

This specification introduces the smallest typed assembly seam that lets a
generic Herdr Web build contain Spaces only and a Herdr World build add Office.
It adapts the existing Herdr Web `BridgeManager`, federated runtime, command,
and terminal services; it does not replace their identity, storage, polling,
capability, or lifecycle ownership.

## 2. Scope

This feature includes:

- a typed binding between a surface definition, context factory, and lazy
  component;
- separate generic Web and World assembly entry points;
- one optional assembly-owned product-settings contribution that preserves the
  existing Office settings entry without importing World from generic code;
- exact route and surface-ID validation for compiled-in definitions;
- a read-only host adapter over existing bridge and federated runtime state;
- allow-listed semantic navigation, command, and terminal operations;
- migration of World-specific orchestration out of `App.tsx` and generic
  registry source;
- route-local loading, unavailable, and error containment;
- required bridge-feature admission using the existing capability response;
- generic and World build/bundle audits; and
- characterization tests that preserve current Spaces and Office behavior.

The initial assemblies are:

```text
Herdr Web assembly:   shell + Spaces
Herdr World assembly: shell + Spaces + Office
```

## 3. Non-goals

- No dynamic third-party JavaScript loading, browser marketplace, public plugin
  SDK, iframe/worker sandbox, hot installation, or module revocation.
- No representation of Office as a Herdr plugin. Herdr plugin v1 has no native
  non-terminal UI contract.
- No replacement for `BridgeManager`, bridge profiles, enabled-host selection,
  `/api/capabilities`, federated runtime polling, runtime caches, generation
  keys, or terminal WebSockets.
- No generic extension registry or provider registry.
- No general context-version negotiation, new capability namespace/catalogue,
  per-target policy language, minimum-host arithmetic, pattern routes,
  persistent sidebar contributions, or multi-entry settings catalogue.
- No Graph or City implementation.
- No product rename, public release, observability schema change, or provider
  migration.

## 4. Terms and trust model

| Term | Meaning |
| --- | --- |
| Surface | A trusted browser view compiled into a selected product assembly. |
| Generic assembly | Upstream-aligned shell with only generic Herdr Web surfaces. |
| World assembly | Generic assembly plus downstream World surfaces and assets. |
| Host adapter | A least-purpose view over existing application services supplied to one surface. |
| Bridge capability | A bounded feature reported by the existing bridge `/api/capabilities` response. |

Compiled surfaces execute in the same JavaScript realm and are trusted product
code. Type boundaries, import audits, Content Security Policy, and host adapters
improve maintainability and reduce accidental authority; they are not a sandbox.
Untrusted browser code requires a separate security design and specification.

## 5. Requirements

### Requirement: Bind each definition to its typed context and component

The assembly SHALL register one value that binds the definition, context
factory, and lazy component. The exact TypeScript spelling MAY differ, but the
following semantics are normative:

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
  dispose: (context: Context) => void;
};
```

The registration generic MUST remain bound internally; an Office component
MUST NOT receive a Spaces context through an `unknown`, `any`, or unpaired cast.
The host MAY erase the generic only after it stores the bound registration as
one opaque value.

The host SHALL create one abort controller for each admitted surface
generation and expose its signal through `SurfaceHostV1.lifecycle`. It SHALL
complete `load` before invoking `createContext`, then invoke `createContext`
exactly once for that generation. A load failure therefore creates no context.
Every registration SHALL provide `dispose`; a context with no non-abortable
resources MAY use a no-op disposer. Subscriptions and asynchronous work MUST
observe the generation abort signal.

On navigation away, admission loss, render failure, explicit retry, or assembly
teardown, the host SHALL abort the generation and, if a context was created,
invoke its disposer exactly once. Retry SHALL start only after that cleanup and
SHALL use a fresh abort signal, loaded component generation, and context. If
`createContext` throws before returning a context, the host SHALL abort the
generation and SHALL NOT call the disposer with a partial value. The context
factory MUST provide strong exception safety: before it propagates an error, it
MUST release every resource or subscription acquired during that invocation.
It MUST NOT acquire a non-abortable resource unless a local cleanup guard is
already able to release it if a later construction step fails. The host abort
signal remains a backstop for abort-aware work; it does not transfer ownership
of a partially constructed context to the host.

#### Scenario: A registration is mismatched

- **GIVEN** an assembly attempts to pair an Office factory with another
  surface's loaded component
- **WHEN** type checking or registration validation runs
- **THEN** the assembly fails before the component can mount.

#### Scenario: A mounted surface fails and retries

- **GIVEN** an admitted surface created subscriptions and then fails while
  rendering
- **WHEN** the host contains the failure and the user retries
- **THEN** the old generation is aborted and disposed exactly once before a
  fresh generation is loaded, and no old subscription remains active.

#### Scenario: Context creation throws after partial acquisition

- **GIVEN** a synthetic context factory acquires a tracked non-abortable
  resource and a later construction step throws
- **WHEN** the error leaves `createContext`
- **THEN** the factory releases the tracked resource before propagating, the
  host aborts the generation without calling `dispose` on a partial value, and
  a later retry observes no resource from the failed generation.

### Requirement: Keep the registry descriptive and the host authoritative

Surface metadata SHALL contain only identity, navigation label, exact route,
semantic icon, bridge-feature requirements, and the bound factories. It MUST
NOT own bridge profiles, runtime state, provider descriptors, credentials,
terminal sessions, polling, or product release metadata.

Surface IDs SHALL match `[a-z][a-z0-9-]*`. Routes SHALL be exact absolute paths.
The assembly SHALL reject duplicate IDs and duplicate normalized routes. The
host MAY preserve the current single trailing-slash normalization; broader
route grammar is deferred.

#### Scenario: Two surfaces claim `/world`

- **GIVEN** two compiled registrations normalize to the same route
- **WHEN** the product assembly is created
- **THEN** it fails with a bounded diagnostic before rendering.

### Requirement: Adapt existing host services without duplicating them

`SurfaceHostV1` SHALL be a thin adapter over the current Herdr Web application
services. It SHALL expose only the operations required by Spaces and Office:

```text
identity
  product ID, surface ID, assembly revision
navigation
  current route, navigate, return to Spaces
runtime
  read-only enabled/selected runtime views and bounded snapshot subscriptions
commands
  existing allow-listed semantic commands against qualified runtime targets
terminal
  existing admitted session descriptors and host-rendered terminal outlet
lifecycle
  abort signal and explicit subscription cleanup
```

The adapter MUST reuse the existing `BridgeManager` as the only owner of bridge
profile persistence, enablement, selection, capability probing, and runtime URL
construction. It MUST reuse the federated runtime/cache generation as the only
browser snapshot lifecycle. It MUST NOT create a surface-local polling loop,
bridge store, unqualified host ID, or second terminal connection manager.

Read views and targets SHALL retain current host qualification so identical
workspace, tab, pane, or agent IDs from different bridges cannot collide.

#### Scenario: Two bridges contain the same pane ID

- **GIVEN** both enabled runtimes report `pane-1`
- **WHEN** Office requests a semantic terminal operation
- **THEN** the host adapter routes it by the existing qualified bridge/runtime
  identity and no surface-local lookup can select the other host.

### Requirement: Keep commands and terminals host-owned

A surface SHALL request current allow-listed semantic operations with validated,
qualified targets. It MUST NOT receive raw bridge URLs, raw WebSockets, Herdr
socket paths, credentials, provider configuration, arbitrary command strings,
or a general `fetch` client through `SurfaceHostV1`.

Terminal presentation SHALL reuse the generic terminal renderer and current
session descriptor/admission logic. The host SHALL provide the component or
outlet needed to render an admitted terminal. Spaces and Office MUST NOT
implement separate attach, input, resize, reconnect, or generation behavior.

The surface owns only which qualified target it wants open, surface-local
window/layout state, and when it requests close. Host lifecycle rules remain
authoritative for the underlying terminal session.

#### Scenario: Office opens an agent conversation

- **GIVEN** an Office agent maps to an admitted qualified pane
- **WHEN** the surface requests a conversation terminal
- **THEN** the existing host terminal path attaches and renders it, and Office
  never constructs a terminal WebSocket URL.

### Requirement: Compose products outside generic core source

The generic registry/factory SHALL register Spaces only. A downstream assembly
module SHALL import the generic registrations and add Office. Generic
`App.tsx`, registry source, and the generic entry MUST NOT statically or
dynamically import `world`, Office assets, observability adapters, or World
assembly modules.

Product selection SHALL occur through explicit build entries or equivalent
compile-time configuration whose dependency graph is visible to the build
audit. It MUST NOT depend on runtime filesystem scanning or remote module URLs.

The assembly MAY also supply the single optional product-settings contribution
defined below. It is part of the same compile-time dependency graph.

#### Scenario: The generic app is built

- **GIVEN** the generic assembly entry is selected
- **WHEN** Vite resolves and emits the production graph
- **THEN** it contains Spaces and the shell but no World module, Office asset,
  World contract, or provider implementation.

### Requirement: Preserve Office settings through one assembly seam

The application assembly SHALL have one optional product-settings contribution
with these semantics:

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
  dispose: (context: Context) => void;
};

type ProductAssembly = {
  surfaces: readonly OpaqueSurfaceRegistration[];
  productSettings?: OpaqueProductSettingsContribution;
};
```

The generic assembly SHALL omit `productSettings`. The World assembly SHALL
supply one contribution labelled Office. The generic settings shell and
`BackendSettingsDialog` SHALL render its label and trigger when it is present
but MUST NOT import a World module. Activating the trigger SHALL load the
World-owned settings module before creating its context, then create the
context exactly once. That module owns Office configuration, validation, and
synchronization. The host SHALL give the settings generation its own abort
signal and apply the same required-disposer ordering as a surface generation.
Closing the dialog, leaving the assembly, load/render failure, or retry SHALL
abort and, if context creation completed, dispose its generation exactly once.
The product-settings `createContext` factory MUST also provide the same strong
exception safety as a surface factory: if it throws before returning, it MUST
release every resource or subscription acquired during that invocation and
MUST NOT acquire a non-abortable resource unless a local cleanup guard can
release it after a later construction failure. The host SHALL abort the
settings generation and SHALL NOT call `dispose` with a partial value.

This is a single compile-time product integration point, not a runtime settings
registry, arbitrary collection of sections, or public surface API. Adding more
than one product contribution or allowing individual surfaces/plugins to
register settings requires a spec extension.

#### Scenario: Office settings open from the global settings path

- **GIVEN** the World assembly is active and the user opens global settings
  from Spaces or Office
- **WHEN** the user activates the Office entry
- **THEN** the World settings dialog is lazy-loaded through the assembly,
  existing settings and synchronization behavior remain available, and the
  generic settings code has no World import.

#### Scenario: Generic Web opens settings

- **GIVEN** the generic assembly is active
- **WHEN** the user opens global settings
- **THEN** no Office entry or World chunk is present and ordinary bridge
  settings remain available.

#### Scenario: Settings context creation throws after partial acquisition

- **GIVEN** the Office settings context factory acquires a tracked
  non-abortable configuration or synchronization resource and a later
  construction step throws
- **WHEN** the error leaves the settings `createContext`
- **THEN** the factory releases the tracked resource before propagating, the
  host aborts the settings generation without calling `dispose` on a partial
  value, and a later retry observes no residue from the failed generation.

### Requirement: Move World orchestration behind the World registration

World-specific projection, observability, completion, settings, selection,
handoff, conversation, and persistence orchestration SHALL move from generic
`App.tsx` into the World registration, its typed context/controller, or
World-owned modules. The generic host MAY retain reusable services generalized
from existing behavior, but those services MUST be named and tested in generic
Herdr terms and MUST have at least Spaces or shell use independent of Office.

The migration SHALL preserve current Office behavior before adding new views.
Large file movement without a tested ownership change does not satisfy this
requirement.

#### Scenario: Office is removed from an assembly

- **GIVEN** the World registration is not selected
- **WHEN** the generic application type-checks and builds
- **THEN** no unresolved World context, settings, conversation, projection, or
  persistence dependency remains in `App.tsx` or its emitted graph.

### Requirement: Use existing bridge capabilities for admission

A definition MAY list the small set of existing bridge features required for
its basic operation. The host SHALL evaluate those names against each current
`BridgeRuntime.capabilities` result using existing compatibility logic. It MUST
NOT introduce a second capability endpoint, catalogue owner, provider health
registry, or context-version negotiation system.

At least one admitted enabled runtime is sufficient for the initial Spaces and
Office surfaces. Unavailable runtimes remain represented through existing
bounded host health; one offline configured runtime MUST NOT block other
admitted runtimes. Optional observability health remains World-owned and does
not become a generic bridge capability unless a future bridge behavior actually
depends on it.

#### Scenario: One of several runtimes is incompatible

- **GIVEN** Office requires snapshot support and one enabled bridge lacks it
- **WHEN** surface admission runs
- **THEN** Office remains usable for compatible runtimes and reports the
  existing bounded unavailable-host state without creating a new surface
  lifecycle protocol.

### Requirement: Contain loading and render failures locally

The host SHALL lazy-load only the active surface. A definition that cannot be
admitted SHALL show a host-owned unavailable state without invoking its context
factory. Load or render failures SHALL be contained by the active surface error
boundary, keep navigation to Spaces usable, and MUST NOT stop global runtime
observation or close unrelated terminal sessions.

One explicit retry SHALL follow the abort/dispose ordering defined above before
creating a fresh surface generation. No broader
registered/loading/ready/degraded state machine is required by this slice.

#### Scenario: Office fails during lazy load

- **GIVEN** the World chunk throws while loading
- **WHEN** the error boundary handles the failure
- **THEN** the shell and Spaces navigation remain usable, runtime observation
  continues, and retry does not duplicate Office subscriptions.

### Requirement: Prove both assemblies and their boundaries

The implementation SHALL add stable commands equivalent to:

```bash
npm run build:web:core
npm run build:web:world
npm run test:surface-composition
npm run audit:surface-bundles
```

Both builds SHALL emit separate manifests or equivalent module graphs. The
audit SHALL inspect resolved module IDs, chunks, assets, and hashes; it SHALL
fail when generic output contains World source/assets/provider code or when
World appears only because a generic module imported it. Source scans MAY be a
fast preliminary check but are not acceptance evidence on their own.

#### Scenario: A generic helper imports Office accidentally

- **GIVEN** a shell module imports a World helper that is not visibly rendered
- **WHEN** the bundle audit runs
- **THEN** it fails because the resolved generic dependency graph contains a
  prohibited World module.

### Requirement: Add generality only from demonstrated use

A second real compiled surface MAY propose new slots, route behavior, optional
inputs, or host services through an extension to this specification. The
proposal SHALL show that the requirement cannot be met by the minimal contract
and SHALL add characterization from both consumers.

The initial implementation MUST NOT add context-version negotiation,
capability catalogues, settings registries, arbitrary slot controllers, or
per-target policy DSLs solely for hypothetical Graph, City, or third-party
plugins.

#### Scenario: Graph needs a persistent sidebar contribution

- **GIVEN** Graph is a concrete reviewed surface and the stage-only contract is
  insufficient
- **WHEN** its design is proposed
- **THEN** a spec extension defines and tests the smallest shared slot behavior
  using both Graph and an existing surface before core accepts it.

## 6. Privacy and security

- Surface runtime views MUST exclude terminal output, prompts, environment
  variables, filesystem paths, credentials, backend URLs, and raw provider
  responses unless a separately approved feature explicitly requires bounded
  data.
- IDs remain opaque and bridge-qualified; display labels are bounded and are
  never treated as commands or paths.
- The host adapter does not make same-realm surface code untrusted. CSP and
  dependency review remain required release controls.
- Surface errors and diagnostic messages MUST be bounded and MUST NOT echo raw
  provider, transport, or terminal data.

## 7. Acceptance evidence

An implementation summary SHALL include:

- final typed registration and `SurfaceHostV1` definitions;
- generic and World assembly source and build entries;
- generic and World settings-path tests, including opening Office settings from
  Spaces without a generic World import;
- route/ID/registration validation tests;
- strong-exception-safety tests for both surface and product-settings context
  factories in which construction releases a tracked non-abortable resource
  before throwing;
- characterization of existing Spaces and Office selection, handoff,
  observability, settings, terminal, responsive, and accessibility behavior;
- tests for one incompatible/offline bridge among multiple enabled bridges;
- lazy-load failure, cleanup, and retry tests;
- proof that `App.tsx` and generic registry have no World imports;
- separate production manifests and final bundle/dependency audit output; and
- the exact commands and tool versions used to produce the evidence.

## 8. Deferred decisions

- A multi-entry settings catalogue, per-surface settings registration, or
  persistent sidebar slot beyond the single assembly seam above.
- Context major/minor negotiation across independently versioned packages.
- A formal capability catalogue beyond existing bridge capability fields.
- Dynamic, isolated, or remotely installed browser extensions.
- Graph, City, mobile-specific surfaces, and non-React consumers.
- Packaging, licensing, release identity, and upstream proposal mechanics,
  which are governed by Specs 004, 010, and later compatibility/release specs.
