import { describe, expect, it } from "vitest";
import {
  looksLikeEchoOfPriorAssistant,
  looksLikeEchoOfRecentAssistant,
  looksLikeSpeakerEcho,
} from "./voiceEchoGuard";

describe("voiceEchoGuard", () => {
  it("flags a substring of assistant output as echo", () => {
    const assistant =
      "Désolé, je n'ai pas pu lancer votre briefing car aucune routine de démarrage n'est enregistrée.";
    expect(looksLikeSpeakerEcho("je n'ai pas pu lancer votre", assistant)).toBe(true);
  });

  it("allows clearly new user intent", () => {
    expect(
      looksLikeSpeakerEcho(
        "Oui mets Paris météo et calendrier",
        "Bonsoir, aucune routine enregistrée.",
      ),
    ).toBe(false);
  });

  it("does not drop bourbon request as echo of prior calendar reply", () => {
    const user = "pour demain, pour que j'aille acheter du bourbo";
    const prior = "Je l'ai ajouté à votre calendrier pour demain à midi pour une heure.";
    expect(looksLikeSpeakerEcho(user, prior)).toBe(false);
    expect(looksLikeEchoOfPriorAssistant(user, [prior])).toBe(false);
  });

  it("checks prior assistant lines with acoustic bleed", () => {
    expect(
      looksLikeEchoOfPriorAssistant("je n'ai pas pu lancer votre briefing", [
        "Désolé, je n'ai pas pu lancer votre briefing car aucune routine de démarrage n'est enregistrée.",
      ]),
    ).toBe(true);
  });

  it("checks same-turn streaming with ordered word runs", () => {
    expect(
      looksLikeEchoOfRecentAssistant(
        "qu'une routine de démarrage",
        "",
        ["aucune routine de démarrage n'est enregistrée"],
      ),
    ).toBe(true);
  });
});
