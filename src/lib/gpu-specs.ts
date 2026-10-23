/**
 * Calculator presets. Peak dense BF16 TFLOPS (no sparsity) and TDP from
 * vendor datasheets; they are starting points for user-adjustable
 * assumptions, not benchmark results. Verify against the linked datasheet for
 * your exact SKU/form factor.
 */
export interface GpuPreset {
  id: string;
  label: string;
  family: string;
  memoryGb: number;
  peakBf16Tflops: number;
  tdpW: number;
  datasheet: string;
}

export const GPU_PRESETS: GpuPreset[] = [
  { id: "h100-sxm", label: "NVIDIA H100 SXM 80GB", family: "H100", memoryGb: 80, peakBf16Tflops: 989, tdpW: 700, datasheet: "https://www.nvidia.com/en-us/data-center/h100/" },
  { id: "h200-sxm", label: "NVIDIA H200 SXM 141GB", family: "H200", memoryGb: 141, peakBf16Tflops: 989, tdpW: 700, datasheet: "https://www.nvidia.com/en-us/data-center/h200/" },
  { id: "b200", label: "NVIDIA B200", family: "B200", memoryGb: 180, peakBf16Tflops: 2250, tdpW: 1000, datasheet: "https://www.nvidia.com/en-us/data-center/dgx-b200/" },
  { id: "a100-sxm-80", label: "NVIDIA A100 SXM 80GB", family: "A100", memoryGb: 80, peakBf16Tflops: 312, tdpW: 400, datasheet: "https://www.nvidia.com/en-us/data-center/a100/" },
  { id: "l40s", label: "NVIDIA L40S 48GB", family: "L40S", memoryGb: 48, peakBf16Tflops: 362, tdpW: 350, datasheet: "https://www.nvidia.com/en-us/data-center/l40s/" },
  { id: "mi300x", label: "AMD Instinct MI300X 192GB", family: "MI300X", memoryGb: 192, peakBf16Tflops: 1307, tdpW: 750, datasheet: "https://www.amd.com/en/products/accelerators/instinct/mi300/mi300x.html" },
];
