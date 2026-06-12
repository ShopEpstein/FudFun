// Entry-point shim for deployments that run from the repo root
// (e.g. a Render service whose Root Directory was never set to "server").
// The real server lives in server/src/index.js.
require("../server/src/index.js");
