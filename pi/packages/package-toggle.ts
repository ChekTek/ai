// Entry point for the package-toggle extension.
//
// Pi discovers a directory extension through its index.ts, but pi-acp only
// lists entries whose names end in .ts or .js. Keeping the real entry at
// package-toggle/extensions/package-toggle.ts stops the directory from
// resolving on its own, leaving this file as the single registration.
export { default } from "./package-toggle/extensions/package-toggle.ts";
