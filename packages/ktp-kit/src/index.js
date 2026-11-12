// ktp-kit: read Indonesian KTPs on the user's device. No upload, works offline after the first load.
export {createKtpReader, FILES, VERSION} from "./engine.js";
export {createCapture, DEFAULTS, MESSAGES} from "./capture.js";
export {extractFields, extractNik, nikValid, nikConflicts, Wilayah} from "./ktp.js";
export {parseNik} from "./nik.js";
