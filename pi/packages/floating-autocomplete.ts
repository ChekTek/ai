import { CustomEditor, type ExtensionAPI, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type EditorTheme,
	type OverlayHandle,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

/** Runtime shape used to identify nested TUI containers. */
function hasChildren(value: unknown): value is Component & { children: Component[] } {
	if (!value || typeof value !== "object" || !("children" in value)) return false;
	return Array.isArray(value.children);
}

/** Finds the top-level TUI child that contains the editor. */
function containsComponent(root: Component, target: Component, seen = new Set<Component>()): boolean {
	if (root === target) return true;
	if (seen.has(root) || !hasChildren(root)) return false;

	seen.add(root);
	return root.children.some((child) => containsComponent(child, target, seen));
}

/** Renders top-level components until their accumulated height reaches a limit. */
function renderedHeightUntil(components: Component[], width: number, limit: number): number {
	let height = 0;
	for (const component of components) {
		height += component.render(width).length;
		if (height >= limit) break;
	}
	return height;
}

/** Reads Pi TUI's current SelectList without copying its navigation behavior. */
function getAutocompleteList(editor: CustomEditor): Component | undefined {
	if (!editor.isShowingAutocomplete()) return undefined;

	// Editor currently keeps this field private. Reflect confines that compatibility
	// dependency to one place and lets the normal inline menu remain the fallback.
	const candidate = Reflect.get(editor, "autocompleteList");
	if (!candidate || typeof candidate !== "object") return undefined;
	if (!("render" in candidate) || typeof candidate.render !== "function") return undefined;
	if (!("invalidate" in candidate) || typeof candidate.invalidate !== "function") return undefined;
	return candidate as Component;
}

/** Draws the existing autocomplete SelectList inside a simple floating border. */
class AutocompleteBubble implements Component {
	constructor(
		private readonly editor: CustomEditor,
		private readonly ensureMounted: () => boolean,
	) {}

	render(width: number): string[] {
		if (!this.ensureMounted()) return [];

		const list = getAutocompleteList(this.editor);
		if (!list) return [];
		if (width < 3) return list.render(width);

		const innerWidth = width - 2;
		const border = (text: string) => this.editor.borderColor(text);
		const lines = list.render(innerWidth).map((line) => {
			const content = truncateToWidth(line, innerWidth, "");
			const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
			return `${border("│")}${content}${padding}${border("│")}`;
		});

		return [border(`╭${"─".repeat(innerWidth)}╮`), ...lines, border(`╰${"─".repeat(innerWidth)}╯`)];
	}

	invalidate(): void {
		getAutocompleteList(this.editor)?.invalidate();
	}
}

class FloatingAutocompleteEditor extends CustomEditor {
	private overlay: OverlayHandle | undefined;
	private overlayLayout: OverlayLayout | undefined;
	private disposed = false;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		private readonly keybindingsManager: KeybindingsManager,
	) {
		super(tui, theme, keybindingsManager);
	}

	handleInput(data: string): void {
		const invokesAppAction =
			this.isShowingAutocomplete() &&
			[...this.actionHandlers.keys()].some((action) => this.keybindingsManager.matches(data, action));
		if (invokesAppAction) this.applyOverlayUpdate(undefined);

		super.handleInput(data);
		if (!this.isMounted()) this.applyOverlayUpdate(undefined);
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (this.disposed) return lines;

		const list = getAutocompleteList(this);
		if (!list) {
			this.applyOverlayUpdate(undefined);
			return lines;
		}

		const maxPadding = Math.max(0, Math.floor((width - 1) / 2));
		const paddingX = Math.min(this.getPaddingX(), maxPadding);
		const contentWidth = Math.max(1, width - paddingX * 2);
		const inlineMenuHeight = list.render(contentWidth).length;
		if (inlineMenuHeight === 0 || inlineMenuHeight >= lines.length) {
			this.applyOverlayUpdate(undefined);
			return lines;
		}

		const editorLines = lines.slice(0, -inlineMenuHeight);
		const bubbleWidth = contentWidth;
		const bubbleHeight = bubbleWidth < 3 ? inlineMenuHeight : inlineMenuHeight + 2;
		const editorRow = this.findEditorRow(width, editorLines.length);

		// On very short terminals, retain Pi's inline menu rather than hiding choices.
		if (editorRow === undefined || editorRow < bubbleHeight) {
			this.applyOverlayUpdate(undefined);
			return lines;
		}

		this.applyOverlayUpdate({
			col: paddingX,
			row: editorRow - bubbleHeight,
			width: bubbleWidth,
		});
		return editorLines;
	}

	dispose(): void {
		this.disposed = true;
		this.applyOverlayUpdate(undefined);
	}

	private isMounted(): boolean {
		return this.tui.children.some((root) => containsComponent(root, this));
	}

	private findEditorRow(width: number, editorHeight: number): number | undefined {
		const rootIndex = this.tui.children.findIndex((root) => containsComponent(root, this));
		if (rootIndex < 0) return undefined;

		const rootsBefore = this.tui.children.slice(0, rootIndex);
		const rootsAfter = this.tui.children.slice(rootIndex + 1);
		const afterHeight = rootsAfter.reduce((height, component) => height + component.render(width).length, 0);
		const dockHeight = Math.min(this.tui.terminal.rows, afterHeight + editorHeight);
		const viewportEditorRow = this.tui.terminal.rows - dockHeight;

		if (this.tui.mode === "fullscreen") return viewportEditorRow;

		const beforeHeightNeeded = this.tui.terminal.rows - afterHeight - editorHeight;
		if (beforeHeightNeeded <= 0) return viewportEditorRow;

		const beforeHeight = renderedHeightUntil(rootsBefore, width, beforeHeightNeeded);
		if (beforeHeight >= beforeHeightNeeded) return viewportEditorRow;

		// A regular-mode overlay pads short documents to terminal height. With
		// clear-on-shrink enabled, removing that padding clears terminal scrollback.
		if (this.tui.getClearOnShrink()) return undefined;
		return beforeHeight;
	}

	private ensureOverlayMounted(): boolean {
		if (!this.disposed && this.isMounted()) return true;
		this.applyOverlayUpdate(undefined);
		return false;
	}

	private applyOverlayUpdate(layout: OverlayLayout | undefined): void {
		if (sameLayout(layout, this.overlayLayout)) return;

		this.overlay?.hide();
		this.overlay = undefined;
		this.overlayLayout = layout;
		if (!layout || this.disposed) return;

		this.overlay = this.tui.showOverlay(
			new AutocompleteBubble(this, () => this.ensureOverlayMounted()),
			{
				col: layout.col,
				row: layout.row,
				width: layout.width,
				nonCapturing: true,
			},
		);
	}
}

function sameLayout(left: OverlayLayout | undefined, right: OverlayLayout | undefined): boolean {
	if (!left || !right) return left === right;
	return left.col === right.col && left.row === right.row && left.width === right.width;
}

/** Floats Pi's autocomplete choices above the editor without changing document height. */
export default function floatingAutocompleteExtension(pi: ExtensionAPI): void {
	let editor: FloatingAutocompleteEditor | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			editor = new FloatingAutocompleteEditor(tui, theme, keybindings);
			return editor;
		});
	});

	pi.on("session_shutdown", () => {
		editor?.dispose();
		editor = undefined;
	});
}

interface OverlayLayout {
	col: number;
	row: number;
	width: number;
}
