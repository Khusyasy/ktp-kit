// React adapter for ktp-kit.
//   <KtpCapture base="/ktp-kit/" onResult={r => save(r)} />               ready-made UI (the <ktp-capture> element)
//   const {videoRef, state, shoot, retake, readFile} = useKtpCapture()      headless: build your own UI
import {createElement, useEffect, useMemo, useRef, useState} from "react";
import * as ort from "onnxruntime-web/wasm";
import {createKtpReader, createCapture} from "ktp-kit";
import "ktp-kit/element";

/** Ready-made capture UI. Props: base, lang ("id" | "en"), form, upload, unstyled, className, style, onResult, onStateChange, onError. */
export function KtpCapture({onResult, onStateChange, onError, base, lang, form = true, upload = true, unstyled, className, style}) {
  const ref = useRef(null), handlers = useRef({});
  handlers.current = {onResult, onStateChange, onError};
  useEffect(() => {
    const el = ref.current;
    const on = (name, key) => { const f = e => handlers.current[key]?.(e.detail); el.addEventListener(name, f); return () => el.removeEventListener(name, f); };
    const offs = [on("ktp-result", "onResult"), on("ktp-state", "onStateChange"), on("ktp-error", "onError")];
    return () => offs.forEach(f => f());
  }, []);
  return createElement("ktp-capture", {ref, base, lang, className, style,
    form: form ? undefined : "false", upload: upload ? undefined : "false", unstyled: unstyled ? "" : undefined});
}

/**
 * Headless capture. Attach `videoRef` to your <video>, render from `state` (status, hint, corners, quality,
 * download, offline, result, error), call shoot / retake / readFile. Message texts: MESSAGES from "ktp-kit".
 */
export function useKtpCapture({base = "/ktp-kit/", config} = {}) {
  const videoRef = useRef(null), [state, setState] = useState({status: "idle"});
  const engine = useMemo(() => createKtpReader({base, ort}), [base]);
  const capture = useRef(null);
  useEffect(() => {
    const c = createCapture({video: videoRef.current, engine, config});
    capture.current = c;
    const off = c.subscribe(setState);
    c.start();
    return () => { off(); c.stop(); };
  }, [engine]);
  return {
    videoRef, state, engine,
    shoot: () => capture.current?.shoot(),
    retake: () => capture.current?.retake(),
    readFile: file => capture.current?.readFile(file),
  };
}
