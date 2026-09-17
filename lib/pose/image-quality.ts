export type ImageQualityConfig = {
  minMeanLuminance: number;
  maxMeanLuminance: number;
  maxDarkFraction: number;
  maxBrightFraction: number;
  minSharpnessScore: number;
};

export const DEFAULT_IMAGE_QUALITY_CONFIG: ImageQualityConfig = {
  minMeanLuminance: 45,
  maxMeanLuminance: 220,
  maxDarkFraction: 0.35,
  maxBrightFraction: 0.35,
  minSharpnessScore: 3.5,
};

export type RgbaImageData = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

export type ImageQualitySnapshot = {
  meanLuminance: number;
  darkFraction: number;
  brightFraction: number;
  sharpnessScore: number;
  lightingAcceptable: boolean;
  blurAcceptable: boolean;
  interpretationBoundary: "engineering-capture-quality-not-measurement-accuracy";
};

/**
 * Lightweight browser calibration heuristic.
 *
 * Luminance and local-gradient sharpness are engineering capture-quality
 * signals only. They do not estimate biomechanical measurement error and must
 * not be presented as empirical measurement uncertainty.
 */
export function analyzeImageQuality(
  image: RgbaImageData,
  config: ImageQualityConfig = DEFAULT_IMAGE_QUALITY_CONFIG,
): ImageQualitySnapshot {
  if (image.width < 2 || image.height < 2 || image.data.length < image.width * image.height * 4) {
    throw new Error("Image-quality analysis requires valid RGBA image data.");
  }

  const luminance = new Float32Array(image.width * image.height);
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let index = 0; index < luminance.length; index += 1) {
    const base = index * 4;
    const value =
      0.2126 * Number(image.data[base]) +
      0.7152 * Number(image.data[base + 1]) +
      0.0722 * Number(image.data[base + 2]);
    luminance[index] = value;
    sum += value;
    if (value <= 20) dark += 1;
    if (value >= 235) bright += 1;
  }

  let gradientSum = 0;
  let gradientCount = 0;
  for (let y = 0; y < image.height - 1; y += 1) {
    for (let x = 0; x < image.width - 1; x += 1) {
      const index = y * image.width + x;
      const gx = Math.abs(luminance[index + 1] - luminance[index]);
      const gy = Math.abs(luminance[index + image.width] - luminance[index]);
      gradientSum += (gx + gy) / 2;
      gradientCount += 1;
    }
  }

  const meanLuminance = sum / luminance.length;
  const darkFraction = dark / luminance.length;
  const brightFraction = bright / luminance.length;
  const sharpnessScore = gradientCount > 0 ? gradientSum / gradientCount : 0;
  const lightingAcceptable =
    meanLuminance >= config.minMeanLuminance &&
    meanLuminance <= config.maxMeanLuminance &&
    darkFraction <= config.maxDarkFraction &&
    brightFraction <= config.maxBrightFraction;

  return {
    meanLuminance,
    darkFraction,
    brightFraction,
    sharpnessScore,
    lightingAcceptable,
    blurAcceptable: sharpnessScore >= config.minSharpnessScore,
    interpretationBoundary: "engineering-capture-quality-not-measurement-accuracy",
  };
}
