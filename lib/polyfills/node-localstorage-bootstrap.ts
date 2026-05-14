import { installNodeLocalStorageShim } from "@/lib/polyfills/node-localstorage";

/** Only true Node (not Edge / browser); avoids touching globals in wrong runtimes */
const isNodeRuntime =
  typeof window === "undefined" &&
  typeof process !== "undefined" &&
  typeof process.versions?.node === "string";

if (isNodeRuntime) {
  installNodeLocalStorageShim();
}
