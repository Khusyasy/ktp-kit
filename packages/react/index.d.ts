import type {RefObject, CSSProperties, ReactElement} from "react";
import type {KtpResult, Progress} from "ktp-kit/engine";

export interface KtpCaptureState {
  status: "idle" | "starting" | "searching" | "adjust" | "hold" | "reading" | "done" | "error";
  hint?: string; corners?: number[][] | null; quality?: Record<string, number>; step?: string;
  download?: Progress; offline?: {ready: boolean; bytes: number}; result?: KtpResult; error?: string;
}
export interface KtpCaptureProps {
  base?: string; lang?: "id" | "en"; form?: boolean; upload?: boolean; unstyled?: boolean;
  className?: string; style?: CSSProperties;
  /** Fields plus the straightened card as a JPEG Blob. */
  onResult?: (result: Omit<KtpResult, "card"> & {card: Blob}) => void;
  onStateChange?: (state: KtpCaptureState) => void;
  onError?: (error: {error: string; detail?: unknown}) => void;
}
export function KtpCapture(props: KtpCaptureProps): ReactElement;
export function useKtpCapture(options?: {base?: string; config?: Record<string, unknown>}): {
  videoRef: RefObject<HTMLVideoElement>; state: KtpCaptureState; engine: unknown;
  shoot(): Promise<KtpResult | null>; retake(): void; readFile(file: Blob): Promise<KtpResult | null>;
};
