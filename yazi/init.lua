-- Left-click (tap) the preview of a file to open it; directories keep the default behaviour.
local preview_click = Preview.click
function Preview:click(event, up)
	local hovered = cx.active.current.hovered
	if not up and event.is_left and hovered and not hovered.cha.is_dir then
		ya.emit("open", {})
	else
		preview_click(self, event, up)
	end
end
