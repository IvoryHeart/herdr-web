# Typed surface composition and host boundary

- **Spec ID:** `011-surface-composition`
- **Status:** In review
- **Created:** 2026-08-12
- **Owner:** Herdr World downstream project
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

### Review revision 2026-08-12

This revision resolves the pre-approval review issues around scope semantics,
optional capability admission, heterogeneous context binding, terminal
ownership, same-realm trust limits, slot lifecycle, route normalization,
bounded DTOs, recovery, and mechanically verifiable core/World builds.

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
- selected/all scope support with per-host admission and a minimum usable-host
  policy;
- explicit required and optional capabilities, including per-target policy and
  optional-input health/recovery behavior;
- trusted assembly-time registration separate from the upstream/core registry;
- capability and scope admission before a surface is mounted;
- bounded surface-local loading, error, unavailable, and degraded states;
- host-owned terminal outlets and semantic terminal operations for both Spaces
  and Office conversation terminals;
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

All surfaces are compiled-in, same-realm trusted code at this stage. This is
API and dependency isolation, not a browser security sandbox: a React surface
can still call `fetch`, `localStorage`, `window`, or other browser globals if
its code chooses to do so. Static import rules, lint rules, bundle audits, and
deployment CSP are guardrails, not a security boundary. Truly untrusted code
requires an iframe, worker, or isolated realm and a separate plugin
specification with its own threat model. The host owns authorization,
transport, origin policy, and sensitive configuration at the supported API
boundary.

## 5. Surface definition and registration contract

The registry SHALL use a typed registration that binds a definition, its
context factory, and its loaded controller together. The exact TypeScript
spelling MAY differ, but the generic binding is normative:

```ts
type SurfaceScope = "selected" | "all";
type SurfaceSlot = "sidebar" | "stage" | "settings";
type SurfaceContextVersion = { major: 1; minor: number };
type CapabilityName = string & {};

type CapabilityRequirement = {
  name: CapabilityName;
  target: "global" | "host" | "workspace" | "pane";
};

type SurfaceDefinition = {
  id: string;
  label: string;
  route: "/" | `/${string}`;
  semanticIcon: string;
  contextVersion: SurfaceContextVersion;
  supportedScopes: readonly SurfaceScope[];
  minimumUsableHosts: number;
  scopeFallbacks: readonly {
    from: SurfaceScope;
    to: SurfaceScope;
    when: "no-usable-hosts" | "partial-host-failure";
  }[];
  slots: Readonly<{
    stage: { mount: "active-route" };
    sidebar?: { mount: "active-route" | "persistent" };
    settings?: { mount: "on-demand" };
  }>;
  capabilities: {
    required: readonly CapabilityRequirement[];
    optional: readonly CapabilityRequirement[];
    perTarget?: Readonly<{
      global?: { required: readonly CapabilityName[]; optional: readonly CapabilityName[] };
      host?: { required: readonly CapabilityName[]; optional: readonly CapabilityName[] };
      workspace?: { required: readonly CapabilityName[]; optional: readonly CapabilityName[] };
      pane?: { required: readonly CapabilityName[]; optional: readonly CapabilityName[] };
    }>;
  };
  optionalInputs: readonly {
    id: string;
    capabilities: readonly CapabilityName[];
    failure: "degraded" | "hidden";
    retry: "automatic" | "manual" | "capability-generation";
    recovery: "return-to-ready" | "remain-degraded-until-refresh";
  }[];
};

type SurfaceRegistration<Context> = {
  definition: SurfaceDefinition;
  createContext: (hostServices: SurfaceHostServicesFor<SurfaceDefinition>) => Context;
  load: () => Promise<{
    createController: (context: Context) => SurfaceController<Context>;
  }>;
};

type SurfaceController<Context> = {
  stage: SurfaceComponent<Context>;
  sidebar?: SurfaceComponent<Context>;
  settings?: SurfaceComponent<Context>;
  dispose: () => void;
};

type SurfaceComponent<Context> = (props: {
  context: Context;
  slot: SurfaceSlot;
}) => ReactNode;
```

`SurfaceHostServicesFor<Definition>` is an admission-scoped least-authority
view derived from `SurfaceHostServicesV1`: it always includes identity,
navigation, layout, lifecycle, and settings, and includes terminal, snapshot,
or command adapters only when the registration declares the corresponding
capability. The host may erase this mapped type internally after validation,
but the context factory must never receive the unrestricted root service object
as its public registration contract.

The `load` function is called once per admitted surface controller, not once
per slot. The controller owns one context/store and returns explicit slot views;
the host never reuses one component function as an implicit multi-slot mount.
The host mounts only the views declared by the slot policies. Slot views share
the controller's context and lifecycle, so Office's stage, sidebar, and
settings contributions cannot accidentally create unrelated Office states.

The registration generic MUST remain bound through `createContext` and
`createController`: a registration for Office cannot be paired with a Spaces
context by the assembly. An internal validated registry MAY erase the generic
type after registration, but it MUST retain the bound factory/controller pair
as one value and MUST NOT expose an untyped context cast to callers.

The definition MUST explicitly declare required capabilities, optional
capabilities, supported scopes, fallbacks, per-target requirements, and
optional-input recovery. `minimumUsableHosts` is normally `1`; a surface that
requires more hosts MUST say so. `supportedScopes: ["selected", "all"]` means
the surface can operate in either scope, not that two hosts are required.

Every `optionalInputs[].capabilities` entry MUST be declared in the
registration's optional capability set. An optional input has one host-owned
health record with bounded `available`, `unavailable`, `degraded`, and
`recovering` states, a last capability generation, and the declared retry and
recovery policy. The surface receives the state; it never receives provider
connection details.

Route and surface IDs are unique within an assembly. Capabilities are validated
against the assembled catalogue described in Section 8, not a hard-coded core
union. A definition cannot request raw bridge clients, provider configuration,
or arbitrary browser storage through the host API.

### 5.1 Context compatibility

`contextVersion` is part of the registration contract. A host with context
version `H` MAY load a registration requiring version `R` only when:

- `H.major === R.major`; and
- `H.minor >= R.minor` under the declared additive-minor compatibility rule.

A major mismatch is an assembly validation error. A minor mismatch below the
registration minimum produces `unavailable`, not a partially initialized
surface. Any breaking context change requires a new major version and a new
registration adapter.

## 6. Host context and terminal boundary

The stable host context SHALL be divided into read-only views and admitted
commands:

```text
SurfaceHostServicesV1
  identity: product, surface, scope, context version, assembly revision
  navigation: current route, navigate, replace, go back
  layout: assigned slot, compact mode, sidebar visibility, viewport class
  runtime: bounded host summaries, capability snapshots, connection state
  herdr: bounded snapshot DTOs and allow-listed semantic commands
  terminal: opaque targets, open/focus/close, host-owned TerminalOutlet
  lifecycle: abort signal, capability-generation, mount/unmount notification
  settings: discover sections and request opening an owned settings section
```

Rules:

1. `runtime` reads are immutable snapshots or subscription APIs with explicit
   unsubscribe behavior. A surface does not own the global polling loop.
2. `herdr` commands are semantic, allow-listed operations such as selecting a
   workspace or requesting a supported launch flow. They carry validated input
   and return bounded results. They are not a general command channel.
3. `settings` exposes metadata for inactive registered sections without
   mounting their UI. The selected settings section is loaded on demand and
   rendered inside the host-owned settings dialog. A surface owns its fields
   and validation, but cannot replace the generic settings shell.
4. The host owns navigation history, route synchronization, host selection,
   bridge lifecycle, and terminal-session lifetime.
5. A surface owns only presentation state, projection-local interaction state,
   and cleanup of resources it created through the context.

### 6.1 Bounded snapshot DTOs

The host SHALL expose a versioned, bounded `SurfaceSnapshotV1` DTO rather than
raw Herdr protocol objects:

```text
SurfaceSnapshotV1
  hosts[]: { hostId, displayName, availability, capabilityNames }
  workspaces[]: { hostId, workspaceId, displayName, agentCount }
  panes[]: { hostId, workspaceId, paneId, displayName?, state }
  agents[]: { hostId, workspaceId?, agentId, displayName, status, updatedAt }
  counts: bounded aggregate counts
  generatedAt
```

Every collection and display string has a documented maximum. IDs are opaque
host-scoped identifiers and display names are bounded strings. A pane
`displayName` MAY be exposed to Spaces after host sanitization, but it is not a
command, path, prompt, or output field. The DTO MUST NOT contain terminal
output, prompts, command lines, environment variables, filesystem paths,
credentials, backend URLs, note bodies, raw telemetry labels, or arbitrary
provider responses. Notes, if later exposed, are summary/count DTOs only and
require a separate capability.

Surface code does not receive a WebSocket, fetch client, socket path, runtime
URL, browser storage handle, DOM global, or generic `unknown`/`any` escape hatch
through this context. The same-realm security limitation in Section 4 still
applies to code that bypasses these APIs directly.

### 6.2 Host-owned terminal outlet

Surfaces MUST use semantic terminal operations and a host-owned outlet:

```text
TerminalTarget
  existing-pane: hostId, workspaceId, paneId
  agent-seat: hostId, workspaceId, agentId
  launch: hostId, workspaceId?, launchIntentId

terminal.open(target, options) → opaque TerminalSessionRef
terminal.focus(ref)
terminal.close(ref)
terminal.outlet(ref, { mode: "inline" | "full" }) → host-owned TerminalOutlet
```

The target contains no WebSocket URL, bridge URL, socket path, credentials, or
raw command string. Launch intents are validated and created by the host's
allow-listed command layer. The host resolves transport, attaches sessions,
renders the terminal outlet, and retains a session across surface rerenders or
route changes until the surface explicitly closes it or host-level lifecycle
policy retires it. A route change MUST NOT close unrelated sessions.

Spaces uses the outlet for its terminal panes. Office uses the same outlet for
conversation terminals and full-space handoff. `App.tsx` may adapt existing
runtime state into `SurfaceHostServicesV1` during migration, but it MUST NOT
remain the long-term owner of projection-specific terminal orchestration.

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

Slot lifecycle is explicit:

- `stage` mounts only for the active route;
- `sidebar` mounts for the active route unless its registration explicitly
  declares `persistent` and the host admits that persistent contribution; and
- `settings` is represented in the host settings catalogue while inactive and
  mounts only when the user opens that section.

Route admission SHALL reject duplicate or shadowing routes at assembly time.
Routes are exact canonical paths, not patterns. A route is `/` or one to four
lower-case ASCII slug segments, each matching `[a-z0-9]+(?:-[a-z0-9]+)*`, with
an overall maximum of 64 characters. Query strings and fragments do not affect
resolution. The host normalizes one or more trailing slashes (except root),
rejects control characters, backslashes, malformed percent escapes, encoded
slashes, dot segments, and non-canonical paths, then performs an exact match.
An encoded route is never decoded into a second route. “Shadowing” means two
definitions resolve to the same canonical path or a future pattern would match
another definition; patterns are not allowed by this specification.

Unknown routes use the host's existing fallback. A surface unavailable because
its route, scope, host minimum, context version, or required capability is not
admitted MUST produce a host-owned unavailable state and MUST NOT partially
mount.

Spaces SHALL be represented by the same real surface outlet as downstream
projections. The host MAY keep core navigation controls outside the outlet,
but `App.tsx` MUST NOT contain a projection-specific branch that constructs
World implementation state.

## 8. Layered capabilities, assembly, and registration

The core package SHALL export a core-only capability catalogue and registry/
factory containing only core definitions. Downstream packages MAY declare
namespaced capabilities and providers alongside their surface registrations.
The assembly SHALL compose and validate the complete catalogue explicitly:

```text
core registry                 downstream assembly
  Spaces definition      +      Office definition
  core routes            +      World routes/settings
  core capabilities      +      World capability declarations/providers
                                  |
                                  v
                         assembled Herdr World registry
```

Capability ownership is layered:

- Herdr Web owns the core catalogue, including capability names, target types,
  bounds, and generic semantic command rules.
- A downstream assembly owns namespaced World capability declarations such as
  `world.office.*` and selects their adapters/providers.
- Capability providers/adapters are registered with the surface or extension
  that consumes them; they do not become core capabilities merely by existing.
- Validation checks required and optional requirements against the assembled
  catalogue and the per-target runtime admission snapshot, not only a
  hard-coded core union.

The assembly API SHALL:

- accept definitions from declared trusted packages only;
- accept and validate core and namespaced capability declarations/providers;
- validate IDs, routes, slots, scopes, context versions, capability policies,
  and host minimums before serving;
- produce a manifest of selected component revisions for packaging;
- keep downstream definitions out of the core registry source and core-only
  bundle; and
- fail closed on duplicate IDs, duplicate routes, unknown capabilities,
  invalid slot declarations, or an unbound context/controller pair.

No registry API in this specification promises hot installation, remote
discovery, arbitrary module URLs, code revocation, or sandboxing.

## 9. Scope, per-target admission, and lifecycle states

`supportedScopes` describes the views a surface can render, not a minimum
number of hosts. In `selected` scope the host admits the selected host and its
targets. In `all` scope the host evaluates each configured host independently
and supplies the surface with usable-host and unavailable-host results. A
surface with both scopes remains usable with one host. The host MUST not block
the surface solely because other configured hosts are offline.

Admission evaluates, in order:

1. canonical route and active slot policy;
2. context major/minor compatibility;
3. supported scope and declared fallback;
4. global required capabilities;
5. per-target required capabilities for each host/workspace/pane; and
6. `minimumUsableHosts` (normally one).

Optional capability failures do not fail admission. They create an optional
input health record and may put a ready surface into `degraded` according to
the input's declared policy. Required capability failure for every target
produces `unavailable`; partial target failure produces a usable surface with
bounded unavailable-target details when the minimum remains satisfied.

The host evaluates admission before lazy loading:

```text
registered ──admission failure──────────────→ unavailable
     │                                             │
     └─admitted → loading → ready ────────────────┘
                         │  │  ▲                  retry/re-admission
                         │  └──┴─ optional failure/recovery
                         └──────→ degraded
loading ──load/mount failure────────────────→ error
error ──explicit retry or new generation───→ loading
ready/degraded ──required capability loss──→ unavailable
```

- `registered`: definition is known to the assembly but not active for the
  current route/scope.
- `admitted`: route, scope, context, host minimum, and required capabilities
  pass; no component is necessarily loaded yet.
- `loading`: the bound controller is loading or mounting.
- `ready`: the controller is mounted and all required inputs are available.
- `unavailable`: admission failed, or a later required capability/generation
  change removed the minimum usable target.
- `error`: controller loading or mounting failed; the slot boundary contains
  the failure and retains navigation to core surfaces.
- `degraded`: the surface remains usable while one or more optional inputs or
  configured targets are unavailable.

Each runtime capability snapshot has a monotonically changing
`capabilityGeneration`. When it changes, the host re-evaluates admission and
optional inputs. A recovery re-admits and recreates the context/controller when
required; it does not reuse stale context. Manual retry does the same and
resets the error boundary only for that surface generation. A surface error is
not cleared on every render.

Every non-ready state SHALL be local to the surface slots. It MUST NOT tear
down core runtime polling, close unrelated terminals, or remove other mounted
surfaces. Optional input recovery returns to `ready` only when the input's
policy says `return-to-ready`; otherwise the surface remains visibly degraded
until a refresh.

## 10. Capability categories and target policy

Capabilities SHALL be classified as read, command, or lifecycle capabilities.
Examples include:

```text
read.snapshot
read.host-roster
command.select-workspace
command.launch-shell
lifecycle.surface-events
world.office.observability
```

The assembled catalogue validates names, target types, versions, bounds, and
owners. A capability is not authentication and does not grant mutation
authority. A command is still subject to the host's operation-level admission
and target validation.

The per-target policy is evaluated independently for each host, workspace, or
pane. The result contains only bounded counts and opaque target IDs, for
example `usableHosts`, `unavailableHosts`, and `missingCapabilityNames` with
fixed collection limits. It MUST NOT expose provider URLs, credentials, raw
backend errors, or arbitrary descriptor data.

Capability absence is a deterministic admission result with an accessible
explanation and a route back to an admitted core surface.

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

The current repository has one Vite entry/build, so the implementation MUST
make the two product assemblies mechanically explicit before claiming a
core-only proof. It SHALL add these commands (or stable equivalent commands
documented in `package.json`):

```bash
npm run build:web:core
npm run build:web:world
npm run test:surface-composition
npm run audit:surface-bundles
```

`build:web:core` builds the core registry and Spaces without importing World,
Office, observability provider, or World asset modules. `build:web:world`
builds the downstream assembly. Both builds SHALL emit Vite manifest metadata
to distinct output directories. `audit:surface-bundles` SHALL parse those
manifests and the emitted module/chunk graph, fail on prohibited core imports
or assets, and verify that World modules appear only in the World assembly.
The audit output records the Vite version, entry, chunk names, module IDs,
asset paths, and content hashes. The implementation summary SHALL include the
exact command output and not substitute a source keyword scan.

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

### Scenario: One host satisfies a multi-scope surface

- **GIVEN** a surface declares `supportedScopes: ["selected", "all"]` and
  `minimumUsableHosts: 1`
- **WHEN** the runtime has one usable host, or several configured hosts with
  some unavailable
- **THEN** the surface mounts with the usable host(s), reports bounded
  unavailable-host state, and does not require two hosts or fail globally.

### Scenario: Heterogeneous synthetic surface

- **GIVEN** a synthetic test surface has a context different from both Spaces
  and Office, supports only `selected`, requires one synthetic core capability,
  and declares a different optional capability
- **WHEN** the assembled registry validates and mounts it beside Spaces and
  Office
- **THEN** its context factory is paired only with its own controller, its
  capability policy is evaluated independently, and its optional failure
  produces local degraded state without changing either real surface.

### Scenario: Office and Spaces use the same terminal boundary

- **GIVEN** Spaces opens an existing pane and Office opens an agent conversation
  through semantic targets
- **WHEN** either surface changes route, rerenders, or requests focus
- **THEN** the host-owned outlet retains the correct session, transport remains
  outside the surface context, and unrelated terminal sessions remain open.

### Scenario: Capability recovery

- **GIVEN** an optional provider capability is unavailable at generation `G`
- **WHEN** the host reports generation `G+1` with that capability available
- **THEN** the host re-evaluates the input, transitions through `recovering`,
  and returns the surface to `ready` or its declared recovered state without
  duplicating the controller or closing terminals.

## 13. Required evidence

An implementation summary SHALL include:

- the approved host-context and registry type definitions;
- core and downstream assembly manifests;
- unit tests for route, capability, slot, and duplicate validation;
- lifecycle tests for loading, unavailable, degraded, and error states;
- a core-only build and final-bundle/dependency audit;
- a synthetic surface with a distinct context and capability policy;
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
