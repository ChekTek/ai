// Entry point for the Cursor browser-login extension.
//
// Pi discovers a directory extension through its index.ts, but the pi-acp ACP
// adapter only lists entries whose names end in .ts or .js, so a directory
// extension is invisible in editors that use it. Keeping the real entry point
// at cursor-login/extension.ts stops the directory from resolving on its own
// and leaves this file as the single registration.
export { default } from "./cursor-login/extension.ts";
