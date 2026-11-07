// Entry point for the package-toggle extension.
//
// pi-acp only lists entries whose names end in .ts or .js, and keeping the
// real entry at package-toggle/extensions/package-toggle.ts stops the directory
// from resolving on its own, leaving this file as the single registration.
export { default } from "./package-toggle/extensions/package-toggle.ts";
