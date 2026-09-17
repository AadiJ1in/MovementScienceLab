import { describe, expect, it } from "vitest";
import { analyzeImageQuality } from "./image-quality";

function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      data.set(pixel(x, y), base);
    }
  }
  return { width, height, data };
}

describe("image quality analysis", () => {
  it("rejects a uniformly dark image", () => {
    const result = analyzeImageQuality(image(8, 8, () => [5, 5, 5, 255]));
    expect(result.lightingAcceptable).toBe(false);
    expect(result.darkFraction).toBe(1);
  });

  it("rejects a uniformly bright image", () => {
    const result = analyzeImageQuality(image(8, 8, () => [250, 250, 250, 255]));
    expect(result.lightingAcceptable).toBe(false);
    expect(result.brightFraction).toBe(1);
  });

  it("distinguishes a sharp checkerboard from a flat frame", () => {
    const sharp = analyzeImageQuality(
      image(12, 12, (x, y) => ((x + y) % 2 === 0 ? [70, 70, 70, 255] : [190, 190, 190, 255])),
    );
    const flat = analyzeImageQuality(image(12, 12, () => [130, 130, 130, 255]));
    expect(sharp.lightingAcceptable).toBe(true);
    expect(sharp.blurAcceptable).toBe(true);
    expect(sharp.sharpnessScore).toBeGreaterThan(flat.sharpnessScore);
    expect(flat.blurAcceptable).toBe(false);
  });
});
