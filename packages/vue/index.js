// Vue 3 adapter for ktp-kit.
//   <KtpCapture base="/ktp-kit/" @result="save" />                         ready-made UI (the <ktp-capture> element)
//   const {videoRef, state, shoot, retake, readFile} = useKtpCapture()      headless: build your own UI
import {defineComponent, h, onBeforeUnmount, onMounted, shallowRef} from "vue";
import * as ort from "onnxruntime-web/wasm";
import {createKtpReader, createCapture} from "ktp-kit";
import "ktp-kit/element";

/** Ready-made capture UI. Props: base, lang, form, upload, unstyled. Emits: result, state, error. */
export const KtpCapture = defineComponent({
  name: "KtpCapture",
  props: {base: String, lang: String, form: {type: Boolean, default: true}, upload: {type: Boolean, default: true}, unstyled: Boolean},
  emits: ["result", "state", "error"],
  setup(props, {emit}) {
    // Rendered with h(), so templates need no isCustomElement setting.
    return () => h("ktp-capture", {
      base: props.base, lang: props.lang, form: props.form ? undefined : "false", upload: props.upload ? undefined : "false",
      unstyled: props.unstyled ? "" : undefined,
      onKtpResult: e => emit("result", e.detail), onKtpState: e => emit("state", e.detail), onKtpError: e => emit("error", e.detail),
    });
  },
});

/**
 * Headless capture. Bind `videoRef` to your <video ref="videoRef">, render from `state` (status, hint, corners,
 * quality, download, offline, result, error), call shoot / retake / readFile. Message texts: MESSAGES from "ktp-kit".
 */
export function useKtpCapture({base = "/ktp-kit/", config} = {}) {
  const videoRef = shallowRef(null), state = shallowRef({status: "idle"});
  const engine = createKtpReader({base, ort});
  let capture, off;
  onMounted(() => {
    capture = createCapture({video: videoRef.value, engine, config});
    off = capture.subscribe(s => { state.value = s; });
    capture.start();
  });
  onBeforeUnmount(() => { off?.(); capture?.stop(); });
  return {
    videoRef, state, engine,
    shoot: () => capture?.shoot(),
    retake: () => capture?.retake(),
    readFile: file => capture?.readFile(file),
  };
}
