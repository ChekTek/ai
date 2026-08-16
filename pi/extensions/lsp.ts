// Entry point for the local LSP extension.
//
// Pi discovers a directory extension through its index.ts, but the pi-acp ACP
// adapter only lists entries whose names end in .ts or .js, so a directory
// extension is invisible in editors that use it. Keeping the real entry point
// at lsp/extension.ts stops the directory from resolving on its own and
// leaves this file as the single registration, which both tools understand.
//
// The wrapper has to sit next to the directory rather than point straight at
// the entry point, because Pi resolves an extension's relative imports against
// the symlink path rather than the real path.
export { default } from "./lsp/extension.ts";
