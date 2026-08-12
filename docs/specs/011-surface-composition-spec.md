# Typed surface composition and host boundary

- **Spec ID:** `011-surface-composition`
- **Status:** Draft
- **Created:** 2026-08-12
- **Owner:** Herdr World downstream project
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

> This draft defines a trusted, compile-time surface boundary for Herdr Web
> and downstream Herdr World projections. It does not authorize runtime
> extraction, a public plugin SDK, or dynamic code loading.

## 1. Purpose

Herdr Web currently has a surface registry with useful route, capability, and
lazy-loading metadata. It is not yet a composition boundary: the core registry
registers the Office surface, `App.tsx` constructs the Office context, and the
surface context is effectively `unknown` at the registry boundary.

This specification defines the smallest stable host contract needed to let the
core shell compose Spaces and downstream projections without importing each
projection's implementation. Office remains a trusted, compiled-in World
surface. A later dynamic plugin design, if needed, requires a separate threat
model and specification.

## 2. Scope

This feature includes:

- a typed host context for surface reads, commands, navigation, layout, and
  lifecycle;
- explicit surface slots and route ownership;
- trusted assembly-time registration separate from the upstream/core registry;
- capability and host-scope admission before a surface is mounted;
- bounded surface-local loading, error, unavailable, and degraded states;
- a core-only build and bundle proof with no World or provider imports; and
- contract, isolation, and lifecycle tests for the composed shell.

## 3. Non-goals

- No dynamic third-party JavaScript loading or public plugin SDK.
- No permissions model that grants a surface raw Herdr sockets, bridge
  connections, Prometheus URLs, credentials, or arbitrary network access.
- No direct surface access to OTEL, Prometheus, Loki, databases, or Herdr
  protocol internals.
- No requirement to move the current files before the boundary tests pass.
- No product rename, route rename, storage-key migration, or release-version
  decision. Those are owned by the packaging specification and a migration
  extension when required.
- No Graph or City implementation. They are future projections used only as
  boundary examples.

## 4. Terms and trust model

| Term | Meaning |
| --- | --- |
| Core surface | A surface maintained with the generic Herdr Web shell, such as Spaces. |
| Downstream surface | A trusted, compiled-in projection selected by the Herdr World assembly, such as Office. |
| Host | The Herdr Web shell that owns navigation, runtime admission, lifecycle, and shared layout. |
| Assembly | The compile-time product selection that combines core definitions with trusted downstream definitions. |
| Capability | A named, bounded operation or read exposed by the host after runtime admission. |
| Degraded | A surface is mounted but one or more optional inputs are unavailable. |

All surfaces are trusted code at this stage. Trust means source/revision
review and compile-time inclusion, not unrestricted authority. The host owns
authorization, transport, origin policy, and sensitive configuration.

## 5. Surface definition contract

The registry SHALL expose a typed definition equivalent to:

```ts
type SurfaceSlot = "sidebar" | "stage" | "settings";
type SurfaceHostScope = "single-host" | "multi-host";

type SurfaceDefinition<Context extends SurfaceHostContext = SurfaceHostContext> = {
  id: string;
  label: string;
  route: "/" | `/${string}`;
  semanticIcon: string;
  slots: readonly SurfaceSlot[];
  hostScope: SurfaceHostScope;
  requiredCapabilities: readonly SurfaceCapability[];
  load: () => Promise<{ default: SurfaceComponent<Context> }>;
};

type SurfaceComponent<Context extends SurfaceHostContext> =
  (props: { context: Context; slot: SurfaceSlot }) => ReactNode;
```

The exact TypeScript spelling MAY differ, but the following properties are
invariant:

- `context` is a named, versioned type and is never `unknown` at the assembly
  boundary;
- a definition declares every slot it can render into;
- route and surface IDs are unique within an assembly;
- capabilities are named by the host contract, not arbitrary strings owned by
  a projection; and
- a definition cannot request raw bridge clients or provider configuration.

The host MAY provide a typed `SurfaceContextV1` adapter to a surface-specific
context, but the adapter must be created by the host/assembly and must expose
only the declared capabilities.

## 6. Host context

The stable host context SHALL be divided into read-only views and admitted
commands:

```text
SurfaceHostContextV1
  identity: product, surface, host-scope, assembly revision
  navigation: current route, navigate, replace, go back
  layout: assigned slot, compact mode, sidebar visibility, viewport class
  runtime: admitted host summaries, capabilities, connection/degraded state
  herdr: bounded snapshot reads and allow-listed user-intent commands
  lifecycle: abort signal and mount/unmount notification
  settings: request opening an owned settings section
```

Rules:

1. `runtime` reads are immutable snapshots or subscription APIs with explicit
   unsubscribe behavior. A surface does not own the global polling loop.
2. `herdr` commands are semantic, allow-listed operations such as selecting a
   workspace or requesting a supported launch flow. They carry validated input
   and return bounded results. They are not a general command channel.
3. `settings` can open a host-owned section. A surface owns the fields and
   validation for its section, but cannot replace the generic settings shell.
4. The host owns navigation history, route synchronization, host selection,
   bridge lifecycle, and terminal-session lifetime.
5. A surface owns only its presentation state, projection-local interaction
   state, and cleanup of resources it created through the context.

The context MUST NOT contain provider credentials, backend URLs, raw telemetry,
browser storage handles, WebSocket objects, DOM globals, or a generic
`unknown`/`any` escape hatch.

## 7. Slots, routes, and ownership

The host owns the persistent shell and declares the available outlets:

```text
app shell
  sidebar slot   ← optional surface navigation/detail contribution
  stage slot     ← active surface primary content
  settings slot  ← host-owned settings dialog/section
```

A surface may render in one or more declared slots, but it does not create a
second app shell, global sidebar, route history, or bridge lifecycle. The
active route resolves to one surface before loading its component.

Route admission SHALL reject duplicate or shadowing routes at assembly time.
Unknown routes use the host's existing fallback. A surface unavailable because
its route or required capability is not admitted MUST produce a host-owned
unavailable state and MUST NOT partially mount.

Spaces SHALL be represented by the same real surface outlet as downstream
projections. The host MAY keep core navigation controls outside the outlet,
but `App.tsx` MUST NOT contain a projection-specific branch that constructs
World implementation state.

## 8. Assembly and registration

The core package SHALL export a core-only registry/factory containing only core
surface definitions. A downstream assembly SHALL compose it explicitly:

```text
core registry                 downstream assembly
  Spaces definition      +      Office definition
  core routes            +      World routes/settings
  core capabilities      +      World capability adapter
                                  |
                                  v
                         assembled Herdr World registry
```

The assembly API SHALL:

- accept definitions from declared trusted packages only;
- validate IDs, routes, slots, capabilities, and host scopes before serving;
- produce a manifest of selected component revisions for packaging;
- keep downstream definitions out of the core registry source and core-only
  bundle; and
- fail closed on duplicate IDs, duplicate routes, unknown capabilities, or
  invalid slot declarations.

No registry API in this specification promises hot installation, remote
discovery, arbitrary module URLs, code revocation, or sandboxing.

## 9. Admission and lifecycle states

The host evaluates admission before lazy loading:

```text
registered → admitted → loading → ready
                    ↘ unavailable
                    ↘ error
ready      → degraded when an optional admitted input fails
```

- `registered`: definition is known to the assembly but not active for the
  current route/scope.
- `admitted`: route, host scope, and required capabilities pass.
- `loading`: component code is being loaded from the assembled bundle.
- `ready`: component mounted and its required host context is available.
- `unavailable`: required capability, host scope, or dependency is absent.
- `error`: component loading or mounting failed; the host captures the error
  at the slot boundary and retains navigation to core surfaces.
- `degraded`: the surface remains usable while an optional provider or
  projection input is unavailable.

Every non-ready state SHALL be local to the surface slot. It MUST NOT tear
down core runtime polling, close unrelated terminals, or remove other mounted
surfaces.

## 10. Capability and host-scope admission

Capabilities SHALL be classified as read, command, or lifecycle capabilities.
Examples include:

```text
read.snapshot
read.host-roster
command.select-workspace
command.launch-shell
lifecycle.surface-events
```

The registry MUST validate capability names against the host contract. A
surface requiring `multi-host` MUST NOT mount in a single-host-only runtime;
the host may offer a surface-specific single-host fallback only if declared in
the definition.

Capability absence is not an exception path. It is a deterministic admission
result with an accessible explanation and a route back to an admitted core
surface.

## 11. Core-only and dependency-direction proof

The implementation SHALL add repeatable checks that prove:

- core registry source does not import `web/src/world`, provider adapters, or
  Office assets;
- a core-only build can render Spaces with no World modules present;
- the assembled World build contains the World modules only through the
  downstream assembly;
- projections import host contracts and validated projections, never bridge
  transport/provider modules directly; and
- the final bundle/dependency graph agrees with the source-level audit.

Keyword scans MAY remain as a fast check, but they are insufficient as the
only proof. The acceptance check MUST inspect module dependencies or final
bundle contents.

## 12. Acceptance scenarios

### Scenario: Core-only Herdr Web build

- **GIVEN** World/Office sources and provider adapters are disabled or absent
- **WHEN** the core build and browser smoke test run
- **THEN** the shell starts, Spaces is reachable, and the output contains no
  World imports, Office assets, or provider adapter modules.

### Scenario: Downstream Office assembly

- **GIVEN** the Herdr World assembly selects Office
- **WHEN** the assembled registry starts
- **THEN** Office is admitted through the typed host context and its component
  revision is recorded in the assembly manifest.

### Scenario: Missing optional provider

- **GIVEN** Office is admitted but its optional observability provider is
  unavailable
- **WHEN** the Office surface mounts
- **THEN** Office remains usable with a local degraded state and Spaces,
  navigation, and terminal sessions remain unaffected.

### Scenario: Surface load failure

- **GIVEN** an admitted surface fails while loading or mounting
- **WHEN** the error boundary handles it
- **THEN** only that surface slot reports the failure, core navigation remains
  usable, and no unrelated terminal or bridge session is closed.

### Scenario: Invalid assembly

- **GIVEN** two selected definitions share an ID or route, or request an
  unknown capability
- **WHEN** the assembly is validated
- **THEN** startup/build fails with a bounded diagnostic before the invalid
  surface can mount.

## 13. Required evidence

An implementation summary SHALL include:

- the approved host-context and registry type definitions;
- core and downstream assembly manifests;
- unit tests for route, capability, slot, and duplicate validation;
- lifecycle tests for loading, unavailable, degraded, and error states;
- a core-only build and final-bundle/dependency audit;
- a World assembly test proving Office is not in the core registry; and
- evidence that existing terminal, Spaces, accessibility, and responsive
  behavior remains intact.

## 14. Deferred decisions

- Physical package directory names and package-manager workspace layout.
- Whether a generic extension registry should be proposed upstream after this
  trusted composition seam is proven.
- Whether a future isolated plugin system is needed and which threat model it
  must satisfy.
- Public release versioning, artifact signing, notices, SBOM, and update
  policy, which remain governed by the packaging/release specifications.
