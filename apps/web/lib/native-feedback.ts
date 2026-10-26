import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export type PetFeedback = "tap" | "success" | "match";

/** Feedback tátil nativo no app e vibração discreta onde o navegador permitir. */
export async function petFeedback(kind: PetFeedback = "tap") {
  try {
    if (Capacitor.isNativePlatform()) {
      if (kind === "success" || kind === "match") {
        await Haptics.notification({ type: NotificationType.Success });
      } else {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
      return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(kind === "match" ? [18, 35, 24] : kind === "success" ? 16 : 8);
    }
  } catch {
    // Alguns aparelhos não oferecem háptica; o fluxo visual continua normalmente.
  }
}
