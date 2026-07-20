-- Build an editable Aseprite workbench with the animated slime and both crown
-- overlays on separate layers. The crown positions are only starting guides.

local idlePath = app.params["idle"]
local stage2Path = app.params["stage2"]
local stage3Path = app.params["stage3"]
local output = app.params["output"]

if not idlePath or not stage2Path or not stage3Path or not output then
  error("Missing idle, stage2, stage3, or output script parameter")
end

local sprite = app.open(idlePath)
if not sprite then error("Could not open slime animation") end
app.command.ChangePixelFormat { format = "rgb" }

local baseLayer = sprite.layers[1]
baseLayer.name = "SLIME_BASE"

local function addCrownLayer(name, imagePath, y, visible)
  local crown = Image { fromFile = imagePath }
  if not crown then error("Could not open " .. imagePath) end

  local layer = sprite:newLayer()
  layer.name = name
  layer.isVisible = visible
  local x = math.floor((sprite.width - crown.width) / 2)

  for _, frame in ipairs(sprite.frames) do
    sprite:newCel(layer, frame, crown, Point(x, y))
  end

  return layer
end

addCrownLayer("STAGE_2_CROWN", stage2Path, 14, true)
addCrownLayer("STAGE_3_CROWN", stage3Path, 16, false)

sprite:saveCopyAs(output)
