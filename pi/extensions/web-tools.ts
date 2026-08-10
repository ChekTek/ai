// Entry point for the vendored web-tools extension.
//
// Pi discovers a directory extension through its index.ts, but the pi-acp ACP
// adapter only lists entries whose names end in .ts or .js, so a directory
// extension is invisible in editors that use it. Keeping the real entry point
// at web-tools/extension.ts stops the directory from resolving on its own and
// leaves this file as the single registration, which both tools understand.
export { default } from "./web-tools/extension.ts";
