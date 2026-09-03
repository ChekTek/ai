// Entry point for the copy-code-blocks extension.
//
// The implementation lives in a package directory for standalone installation.
// This sibling wrapper keeps it visible to both Pi and pi-acp without causing
// duplicate registration when this repository publishes pi/packages/.
export { default } from "./copy-code-blocks/extensions/copy-code-blocks.ts";
