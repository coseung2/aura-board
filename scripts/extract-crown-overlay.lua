-- Convert a flat-background crown reference into a compact transparent PNG.
-- The background key is sampled from the top-left pixel so both supplied JPGs
-- can use the same deterministic Aseprite pipeline.

local sprite = app.activeSprite
if not sprite then error("Open a crown image before running this script") end

local output = app.params["output"]
local targetWidth = tonumber(app.params["width"])
local tolerance = tonumber(app.params["tolerance"] or "48")
if not output or output == "" then error("Missing output script parameter") end
if not targetWidth then error("Missing width script parameter") end

app.command.ChangePixelFormat { format = "rgb" }

local source = sprite.cels[1].image
local key = source:getPixel(0, 0)
local keyR = app.pixelColor.rgbaR(key)
local keyG = app.pixelColor.rgbaG(key)
local keyB = app.pixelColor.rgbaB(key)
local toleranceSquared = tolerance * tolerance

app.transaction("Remove sampled background", function()
  for _, cel in ipairs(sprite.cels) do
    local image = cel.image:clone()
    for pixel in image:pixels() do
      local value = pixel()
      local dr = app.pixelColor.rgbaR(value) - keyR
      local dg = app.pixelColor.rgbaG(value) - keyG
      local db = app.pixelColor.rgbaB(value) - keyB
      if dr * dr + dg * dg + db * db <= toleranceSquared then
        pixel(app.pixelColor.rgba(0, 0, 0, 0))
      end
    end
    cel.image = image
  end
end)

app.command.AutocropSprite()
local targetHeight = math.max(1, math.floor(sprite.height * targetWidth / sprite.width + 0.5))
app.command.SpriteSize {
  width = targetWidth,
  height = targetHeight,
  method = "nearest-neighbor"
}
sprite:saveCopyAs(output)
