import type {DefineComponent, ShallowRef} from "vue";
import type {KtpResult, Progress} from "ktp-kit/engine";

export interface KtpCaptureState {
  status: "idle" | "starting" | "searching" | "adjust" | "hold" | "reading" | "done" | "error";
  hint?: string; corners?: number[][] | null; quality?: Record<string, number>; step?: string;
  download?: Progress; offline?: {ready: boolean; bytes: number}; result?: KtpResult; error?: string;
}
/** Props: base, lang ("id" | "en"), upload, unstyled. Emits: result (fields + card Blob), state, error. */
export const KtpCapture: DefineComponent<{base?: string; lang?: "id" | "en"; upload?: boolean; unstyled?: boolean}>;
export function useKtpCapture(options?: {base?: string; config?: Record<string, unknown>}): {
  videoRef: ShallowRef<HTMLVideoElement | null>; state: ShallowRef<KtpCaptureState>; engine: unknown;
  shoot(): Promise<KtpResult | null>; retake(): void; readFile(file: Blob): Promise<KtpResult | null>;
};
