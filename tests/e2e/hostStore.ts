export function hostStore() {
  return {
    version: 2,
    enabledBridgeIds: ["same-origin", "host-b", "host-c", "host-d", "host-e"],
    lastSelectedBridgeId: "same-origin",
    backends: [
      { id: "host-b", name: "Remote B", baseUrl: "http://127.0.0.1:4174" },
      { id: "host-c", name: "Protocol C", baseUrl: "http://127.0.0.1:4175" },
      { id: "host-d", name: "Malformed D", baseUrl: "http://127.0.0.1:4176" },
      { id: "host-e", name: "Offline E", baseUrl: "http://127.0.0.1:4199" },
    ],
  };
}
