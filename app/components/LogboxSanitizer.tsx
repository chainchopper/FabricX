import React, { useEffect } from "react";
import { Platform } from "react-native";

export default function LogboxSanitizer() {
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const origError = console.error;
    const origWarn = console.warn;

    const sanitizeArg = (arg: unknown) => {
      // If it's an Error, clone message only; strip problematic stacks
      if (arg instanceof Error) {
        const msg = `${arg.name}: ${arg.message}`;
        const stack = (arg.stack || "").replace(/<anonymous>/g, "anonymous");
        return `${msg}\n${stack}`;
      }
      // Strings with <anonymous>
      if (typeof arg === "string") {
        return arg.replace(/<anonymous>/g, "anonymous");
      }
      return arg;
    };

    // Wrap to sanitize arguments before LogBox/Metro symbolication
    console.error = (...args: unknown[]) => {
      try {
        origError(...args.map(sanitizeArg));
      } catch {
        // fallback
        origError(...args);
      }
    };
    console.warn = (...args: unknown[]) => {
      try {
        origWarn(...args.map(sanitizeArg));
      } catch {
        origWarn(...args);
      }
    };

    return () => {
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);

  return null;
}